"""Explainability engine.

Uses SHAP TreeExplainer when the model supports it, automatically
falls back to SHAP KernelExplainer for SVMs, Logistic Regression,
or any non-tree model loaded via joblib.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .common import build_classifier, prepare_split
from .feature_intelligence import detect_proxy_features


def _get_shap_values(model, X_background: pd.DataFrame, X_explain: pd.DataFrame) -> np.ndarray | None:
    """Try TreeExplainer first; fall back to KernelExplainer for non-tree models."""
    try:
        import shap  # type: ignore
    except ImportError:
        return None

    # Try TreeExplainer (works for RF, XGBoost, LightGBM, ExtraTrees, etc.)
    try:
        # Extract the actual estimator if inside a sklearn Pipeline
        estimator = model
        if hasattr(model, "named_steps"):
            estimator = model.named_steps.get("model", model)

        explainer = shap.TreeExplainer(estimator)
        # Transform features through pipeline preprocessor if present
        X_transformed = (
            model.named_steps["preprocessor"].transform(X_explain)
            if hasattr(model, "named_steps") and "preprocessor" in model.named_steps
            else X_explain.to_numpy()
        )
        sv = explainer.shap_values(X_transformed)
        # Binary classifiers return [class0, class1]; take class1
        if isinstance(sv, list) and len(sv) == 2:
            return sv[1]
        return sv
    except Exception:
        pass

    # KernelExplainer fallback (model-agnostic, slower)
    try:
        import shap  # type: ignore

        X_bg_np = (
            model.named_steps["preprocessor"].transform(X_background)
            if hasattr(model, "named_steps") and "preprocessor" in model.named_steps
            else X_background.to_numpy()
        )
        X_ex_np = (
            model.named_steps["preprocessor"].transform(X_explain)
            if hasattr(model, "named_steps") and "preprocessor" in model.named_steps
            else X_explain.to_numpy()
        )
        # Use a small background sample for speed
        bg_sample = shap.sample(X_bg_np, min(50, len(X_bg_np)))

        def predict_fn(data: np.ndarray) -> np.ndarray:
            if hasattr(model, "predict_proba"):
                return model.predict_proba(data)[:, 1]
            return model.predict(data).astype(float)

        explainer = shap.KernelExplainer(predict_fn, bg_sample)
        return explainer.shap_values(X_ex_np, nsamples=100)
    except Exception:
        return None


def explain_flagged_decisions(
    df: pd.DataFrame,
    model,
    sensitive_cols: list[str],
    target_col: str,
    n_samples: int = 5,
) -> list[dict[str, Any]]:
    prepared = prepare_split(df, target_col)
    proxy_result = detect_proxy_features(df, sensitive_cols)
    proxy_features = {item["feature"] for item in proxy_result.get("proxy_features", [])}

    pipeline = model if model is not None else _build_default(prepared)

    sample_limit = min(len(prepared.X_test), max(n_samples * 2, 10))
    test_features = prepared.X_test.reset_index(drop=True).iloc[:sample_limit].copy()
    predictions = pd.Series(pipeline.predict(test_features))
    flagged: list[dict[str, Any]] = []

    # ── Attempt SHAP ─────────────────────────────────────────────────────────
    shap_values = _get_shap_values(pipeline, prepared.X_train, test_features)

    # ── Feature importance fallback via pipeline internals ────────────────────
    feature_scores: dict[str, float] = {}
    model_step = (
        pipeline.named_steps.get("model")
        if hasattr(pipeline, "named_steps")
        else pipeline
    )
    if hasattr(pipeline, "named_steps") and "preprocessor" in pipeline.named_steps:
        try:
            feature_names = pipeline.named_steps["preprocessor"].get_feature_names_out()
            if hasattr(model_step, "feature_importances_"):
                importances = model_step.feature_importances_
                feature_scores = {
                    str(name): float(score)
                    for name, score in zip(feature_names, importances)
                }
            elif hasattr(model_step, "coef_"):
                coefs = np.abs(model_step.coef_)
                coefs = coefs[0] if getattr(coefs, "ndim", 1) > 1 else coefs
                feature_scores = {
                    str(name): float(score)
                    for name, score in zip(feature_names, coefs)
                }
        except Exception:
            pass

    ranked_features = sorted(feature_scores.items(), key=lambda x: x[1], reverse=True)[:3]

    def _build_reasons(row_idx: int) -> list[dict[str, Any]]:
        # Prefer per-record SHAP values
        if shap_values is not None:
            try:
                row_sv = shap_values[row_idx]
                col_names = list(test_features.columns)
                # shap_values may have more columns (after OHE). Use raw cols if mismatch.
                n = min(len(col_names), len(row_sv))
                pairs = sorted(
                    zip(col_names[:n], row_sv[:n].tolist()),
                    key=lambda x: abs(x[1]),
                    reverse=True,
                )[:3]
                return [
                    {
                        "feature": str(name),
                        "shap_value": round(float(val), 4),
                        "is_proxy_risk": name in proxy_features,
                    }
                    for name, val in pairs
                ]
            except Exception:
                pass

        # Fall back to global feature importance
        if ranked_features:
            return [
                {
                    "feature": fname.split("__")[-1],
                    "shap_value": round(score, 4),
                    "is_proxy_risk": fname.split("__")[-1] in proxy_features,
                }
                for fname, score in ranked_features
            ]

        # Final fallback: first 3 raw column names
        return [
            {
                "feature": fname,
                "shap_value": 0.0,
                "is_proxy_risk": fname in proxy_features,
            }
            for fname in list(test_features.columns)[:3]
        ]

    # ── Contrastive (near-identical) flagging ─────────────────────────────────
    for idx in range(min(len(test_features), n_samples * 2)):
        row = test_features.iloc[idx]
        other_rows = test_features.drop(index=idx)
        if other_rows.empty:
            continue
        diffs = other_rows.drop(
            columns=[col for col in sensitive_cols if col in other_rows.columns],
            errors="ignore",
        )
        if diffs.empty:
            continue
        numeric_columns = diffs.select_dtypes(include=[np.number]).columns
        if len(numeric_columns) == 0:
            continue
        distances = diffs[numeric_columns].sub(row[numeric_columns], axis=1).pow(2).sum(axis=1)
        nearest = int(distances.idxmin()) if not distances.empty else idx
        if predictions.iloc[idx] == predictions.iloc[nearest]:
            continue

        top_reasons = _build_reasons(idx)
        has_proxy = any(r["is_proxy_risk"] for r in top_reasons)
        explanation = (
            "This decision differs from a very similar record; proxy features may be influencing the result."
            if has_proxy
            else "The model treats this near-identical case differently, indicating potential bias or threshold sensitivity."
        )
        flagged.append({
            "record_id": int(idx),
            "decision": "approved" if int(predictions.iloc[idx]) == 1 else "rejected",
            "sensitive_attribute": ", ".join(
                f"{col}={row[col]}" for col in sensitive_cols if col in row.index
            ),
            "top_reasons": top_reasons,
            "human_explanation": explanation,
            "explanation_type": "contrastive",
        })
        if len(flagged) >= n_samples:
            break

    # ── Individual fallback if no contrastive pairs found ─────────────────────
    if not flagged:
        for idx in range(min(len(test_features), n_samples, 10)):
            row = test_features.iloc[idx]
            top_reasons = _build_reasons(idx)
            flagged.append({
                "record_id": int(idx),
                "decision": "approved" if int(predictions.iloc[idx]) == 1 else "rejected",
                "sensitive_attribute": ", ".join(
                    f"{col}={row[col]}" for col in sensitive_cols if col in row.index
                ),
                "top_reasons": top_reasons,
                "human_explanation": (
                    "No near-identical contrasting case found. "
                    "Showing top influential features for this individual decision."
                ),
                "explanation_type": "individual",
            })

    return flagged


def _build_default(prepared):
    pipeline = build_classifier(prepared.X_train, model_type="rf")
    pipeline.fit(prepared.X_train, prepared.y_train)
    return pipeline


def generate_narrative_summary(
    flagged_list: list[dict[str, Any]], sensitive_cols: list[str], domain: str
) -> str:
    if not flagged_list:
        return f"No flagged decisions were identified in the {domain} domain analysis."

    proxy_count = sum(
        1 for item in flagged_list
        if any(r.get("is_proxy_risk") for r in item.get("top_reasons", []))
    )
    all_proxy_features = [
        reason.get("feature")
        for item in flagged_list
        for reason in item.get("top_reasons", [])
        if reason.get("is_proxy_risk")
    ]

    if not all_proxy_features:
        return (
            f"Out of {len(flagged_list)} reviewed decisions in the {domain} domain, "
            f"none showed explicit signs of proxy-driven bias. The model decisions appear "
            f"to be based on non-sensitive features with lower correlation to protected attributes."
        )

    from collections import Counter
    top_feature = Counter(all_proxy_features).most_common(1)[0][0]
    sensitive_col = sensitive_cols[0] if sensitive_cols else "sensitive attributes"

    return (
        f"Out of {len(flagged_list)} reviewed decisions in the {domain} domain, "
        f"{proxy_count} showed signs of proxy-driven bias. The most influential feature "
        f"linked to discrimination risk was '{top_feature}', which appears correlated "
        f"with {sensitive_col}. This suggests the model may be using {top_feature} as "
        f"an indirect signal for {sensitive_col} when making decisions."
    )
