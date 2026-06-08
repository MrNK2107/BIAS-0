from __future__ import annotations

from typing import Any

import pandas as pd
from google.cloud.firestore import SERVER_TIMESTAMP

from firebase.repositories import monitoring_event_repo


def detect_data_drift(baseline_df: pd.DataFrame, current_df: pd.DataFrame, sensitive_cols: list[str], target_col: str) -> dict[str, Any]:
    from scipy import stats

    feature_shifts = []

    # Numeric features drift
    for col in baseline_df.select_dtypes(include=["number"]).columns:
        if col == target_col:
            continue
        if col in current_df.columns:
            stat, p_value = stats.ks_2samp(baseline_df[col].dropna(), current_df[col].dropna())
            feature_shifts.append({
                "feature": col,
                "change": round(float(stat), 4),
                "p_value": float(p_value),
            })

    # Sensitive distribution shift
    sensitive_shift = {}
    affected_groups = []
    for col in sensitive_cols:
        if col in baseline_df.columns and col in current_df.columns:
            baseline_dist = baseline_df[col].value_counts(normalize=True)
            current_dist = current_df[col].value_counts(normalize=True)

            all_indices = baseline_dist.index.union(current_dist.index)
            baseline_dist = baseline_dist.reindex(all_indices, fill_value=0)
            current_dist = current_dist.reindex(all_indices, fill_value=0)

            diffs = (baseline_dist - current_dist).abs()
            max_shift = float(diffs.max())
            sensitive_shift[col] = round(max_shift, 4)

            feature_shifts.append({
                "feature": col,
                "change": round(max_shift, 4),
                "is_sensitive": True,
            })

            if max_shift > 0.05:
                worst_group = str(diffs.idxmax())
                affected_groups.append(f"{col} ({worst_group})")

    # Rank features by magnitude of change
    feature_shifts.sort(key=lambda x: x["change"], reverse=True)
    root_cause = feature_shifts[:3]

    drift_alert = any(s["change"] > 0.15 for s in root_cause) or any(s.get("p_value", 1.0) < 0.001 for s in root_cause)

    # Generate automatic recommended actions
    recommended_actions = []
    has_sensitive_drift = any(s.get("is_sensitive") and s["change"] > 0.08 for s in feature_shifts)
    has_feature_drift = any(not s.get("is_sensitive") and s["change"] > 0.12 for s in feature_shifts)

    if has_feature_drift:
        recommended_actions.append("Re-train model with recent data to capture new feature distributions.")
    if has_sensitive_drift:
        recommended_actions.append("Apply bias mitigation techniques (e.g., reweighing) to address demographic shift.")

    # Check for prediction drift if target_col exists in both
    if target_col in baseline_df.columns and target_col in current_df.columns:
        stat, p_value = stats.ks_2samp(baseline_df[target_col].dropna(), current_df[target_col].dropna())
        if p_value < 0.01:
            recommended_actions.append("Check model calibration; output distribution has shifted significantly.")

    drift_message = ""
    if drift_alert:
        top_feat = root_cause[0]["feature"] if root_cause else "unknown"
        drift_message = f"Significant data drift detected in '{top_feat}'. Fairness guarantees are at risk."
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


def log_monitoring_event_fire(
    project_id: str,
    uid: str,
    fairness_score: float,
    note: str = "",
    group_breakdown: dict | None = None,
) -> str:
    return monitoring_event_repo.create({
        "projectId": project_id,
        "userId": uid,
        "fairnessScore": float(fairness_score),
        "alertTriggered": fairness_score < 57,
        "note": note,
        "groupBreakdown": group_breakdown or {},
        "timestamp": SERVER_TIMESTAMP,
    })


def get_monitoring_history_fire(project_id: str) -> list[dict[str, Any]]:
    events = monitoring_event_repo.list(
        filters=[("projectId", "==", project_id)],
        order_by=("timestamp", "ASCENDING"),
        limit=30,
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


def check_alert_condition(fairness_score: float, baseline_score: float) -> dict[str, Any]:
    drop = baseline_score - fairness_score
    return {
        "alert": drop > 15,
        "drop": round(drop, 4),
        "message": f"Score dropped {round(drop)} points from baseline." if drop > 15 else "Within tolerance.",
    }
