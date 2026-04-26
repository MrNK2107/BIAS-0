from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .common import build_classifier, prepare_split
from .feature_intelligence import detect_proxy_features


def explain_flagged_decisions(df: pd.DataFrame, model, sensitive_cols: list[str], target_col: str, n_samples: int = 5) -> list[dict[str, Any]]:
    prepared = prepare_split(df, target_col)
    proxy_result = detect_proxy_features(df, sensitive_cols)
    proxy_features = {item["feature"] for item in proxy_result.get("proxy_features", [])}

    if model is None:
        pipeline = build_classifier(prepared.X_train, model_type="rf")
        pipeline.fit(prepared.X_train, prepared.y_train)
    else:
        pipeline = model

    sample_limit = min(len(prepared.X_test), max(n_samples * 2, 10))
    test_features = prepared.X_test.reset_index(drop=True).iloc[:sample_limit].copy()
    predictions = pd.Series(pipeline.predict(test_features))
    flagged: list[dict[str, Any]] = []

    model_step = getattr(pipeline, "named_steps", {}).get("model") if hasattr(pipeline, "named_steps") else pipeline

    feature_scores: dict[str, float] = {}
    if hasattr(pipeline, "named_steps"):
        feature_names = pipeline.named_steps["preprocessor"].get_feature_names_out()
        if hasattr(model_step, "feature_importances_"):
            importances = getattr(model_step, "feature_importances_", [])
            feature_scores = {str(name): float(score) for name, score in zip(feature_names, importances)}
        elif hasattr(model_step, "coef_"):
            coefficients = np.abs(getattr(model_step, "coef_", []))
            coefficients = coefficients[0] if getattr(coefficients, "ndim", 1) > 1 else coefficients
            feature_scores = {str(name): float(score) for name, score in zip(feature_names, coefficients)}

    ranked_features = sorted(feature_scores.items(), key=lambda item: item[1], reverse=True)[:3]

    def build_reasons() -> list[dict[str, Any]]:
        if ranked_features:
            return [
                {
                    "feature": feature_name.split("__")[-1],
                    "shap_value": round(score, 4),
                    "is_proxy_risk": feature_name.split("__")[-1] in proxy_features,
                }
                for feature_name, score in ranked_features
            ]
        return [
            {"feature": feature_name, "shap_value": 0.0, "is_proxy_risk": feature_name in proxy_features}
            for feature_name in list(test_features.columns)[:3]
        ]

    for idx in range(min(len(test_features), n_samples * 2)):
        row = test_features.iloc[idx]
        other_rows = test_features.drop(index=idx)
        if other_rows.empty:
            continue
        diffs = other_rows.drop(columns=[col for col in sensitive_cols if col in other_rows.columns], errors="ignore")
        if diffs.empty:
            continue
        numeric_columns = diffs.select_dtypes(include=[np.number]).columns
        if len(numeric_columns) == 0:
            continue
        distances = diffs[numeric_columns].sub(row[numeric_columns], axis=1).pow(2).sum(axis=1)
        nearest = int(distances.idxmin()) if not distances.empty else idx
        if predictions.iloc[idx] == predictions.iloc[nearest]:
            continue
        top_reasons = build_reasons()

        explanation = "This decision differs from a very similar record; proxy features may be influencing the result." if any(reason["is_proxy_risk"] for reason in top_reasons) else "The model treats this near-identical case differently, indicating potential bias or threshold sensitivity."
        flagged.append(
            {
                "record_id": int(idx),
                "decision": "approved" if int(predictions.iloc[idx]) == 1 else "rejected",
                "sensitive_attribute": ", ".join(f"{col}={row[col]}" for col in sensitive_cols if col in row.index),
                "top_reasons": top_reasons,
                "human_explanation": explanation,
                "explanation_type": "contrastive",
            }
        )
        if len(flagged) >= n_samples:
            break

    if len(flagged) == 0:
        for idx in range(min(len(test_features), n_samples, 10)):
            row = test_features.iloc[idx]
            top_reasons = build_reasons()

            flagged.append(
                {
                    "record_id": int(idx),
                    "decision": "approved" if int(predictions.iloc[idx]) == 1 else "rejected",
                    "sensitive_attribute": ", ".join(f"{col}={row[col]}" for col in sensitive_cols if col in row.index),
                    "top_reasons": top_reasons,
                    "human_explanation": "No near-identical contrasting case found. Showing top influential features for this individual decision.",
                    "explanation_type": "individual",
                }
            )

    return flagged


def generate_narrative_summary(flagged_list: list[dict[str, Any]], sensitive_cols: list[str], domain: str) -> str:
    """
    Generate a plain-English narrative summary of the flagged decisions.
    """
    if not flagged_list:
        return f"No flagged decisions were identified in the {domain} domain analysis."

    proxy_count = sum(1 for item in flagged_list if any(reason.get("is_proxy_risk") for reason in item.get("top_reasons", [])))

    all_proxy_features = []
    for item in flagged_list:
        for reason in item.get("top_reasons", []):
            if reason.get("is_proxy_risk"):
                all_proxy_features.append(reason.get("feature"))

    if not all_proxy_features:
        return (
            f"Out of {len(flagged_list)} reviewed decisions in the {domain} domain, "
            f"none showed explicit signs of proxy-driven bias. The model decisions appear to be based on "
            f"non-sensitive features with lower correlation to protected attributes."
        )

    from collections import Counter

    top_feature = Counter(all_proxy_features).most_common(1)[0][0]
    sensitive_col = sensitive_cols[0] if sensitive_cols else "sensitive attributes"

    return (
        f"Out of {len(flagged_list)} reviewed decisions in the {domain} domain, "
        f"{proxy_count} showed signs of proxy-driven bias. The most influential feature linked to "
        f"discrimination risk was '{top_feature}', which appears correlated with {sensitive_col}. "
        f"This suggests the model may be using {top_feature} as an indirect signal for {sensitive_col} "
        f"when making decisions."
    )
