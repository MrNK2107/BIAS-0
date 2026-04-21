from __future__ import annotations

from typing import Any

import pandas as pd
from sklearn.metrics import accuracy_score

from .common import build_classifier, fairness_gaps, fairness_score_from_gaps, prepare_split


def run_counterfactual_test(df: pd.DataFrame, model, sensitive_col: str, target_col: str) -> dict[str, Any]:
    prepared = prepare_split(df, target_col)
    pipeline = model or build_classifier(prepared.X_train, model_type="rf")
    pipeline.fit(prepared.X_train, prepared.y_train)
    y_pred = pd.Series(pipeline.predict(prepared.X_test), index=prepared.y_test.index)
    baseline_accuracy = float(accuracy_score(prepared.y_test, y_pred))
    baseline_gaps = fairness_gaps(y_pred, prepared.y_test, df.loc[prepared.y_test.index, sensitive_col]) if sensitive_col in df.columns else {"demographic_parity_difference": 0.0, "equal_opportunity_difference": 0.0, "fpr_gap": 0.0}
    baseline_score = fairness_score_from_gaps(baseline_gaps)

    flip_breakdown: dict[str, dict[str, float]] = {}
    sensitive_values = list(df[sensitive_col].dropna().astype(str).unique()) if sensitive_col in df.columns else []
    total_flips = 0
    total_records = 0

    for original_value in sensitive_values:
        for flipped_value in sensitive_values:
            if original_value == flipped_value:
                continue
            subset = prepared.X_test[prepared.X_test[sensitive_col].astype(str) == original_value].copy() if sensitive_col in prepared.X_test.columns else pd.DataFrame()
            if subset.empty:
                continue
            flipped = subset.copy()
            flipped[sensitive_col] = flipped_value
            original_pred = pipeline.predict(subset)
            flipped_pred = pipeline.predict(flipped)
            flips = int((original_pred != flipped_pred).sum())
            total = int(len(subset))
            total_flips += flips
            total_records += total
            flip_breakdown[f"{original_value}_to_{flipped_value}"] = {
                "flips": flips,
                "total": total,
                "rate": round(flips / max(total, 1), 4),
            }

    flip_rate = float(total_flips / max(total_records, 1)) if total_records else 0.0
    counterfactual_fairness_score = round(100 * (1 - flip_rate))
    return {
        "sensitive_col": sensitive_col,
        "flip_rate": round(flip_rate, 4),
        "counterfactual_fairness_score": counterfactual_fairness_score,
        "flip_breakdown": flip_breakdown,
        "interpretation": f"In {round(flip_rate * 100)}% of cases, changing {sensitive_col} alone flips the model decision — indicating the model is not counterfactually fair with respect to {sensitive_col}.",
        "baseline": {"fairness_score": round(baseline_score), "accuracy": round(baseline_accuracy, 4)},
    }
