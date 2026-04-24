from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import pandas as pd
from sqlalchemy.orm import Session

from models.db import MonitoringEvent


def detect_data_drift(baseline_df: pd.DataFrame, current_df: pd.DataFrame, sensitive_cols: list[str], target_col: str) -> dict[str, Any]:
    from scipy import stats
    
    drifted_features = []
    
    # Numeric features drift
    for col in baseline_df.select_dtypes(include=["number"]).columns:
        if col == target_col:
            continue
        if col in current_df.columns:
            stat, p_value = stats.ks_2samp(baseline_df[col].dropna(), current_df[col].dropna())
            if p_value < 0.05:
                drifted_features.append(col)
            
    # Sensitive distribution shift
    sensitive_shift = {}
    drift_alert = False
    for col in sensitive_cols:
        if col in baseline_df.columns and col in current_df.columns:
            baseline_dist = baseline_df[col].value_counts(normalize=True)
            current_dist = current_df[col].value_counts(normalize=True)
            
            # Align indices to ensure correct subtraction
            all_indices = baseline_dist.index.union(current_dist.index)
            baseline_dist = baseline_dist.reindex(all_indices, fill_value=0)
            current_dist = current_dist.reindex(all_indices, fill_value=0)
            
            max_shift = float((baseline_dist - current_dist).abs().max())
            sensitive_shift[col] = round(max_shift, 4)
            if max_shift > 0.1:
                drift_alert = True
                
    if not drift_alert and len(drifted_features) > 2:
        drift_alert = True
        
    drift_message = ""
    if drift_alert:
        drift_message = "Significant data drift detected. Model fairness guarantees may no longer hold."
    elif drifted_features:
        drift_message = f"Minor drift detected in: {', '.join(drifted_features[:3])}."
    else:
        drift_message = "No significant data drift detected."
        
    return {
        "drifted_features": drifted_features,
        "sensitive_distribution_shift": sensitive_shift,
        "drift_alert": drift_alert,
        "drift_message": drift_message
    }


def log_monitoring_event(project_id: int, fairness_score: float, db_session: Session, note: str = "", group_breakdown: dict | None = None) -> MonitoringEvent:
    event = MonitoringEvent(
        project_id=project_id,
        fairness_score=fairness_score,
        alert_triggered=fairness_score < 57,
        note=note,
        group_breakdown=group_breakdown,
        timestamp=datetime.utcnow(),
    )
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)
    return event


def get_monitoring_history(project_id: int, db_session: Session) -> list[dict[str, Any]]:
    rows = (
        db_session.query(MonitoringEvent)
        .filter(MonitoringEvent.project_id == project_id)
        .order_by(MonitoringEvent.timestamp.desc())
        .limit(30)
        .all()
    )
    return [
        {
            "timestamp": row.timestamp,
            "fairness_score": row.fairness_score,
            "alert": row.alert_triggered,
            "note": row.note,
            "group_breakdown": row.group_breakdown,
        }
        for row in rows
    ][::-1]


def check_alert_condition(fairness_score: float, baseline_score: float) -> dict[str, Any]:
    drop = baseline_score - fairness_score
    return {
        "alert": drop > 15,
        "drop": round(drop, 4),
        "message": f"Score dropped {round(drop)} points from baseline." if drop > 15 else "Within tolerance.",
    }
