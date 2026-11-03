from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, confusion_matrix

from .data import _drop_nan, group_labels

# ── Shared Constants ──────────────────────────────────────────────────────

ZERO_GAPS: dict[str, float] = {
    "demographic_parity_difference": 0.0,
    "equal_opportunity_difference": 0.0,
    "fpr_gap": 0.0,
    "fnr_gap": 0.0,
}


# ── Fairness Gaps ────────────────────────────────────────────────────────


def _confusion_counts(
    y_true: np.ndarray, y_pred: np.ndarray
) -> tuple[int, int, int, int]:
    """(tn, fp, fn, tp) for binary 0/1 labels; same as sklearn's confusion_matrix
    with labels=[0, 1] but without its per-call validation overhead (this runs
    thousands of times inside bootstrap / permutation tests)."""
    t1 = y_true == 1
    t0 = y_true == 0
    p1 = y_pred == 1
    p0 = y_pred == 0
    return (
        int(np.sum(t0 & p0)),
        int(np.sum(t0 & p1)),
        int(np.sum(t1 & p0)),
        int(np.sum(t1 & p1)),
    )


def _iter_group_arrays(y_true: pd.Series, y_pred: pd.Series, group: pd.Series):
    """Yield (y_true, y_pred) numpy arrays per group, NaN rows removed."""
    if y_true.index.equals(group.index) and y_pred.index.equals(group.index):
        g = group_labels(group).to_numpy()
        yt = pd.to_numeric(y_true, errors="coerce").to_numpy(dtype=float)
        yp = pd.to_numeric(y_pred, errors="coerce").to_numpy(dtype=float)
        valid = ~(np.isnan(yt) | np.isnan(yp))
        for value in pd.unique(g):
            m = (g == value) & valid
            if m.any():
                yield yt[m], yp[m]
        return
    # Fallback: label-aligned indexing (indexes differ between inputs)
    group_str = group_labels(group)
    for value in group_str.unique():
        mask = group_str == value
        group_true, group_pred = _drop_nan(y_true[mask], y_pred[mask])
        if len(group_true) == 0:
            continue
        yield group_true.to_numpy(dtype=float), group_pred.to_numpy(dtype=float)


def _spread(values: np.ndarray) -> float:
    return float(values.max() - values.min()) if values.size else 0.0


def _fairness_gaps_vectorized(
    y_pred: pd.Series, y_true: pd.Series, group: pd.Series
) -> dict[str, float]:
    """Same result as the per-group loop in ``fairness_gaps``, in O(n) with
    bincount. The loop was O(n * groups): with a near-unique sensitive column
    (~3700 zip codes) the 3000 bootstrap/permutation calls took ~3 minutes."""
    codes, uniques = pd.factorize(group_labels(group).to_numpy())
    yt = pd.to_numeric(y_true, errors="coerce").to_numpy(dtype=float)
    yp = pd.to_numeric(y_pred, errors="coerce").to_numpy(dtype=float)
    valid = ~(np.isnan(yt) | np.isnan(yp))
    codes, yt, yp = codes[valid], yt[valid], yp[valid]
    k = len(uniques)

    def count(mask: np.ndarray) -> np.ndarray:
        return np.bincount(codes, weights=mask.astype(float), minlength=k)

    n = np.bincount(codes, minlength=k).astype(float)
    pred_sum = np.bincount(codes, weights=yp, minlength=k)
    tp = count((yt == 1) & (yp == 1))
    fn = count((yt == 1) & (yp == 0))
    fp = count((yt == 0) & (yp == 1))
    tn = count((yt == 0) & (yp == 0))
    present = n > 0
    pos = present & (tp + fn > 0)
    neg = present & (fp + tn > 0)
    with np.errstate(divide="ignore", invalid="ignore"):
        tpr = tp[pos] / (tp[pos] + fn[pos])
        fnr = fn[pos] / (tp[pos] + fn[pos])
        fpr = fp[neg] / (fp[neg] + tn[neg])
        approval = pred_sum[present] / n[present]
    return {
        "demographic_parity_difference": _spread(approval),
        "equal_opportunity_difference": _spread(tpr),
        "fpr_gap": _spread(fpr),
        "fnr_gap": _spread(fnr),
    }


def fairness_gaps(
    y_pred: pd.Series, y_true: pd.Series, group: pd.Series
) -> dict[str, float]:
    """Max-minus-min gap across groups for four group-fairness metrics.

    - demographic_parity_difference: spread of P(y_pred=1 | group)
    - equal_opportunity_difference:  spread of TPR = TP / (TP + FN)
    - fpr_gap:                        spread of FPR = FP / (FP + TN)
    - fnr_gap:                        spread of FNR = FN / (TP + FN)

    Equalized odds difference is max(equal_opportunity_difference, fpr_gap).
    Rows where y_true or y_pred is NaN are ignored.
    """
    if y_true.index.equals(group.index) and y_pred.index.equals(group.index):
        return _fairness_gaps_vectorized(y_pred, y_true, group)
    approval_rates: list[float] = []
    tprs: list[float] = []
    fprs: list[float] = []
    fnrs: list[float] = []
    for group_true, group_pred in _iter_group_arrays(y_true, y_pred, group):
        tn, fp, fn, tp = _confusion_counts(group_true, group_pred)
        approval_rates.append(float(np.mean(group_pred)))
        # TPR/FNR are undefined for a group with no actual positives, and FPR
        # for a group with no actual negatives. Skip undefined rates instead of
        # treating them as 0, which would fabricate a large gap.
        if tp + fn > 0:
            tprs.append(float(tp / (tp + fn)))
            fnrs.append(float(fn / (tp + fn)))
        if fp + tn > 0:
            fprs.append(float(fp / (fp + tn)))
    return {
        "demographic_parity_difference": (
            float(max(approval_rates) - min(approval_rates)) if approval_rates else 0.0
        ),
        "equal_opportunity_difference": float(max(tprs) - min(tprs)) if tprs else 0.0,
        "fpr_gap": float(max(fprs) - min(fprs)) if fprs else 0.0,
        "fnr_gap": float(max(fnrs) - min(fnrs)) if fnrs else 0.0,
    }


def equalized_odds_difference(
    y_pred: pd.Series, y_true: pd.Series, group: pd.Series
) -> float:
    """Equalized odds difference: the larger of the TPR gap and the FPR gap.

    Matches ``fairlearn.metrics.equalized_odds_difference`` (method="between_groups").
    """
    gaps = fairness_gaps(y_pred, y_true, group)
    return float(max(gaps["equal_opportunity_difference"], gaps["fpr_gap"]))


def disparate_impact_ratio(y_pred: pd.Series, group: pd.Series) -> float:
    """min / max selection rate across groups (the "four-fifths rule" ratio).

    1.0 means identical approval rates; < 0.8 is the conventional red flag.
    Returns 1.0 when no group has any approvals (nothing to compare).
    """
    pred = pd.Series(y_pred).reset_index(drop=True)
    grp = group_labels(pd.Series(group)).reset_index(drop=True)
    mask = pred.notna()
    rates = pred[mask].astype(float).groupby(grp[mask]).mean()
    if rates.empty or float(rates.max()) == 0.0:
        return 1.0
    return float(rates.min() / rates.max())


# ── Group Metrics ────────────────────────────────────────────────────────


def group_metrics(
    y_true: pd.Series, y_pred: pd.Series, group: pd.Series
) -> dict[str, dict[str, float | None]]:
    output: dict[str, dict[str, float | None]] = {}
    labels = group_labels(group)
    for value in labels.unique():
        mask = labels == value
        group_true, group_pred = _drop_nan(y_true[mask], y_pred[mask])

        if len(group_true) == 0:
            continue

        tn, fp, fn, tp = confusion_matrix(group_true, group_pred, labels=[0, 1]).ravel()
        # TPR is undefined without actual positives and FPR without actual
        # negatives: report None (shown as "n/a"), not a fabricated 0.
        output[value] = {
            "approval_rate": float(np.mean(group_pred)),
            "tpr": float(tp / (tp + fn)) if tp + fn else None,
            "fpr": float(fp / (fp + tn)) if fp + tn else None,
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
