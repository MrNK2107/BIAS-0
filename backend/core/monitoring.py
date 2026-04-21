from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from models.db import MonitoringEvent


def log_monitoring_event(project_id: int, fairness_score: float, db_session: Session, note: str = "") -> MonitoringEvent:
    event = MonitoringEvent(
        project_id=project_id,
        fairness_score=fairness_score,
        alert_triggered=fairness_score < 57,
        note=note,
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
