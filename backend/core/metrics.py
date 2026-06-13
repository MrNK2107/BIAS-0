from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, confusion_matrix

from .data import _drop_nan

# ── Shared Constants ──────────────────────────────────────────────────────

ZERO_GAPS: dict[str, float] = {
    "demographic_parity_difference": 0.0,
    "equal_opportunity_difference": 0.0,
    "fpr_gap": 0.0,
    "fnr_gap": 0.0,
}


# ── Fairness Gaps ────────────────────────────────────────────────────────


def fairness_gaps(
    y_pred: pd.Series, y_true: pd.Series, group: pd.Series
) -> dict[str, float]:
    group_values = group.astype(str).unique()
    approval_rates = []
    tprs = []
    fprs = []
    fnrs = []
    for value in group_values:
        mask = group.astype(str) == value
        group_true, group_pred = _drop_nan(y_true[mask], y_pred[mask])

        if len(group_true) == 0:
            continue

        tn, fp, fn, tp = confusion_matrix(group_true, group_pred, labels=[0, 1]).ravel()
        approval_rates.append(float(np.mean(group_pred)))
        tprs.append(float(tp / max(tp + fn, 1)))
        fprs.append(float(fp / max(fp + tn, 1)))
        fnrs.append(float(fn / max(tp + fn, 1)))
    return {
        "demographic_parity_difference": (
            float(max(approval_rates) - min(approval_rates)) if approval_rates else 0.0
        ),
        "equal_opportunity_difference": float(max(tprs) - min(tprs)) if tprs else 0.0,
        "fpr_gap": float(max(fprs) - min(fprs)) if fprs else 0.0,
        "fnr_gap": float(max(fnrs) - min(fnrs)) if fnrs else 0.0,
    }


# ── Group Metrics ────────────────────────────────────────────────────────


def group_metrics(
    y_true: pd.Series, y_pred: pd.Series, group: pd.Series
) -> dict[str, dict[str, float]]:
    output: dict[str, dict[str, float]] = {}
    for value in group.astype(str).unique():
        mask = group.astype(str) == value
        group_true, group_pred = _drop_nan(y_true[mask], y_pred[mask])

        if len(group_true) == 0:
            continue

        tn, fp, fn, tp = confusion_matrix(group_true, group_pred, labels=[0, 1]).ravel()
        denom_pos = max(tp + fn, 1)
        denom_neg = max(fp + tn, 1)
        output[value] = {
            "approval_rate": float(np.mean(group_pred)),
            "tpr": float(tp / denom_pos),
            "fpr": float(fp / denom_neg),
            "accuracy": float(accuracy_score(group_true, group_pred)),
        }
    return output


# ── Scoring ──────────────────────────────────────────────────────────────

_BALANCED_WEIGHTS: dict[str, float] = {
    "demographic_parity_difference": 30,
    "equal_opportunity_difference": 25,
    "fpr_gap": 20,
    "fnr_gap": 15,
}


def fairness_score_from_gaps(
    gaps: dict[str, float], metric_weights: dict[str, float] | None = None
) -> float:
    if metric_weights is None:
        metric_weights = _BALANCED_WEIGHTS
    raw_penalty = (
        metric_weights.get("demographic_parity_difference", 30)
        * gaps.get("demographic_parity_difference", 0.0)
        + metric_weights.get("equal_opportunity_difference", 25)
        * gaps.get("equal_opportunity_difference", 0.0)
        + metric_weights.get("fpr_gap", 20) * gaps.get("fpr_gap", 0.0)
        + metric_weights.get("fnr_gap", 15) * gaps.get("fnr_gap", 0.0)
    )
    return float(max(0.0, min(100.0, 100.0 - raw_penalty)))


def get_metric_weights(metric_priority: str = "balanced") -> dict[str, float]:
    """Convert metric priority string to weights dictionary."""
    if metric_priority == "equal_opportunity_first":
        return {
            "demographic_parity_difference": 15,
            "equal_opportunity_difference": 45,
            "fpr_gap": 15,
            "fnr_gap": 15,
        }
    elif metric_priority == "demographic_parity_first":
        return {
            "demographic_parity_difference": 45,
            "equal_opportunity_difference": 15,
            "fpr_gap": 15,
            "fnr_gap": 15,
        }
    else:
        return dict(_BALANCED_WEIGHTS)


# ── Correlation ──────────────────────────────────────────────────────────


def top_correlated_feature(
    features: pd.DataFrame, sensitive_cols: list[str]
) -> tuple[str | None, float]:
    best_feature = None
    best_score = 0.0
    for column in features.columns:
        if column in sensitive_cols:
            continue
        for sensitive in sensitive_cols:
            sens_series = features[sensitive] if sensitive in features.columns else None
            if sens_series is None:
                continue
            if pd.api.types.is_numeric_dtype(
                features[column]
            ) and pd.api.types.is_numeric_dtype(sens_series):
                correlation = abs(features[column].corr(sens_series))
            else:
                encoded_feature = pd.factorize(features[column].astype(str))[0]
                encoded_sensitive = pd.factorize(sens_series.astype(str))[0]
                if encoded_feature.size == 0:
                    correlation = 0.0
                else:
                    correlation = abs(
                        pd.Series(encoded_feature).corr(pd.Series(encoded_sensitive))
                    )
            if correlation > best_score:
                best_score = float(correlation if pd.notna(correlation) else 0.0)
                best_feature = column
    return best_feature, best_score
