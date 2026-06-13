"""Explainability engine.

Uses SHAP TreeExplainer when the model supports it, automatically
falls back to SHAP KernelExplainer for SVMs, Logistic Regression,
or any non-tree model loaded via joblib.
"""

from __future__ import annotations

import logging
from collections import Counter
from typing import Any

import numpy as np
import pandas as pd

from .common import build_and_fit_default, normalize_target_binary, prepare_split
from .feature_intelligence import detect_proxy_features

logger = logging.getLogger(__name__)


def _get_shap_values(
    model, X_background: pd.DataFrame, X_explain: pd.DataFrame
) -> np.ndarray | None:
    """Try TreeExplainer first; fall back to KernelExplainer for non-tree models."""
    try:
        import shap  # type: ignore
    except ImportError:
        return None

    is_pipeline = hasattr(model, "named_steps")
    is_sklearn = hasattr(model, "predict") and hasattr(model, "fit")

    def _extract_estimator(m):
        return m.named_steps.get("model", m) if is_pipeline else m

    def _transform(m, X: pd.DataFrame) -> np.ndarray:
        if is_pipeline and "preprocessor" in m.named_steps:
            return m.named_steps["preprocessor"].transform(X)
        return X.to_numpy()

    # Try TreeExplainer (works for RF, XGBoost, LightGBM, ExtraTrees, etc.)
    if is_sklearn:
        try:
            estimator = _extract_estimator(model)
            explainer = shap.TreeExplainer(estimator)
            X_t = _transform(model, X_explain)
            sv = explainer.shap_values(X_t)
            if isinstance(sv, list) and len(sv) == 2:
                return sv[1]
            return sv
        except Exception as exc:
            logger.debug("TreeExplainer failed, trying KernelExplainer: %s", exc)

    # KernelExplainer fallback (model-agnostic, slower)
    try:
        import shap  # type: ignore

        model_step = _extract_estimator(model)
        X_bg_np = _transform(model, X_background)
        X_ex_np = _transform(model, X_explain)

        n_bg = max(1, min(50, len(X_bg_np)))
        bg_sample = shap.sample(X_bg_np, n_bg)

        def predict_fn(data: np.ndarray) -> np.ndarray:
            if hasattr(model_step, "predict_proba"):
                return model_step.predict_proba(data)[:, 1]
            return model_step.predict(data).astype(float)

        explainer = shap.KernelExplainer(predict_fn, bg_sample)
        return explainer.shap_values(X_ex_np, nsamples=100)
    except Exception as exc:
        logger.debug("KernelExplainer fallback also failed: %s", exc)
        return None


def explain_flagged_decisions(
    df: pd.DataFrame,
    model,
    sensitive_cols: list[str],
    target_col: str,
    n_samples: int = 5,
    proxy_result: dict | None = None,
) -> list[dict[str, Any]]:
    normalize_target_binary(df, target_col)
    prepared = prepare_split(df, target_col)
    if proxy_result is None:
        proxy_result = detect_proxy_features(df, sensitive_cols)
    proxy_features = {
        item["feature"] for item in proxy_result.get("proxy_features", [])
    }

    pipeline = model if model is not None else _build_default(prepared)

    sample_limit = min(len(prepared.X_test), max(n_samples * 2, 10))
    test_features = prepared.X_test.iloc[:sample_limit].copy()
    predictions = pd.Series(pipeline.predict(test_features), index=test_features.index)
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
                    str(name): float(score) for name, score in zip(feature_names, coefs)
                }
        except Exception as exc:
            logger.debug("Feature importance extraction failed: %s", exc)

    ranked_features = sorted(feature_scores.items(), key=lambda x: x[1], reverse=True)[
        :3
    ]

    def _record_id(value: Any) -> int | str:
        try:
            return int(value)
        except (ValueError, TypeError):
            return str(value)

    def _build_reasons(row_pos: int, row: pd.Series) -> list[dict[str, Any]]:
        # Prefer per-record SHAP values
        if shap_values is not None:
            try:
                row_sv = np.asarray(shap_values)[row_pos]
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
            except Exception as exc:
                logger.debug("SHAP row-level extraction failed: %s", exc)

        # Per-record numeric deviation fallback so each record has distinct reasons
        numeric_row = pd.to_numeric(row, errors="coerce").dropna()
        local_reasons: list[tuple[str, float]] = []
        for feature_name, feature_value in numeric_row.items():
            if feature_name not in prepared.X_train.columns:
                continue
            train_col = pd.to_numeric(
                prepared.X_train[feature_name], errors="coerce"
            ).dropna()
            if train_col.empty:
                continue
            center = float(train_col.median())
            spread = float(train_col.std())
            if spread <= 1e-8:
                continue
            score = abs((float(feature_value) - center) / spread)
            if score == score:
                local_reasons.append((str(feature_name), float(score)))

        if local_reasons:
            return [
                {
                    "feature": feature,
                    "shap_value": round(score, 4),
                    "is_proxy_risk": feature in proxy_features,
                }
                for feature, score in sorted(
                    local_reasons, key=lambda x: x[1], reverse=True
                )[:3]
            ]

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
    for row_pos in range(min(len(test_features), n_samples * 2)):
        row = test_features.iloc[row_pos]
        row_idx = test_features.index[row_pos]
        other_rows = test_features.drop(index=row_idx)
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
        distances = (
            diffs[numeric_columns].sub(row[numeric_columns], axis=1).pow(2).sum(axis=1)
        )
        nearest = distances.idxmin() if not distances.empty else row_idx
        if predictions.loc[row_idx] == predictions.loc[nearest]:
            continue

        top_reasons = _build_reasons(row_pos, row)
        has_proxy = any(r["is_proxy_risk"] for r in top_reasons)
        explanation = (
            "This decision differs from a very similar record; proxy features may be influencing the result."
            if has_proxy
            else "The model treats this near-identical case differently, indicating potential bias or threshold sensitivity."
        )
        flagged.append(
            {
                "record_id": _record_id(row_idx),
                "decision": (
                    "approved" if int(predictions.loc[row_idx]) == 1 else "rejected"
                ),
                "sensitive_attribute": ", ".join(
                    f"{col}={row[col]}" for col in sensitive_cols if col in row.index
                ),
                "top_reasons": top_reasons,
                "human_explanation": explanation,
                "explanation_type": "contrastive",
            }
        )
        if len(flagged) >= n_samples:
            break

    # ── Individual fallback if no contrastive pairs found ─────────────────────
    if not flagged:
        for row_pos in range(min(len(test_features), n_samples, 10)):
            row = test_features.iloc[row_pos]
            row_idx = test_features.index[row_pos]
            top_reasons = _build_reasons(row_pos, row)
            flagged.append(
                {
                    "record_id": _record_id(row_idx),
                    "decision": (
                        "approved" if int(predictions.loc[row_idx]) == 1 else "rejected"
                    ),
                    "sensitive_attribute": ", ".join(
                        f"{col}={row[col]}"
                        for col in sensitive_cols
                        if col in row.index
                    ),
                    "top_reasons": top_reasons,
                    "human_explanation": (
                        "No near-identical contrasting case found. "
                        "Showing top influential features for this individual decision."
                    ),
                    "explanation_type": "individual",
                }
            )

    return flagged


def _build_default(prepared):
    return build_and_fit_default(prepared)


def generate_narrative_summary(
    flagged_list: list[dict[str, Any]], sensitive_cols: list[str], domain: str
) -> str:
    if not flagged_list:
        return f"No flagged decisions were identified in the {domain} domain analysis."

    proxy_count = sum(
        1
        for item in flagged_list
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

    top_feature = Counter(all_proxy_features).most_common(1)[0][0]
    sensitive_col = sensitive_cols[0] if sensitive_cols else "sensitive attributes"

    return (
        f"Out of {len(flagged_list)} reviewed decisions in the {domain} domain, "
        f"{proxy_count} showed signs of proxy-driven bias. The most influential feature "
        f"linked to discrimination risk was '{top_feature}', which appears correlated "
        f"with {sensitive_col}. This suggests the model may be using {top_feature} as "
        f"an indirect signal for {sensitive_col} when making decisions."
    )
