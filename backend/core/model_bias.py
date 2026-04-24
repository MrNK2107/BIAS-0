from __future__ import annotations

from typing import Any

import joblib
import pandas as pd
import sklearn.metrics
from sklearn.metrics import accuracy_score
from fairlearn.metrics import (
    MetricFrame,
    demographic_parity_difference,
    equalized_odds_difference,
    false_positive_rate,
    true_positive_rate,
)

from .common import build_classifier, fairness_gaps, fairness_score_from_gaps, group_metrics, prepare_split, risk_from_score


def run_model_bias_analysis(
    df: pd.DataFrame,
    sensitive_cols: list[str],
    target_col: str,
    model_path: str | None = None,
    metric_weights: dict[str, float] | None = None,
) -> dict[str, Any]:
    prepared = prepare_split(df, target_col)
    if model_path:
        model = joblib.load(model_path)
        model_used = "user_provided"
        model.fit(prepared.X_train, prepared.y_train)
    else:
        model = build_classifier(prepared.X_train, model_type="rf")
        model.fit(prepared.X_train, prepared.y_train)
        model_used = "built_in_rf"

    y_pred = pd.Series(model.predict(prepared.X_test), index=prepared.y_test.index)
    overall_accuracy = float(accuracy_score(prepared.y_test, y_pred))

    metrics = {"demographic_parity_difference": 0.0, "equal_opportunity_difference": 0.0, "fpr_gap": 0.0, "fnr_gap": 0.0}
    for sensitive in sensitive_cols:
        if sensitive not in df.columns:
            continue
        current_metrics = fairness_gaps(y_pred, prepared.y_test, df.loc[prepared.y_test.index, sensitive])
        for key, value in current_metrics.items():
            metrics[key] = max(metrics[key], value)
    fairness_score = fairness_score_from_gaps(metrics, metric_weights=metric_weights)
    risk_level = risk_from_score(fairness_score)

    group_performance: dict[str, Any] = {}
    for sensitive in sensitive_cols:
        if sensitive not in df.columns:
            continue
        group_series = df.loc[prepared.y_test.index, sensitive]
        group_performance[sensitive] = group_metrics(prepared.y_test, y_pred, group_series)

    # Fairlearn MetricFrame analysis
    fairlearn_metrics: dict[str, Any] = {}
    for sensitive in sensitive_cols:
        if sensitive not in df.columns:
            continue
        sensitive_features = df.loc[prepared.y_test.index, sensitive]
        mf = MetricFrame(
            metrics={
                "accuracy": sklearn.metrics.accuracy_score,
                "tpr": true_positive_rate,
                "fpr": false_positive_rate,
            },
            y_true=prepared.y_test,
            y_pred=y_pred,
            sensitive_features=sensitive_features,
        )
        fairlearn_metrics[sensitive] = {
            "by_group": mf.by_group.to_dict(),
            "overall": mf.overall.to_dict(),
            "difference": mf.difference().to_dict(),
        }

    return {
        "overall_accuracy": round(overall_accuracy, 4),
        "fairness_score": round(fairness_score),
        "risk_level": risk_level,
        "metrics": {key: round(value, 4) for key, value in metrics.items()},
        "group_performance": group_performance,
        "fairlearn_metrics": fairlearn_metrics,
        "model_used": model_used,
    }
