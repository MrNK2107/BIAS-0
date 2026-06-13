from __future__ import annotations

import warnings
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats

from core.common import utcnow_iso
from repositories import monitoring_event_repo

warnings.filterwarnings("ignore", message="divide by zero encountered")
warnings.filterwarnings("ignore", message="invalid value encountered")


def _psi(expected: np.ndarray, actual: np.ndarray, buckets: int = 10) -> float:
    """Population Stability Index — measures distribution shift between two probability vectors."""
    expected = np.asarray(expected, dtype=float)
    actual = np.asarray(actual, dtype=float)

    # Handle degenerate case: both distributions are constant (all same value)
    if (
        np.all(expected == actual)
        or len(np.unique(expected)) == 1
        and len(np.unique(actual)) == 1
    ):
        return 0.0

    combined = np.concatenate([expected, actual])
    c_min, c_max = float(np.min(combined)), float(np.max(combined))

    # If min == max (all values identical), no shift
    if c_min == c_max:
        return 0.0

    # Create bins with small padding to avoid edge collisions
    bins = np.linspace(c_min, c_max + 1e-10, buckets + 1)

    expected_counts, _ = np.histogram(expected, bins=bins)
    actual_counts, _ = np.histogram(actual, bins=bins)

    # Convert to percentages, add epsilon to avoid log(0)
    eps = 1e-6
    expected_pct = expected_counts / max(expected_counts.sum(), 1) + eps
    actual_pct = actual_counts / max(actual_counts.sum(), 1) + eps

    expected_pct /= expected_pct.sum()
    actual_pct /= actual_pct.sum()

    psi_value = np.sum((actual_pct - expected_pct) * np.log(actual_pct / expected_pct))
    return float(psi_value)


def _jensen_shannon(p: np.ndarray, q: np.ndarray) -> float:
    """Jensen-Shannon divergence — symmetric distribution distance."""
    p = np.asarray(p, dtype=float) + 1e-10
    q = np.asarray(q, dtype=float) + 1e-10
    p /= p.sum()
    q /= q.sum()
    m = 0.5 * (p + q)

    def _kl(a: np.ndarray, b: np.ndarray) -> float:
        return float(np.sum(a * np.log(a / b)))

    return float(0.5 * _kl(p, m) + 0.5 * _kl(q, m))


def detect_data_drift(
    baseline_df: pd.DataFrame,
    current_df: pd.DataFrame,
    sensitive_cols: list[str],
    target_col: str,
) -> dict[str, Any]:
    feature_shifts = []

    # Numeric features drift (KS-test + PSI)
    for col in baseline_df.select_dtypes(include=["number"]).columns:
        if col == target_col:
            continue
        if col in current_df.columns:
            b = baseline_df[col].dropna().values
            c = current_df[col].dropna().values
            if len(b) < 5 or len(c) < 5:
                continue
            stat, p_value = stats.ks_2samp(b, c)
            psi_val = _psi(b, c)
            js_val = _jensen_shannon(b, c)
            feature_shifts.append(
                {
                    "feature": col,
                    "change": round(float(stat), 4),
                    "p_value": float(p_value),
                    "psi": round(psi_val, 4),
                    "js_divergence": round(js_val, 4),
                }
            )

    # Sensitive distribution shift (PSI on proportions)
    sensitive_shift = {}
    affected_groups = []
    for col in sensitive_cols:
        if col in baseline_df.columns and col in current_df.columns:
            baseline_dist = baseline_df[col].value_counts(normalize=True)
            current_dist = current_df[col].value_counts(normalize=True)

            all_indices = baseline_dist.index.union(current_dist.index)
            b_reindexed = baseline_dist.reindex(all_indices, fill_value=0).values
            c_reindexed = current_dist.reindex(all_indices, fill_value=0).values

            max_shift = float(np.max(np.abs(b_reindexed - c_reindexed)))
            psi_val = _psi(b_reindexed, c_reindexed)
            js_val = _jensen_shannon(b_reindexed, c_reindexed)

            sensitive_shift[col] = round(max_shift, 4)

            feature_shifts.append(
                {
                    "feature": col,
                    "change": round(max_shift, 4),
                    "psi": round(psi_val, 4),
                    "js_divergence": round(js_val, 4),
                    "is_sensitive": True,
                }
            )

            if max_shift > 0.05:
                worst_group = str((baseline_dist - current_dist).abs().idxmax())
                affected_groups.append(f"{col} ({worst_group})")

    # Rank features by magnitude of change
    feature_shifts.sort(key=lambda x: x["change"], reverse=True)
    root_cause = feature_shifts[:5]

    # Drift alert: KS p < 0.001 OR PSI > 0.25 OR JS > 0.2
    ks_alert = any(s.get("p_value", 1.0) < 0.001 for s in root_cause)
    psi_alert = any(s.get("psi", 0) > 0.25 for s in root_cause)
    js_alert = any(s.get("js_divergence", 0) > 0.2 for s in root_cause)
    drift_alert = ks_alert or psi_alert or js_alert

    # Generate recommended actions
    recommended_actions = []
    has_sensitive_drift = any(
        s.get("is_sensitive") and s.get("psi", 0) > 0.15 for s in feature_shifts
    )
    has_feature_drift = any(
        not s.get("is_sensitive") and s.get("psi", 0) > 0.20 for s in feature_shifts
    )

    if has_feature_drift:
        recommended_actions.append(
            "Re-train model with recent data to capture new feature distributions."
        )
    if has_sensitive_drift:
        recommended_actions.append(
            "Apply bias mitigation techniques (e.g., reweighing) to address demographic shift."
        )

    if target_col in baseline_df.columns and target_col in current_df.columns:
        b_t = baseline_df[target_col].dropna().values
        c_t = current_df[target_col].dropna().values
        if len(b_t) > 5 and len(c_t) > 5:
            _, pv = stats.ks_2samp(b_t, c_t)
            if pv < 0.01:
                recommended_actions.append(
                    "Check model calibration; output distribution has shifted significantly."
                )

    if drift_alert:
        top_feat = root_cause[0]["feature"] if root_cause else "unknown"
        drift_message = (
            f"Significant data drift detected in '{top_feat}'. "
            f"Fairness guarantees are at risk."
        )
    elif any(s["change"] > 0.05 for s in root_cause):
        drift_message = "Minor feature distribution shift detected."
    else:
        drift_message = "No significant data drift detected."

    return {
        "drift_alert": drift_alert,
        "drift_message": drift_message,
        "root_cause": root_cause,
        "affected_groups": affected_groups,
        "recommended_actions": recommended_actions,
        "sensitive_distribution_shift": sensitive_shift,
    }


def log_monitoring_event(
    project_id: str,
    uid: str,
    fairness_score: float,
    note: str = "",
    group_breakdown: dict | None = None,
) -> str:
    return monitoring_event_repo.create(
        {
            "projectId": project_id,
            "userId": uid,
            "fairnessScore": float(fairness_score),
            "alertTriggered": fairness_score < 57,
            "note": note,
            "groupBreakdown": group_breakdown or {},
            "timestamp": utcnow_iso(),
        }
    )


def get_monitoring_history(project_id: str) -> list[dict[str, Any]]:
    events = monitoring_event_repo.list(
        filters=[("projectId", "==", project_id)],
        order_by=("timestamp", "ASCENDING"),
        limit=50,
    )
    return [
        {
            "timestamp": e.get("timestamp"),
            "fairnessScore": e.get("fairnessScore", 0),
            "alert": e.get("alertTriggered", False),
            "note": e.get("note", ""),
            "group_breakdown": e.get("groupBreakdown", {}),
        }
        for e in events
    ]


def check_alert_condition(
    fairness_score: float, baseline_score: float
) -> dict[str, Any]:
    drop = baseline_score - fairness_score
    return {
        "alert": drop > 15,
        "drop": round(drop, 4),
        "message": (
            f"Score dropped {round(drop)} points from baseline."
            if drop > 15
            else "Within tolerance."
        ),
    }
