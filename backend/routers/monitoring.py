from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.monitoring import check_alert_condition, get_monitoring_history, log_monitoring_event
from models.db import MonitoringEvent, Project, get_db

router = APIRouter(prefix="/monitoring", tags=["monitoring"])


@router.get("/{project_id}")
def monitoring_history(project_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    events = get_monitoring_history(project_id, db)
    baseline = events[0]["fairness_score"] if events else 72
    latest = events[-1]["fairness_score"] if events else baseline
    check = check_alert_condition(latest, baseline)
    trend = "declining" if latest < baseline - 3 else "improving" if latest > baseline + 3 else "stable"
    current_risk_level = "Red" if latest < 50 else "Yellow" if latest < 75 else "Green"
    return {
        "project_id": project_id,
        "events": events,
        "current_risk_level": current_risk_level,
        "trend": trend,
        "alert": check,
    }


@router.post("/{project_id}/simulate")
def simulate_monitoring(project_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    db.query(MonitoringEvent).filter(MonitoringEvent.project_id == project_id).delete()
    db.commit()
    base = 76.0
    for day in range(30):
        fairness = base - day * 0.55 + (1 if day % 7 < 3 else -2) + (0.8 if day < 8 else -0.5)
        note = "Score dropped from baseline." if fairness < base - 15 else ""
        log_monitoring_event(project_id, fairness, db, note=note)
    return monitoring_history(project_id, db)
