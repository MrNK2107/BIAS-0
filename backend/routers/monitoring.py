from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy.orm import Session

from core.monitoring import check_alert_condition, get_monitoring_history, log_monitoring_event
from core.common import fairness_score_from_gaps
from models.db import MonitoringEvent, Project, FairnessFlag, MonitoringLog, Alert, get_db
from fastapi import HTTPException
import json
from pydantic import BaseModel, Field
from typing import List, Dict, Any

class IngestPrediction(BaseModel):
    record_id: int
    prediction: float
    sensitive_attrs: Dict[str, Any]
    timestamp: str

class IngestPayload(BaseModel):
    project_id: int = Field(..., description="Project identifier")
    predictions: List[IngestPrediction]


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
        # Dummy breakdown for simulation
        breakdown = {
            "gender": {"male": round(0.72 + (day % 5) * 0.02, 2), "female": round(0.68 - (day % 3) * 0.03, 2)},
            "caste": {"general": 0.75, "sc": round(0.70 - (day % 4) * 0.01, 2)}
        }
        note = "Score dropped from baseline." if fairness < base - 15 else ""
        log_monitoring_event(project_id, fairness, db, note=note, group_breakdown=breakdown)
    return monitoring_history(project_id, db)

@router.post("/ingest")
def ingest_monitoring(payload: IngestPayload, db: Session = Depends(get_db)) -> dict[str, Any]:
    # Compute approval rate per sensitive group
    group_rates: Dict[str, list[float]] = {}
    for pred in payload.predictions:
        group_key = json.dumps(pred.sensitive_attrs, sort_keys=True)
        group_rates.setdefault(group_key, []).append(float(pred.prediction))
    approval_rates = {k: sum(v) / len(v) for k, v in group_rates.items()}
    # Compute demographic parity gap
    rates = list(approval_rates.values())
    dp_gap = max(rates) - min(rates) if rates else 0.0
    gaps = {
        "demographic_parity_difference": dp_gap,
        "equal_opportunity_difference": 0.0,
        "fpr_gap": 0.0,
        "fnr_gap": 0.0,
    }
    # Fairness score
    fairness_score = fairness_score_from_gaps(gaps)

    # Compute group breakdown per individual attribute
    breakdown: Dict[str, Dict[str, float]] = {}
    for attr in ["gender", "caste"]: # Simplified for now, or use project's sensitive_cols
        attr_rates: Dict[str, list[float]] = {}
        for pred in payload.predictions:
            val = str(pred.sensitive_attrs.get(attr, "unknown"))
            attr_rates.setdefault(val, []).append(float(pred.prediction))
        if attr_rates:
            breakdown[attr] = {k: sum(v) / len(v) for k, v in attr_rates.items()}

    # Log event
    log_monitoring_event(payload.project_id, fairness_score, db, note="Ingest batch", group_breakdown=breakdown)
    # Check alerts based on latest vs baseline
    events = get_monitoring_history(payload.project_id, db)
    baseline = events[0]["fairness_score"] if events else fairness_score
    latest = events[-1]["fairness_score"] if events else fairness_score
    alert = check_alert_condition(latest, baseline)
    return {"fairness_score": fairness_score, "alerts": alert}


@router.post("/project/{project_id}/simulate-data")
async def simulate_monitoring_data(
    project_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
) -> dict[str, Any]:
    from core.common import upload_file_to_dataframe
    from core.monitoring import detect_data_drift
    import pandas as pd
    import os

    # 1. Fetch project info
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # 2. Load baseline dataset
    if not project.dataset_path or not os.path.exists(project.dataset_path):
        raise HTTPException(status_code=400, detail="Baseline dataset not found for this project")
    
    baseline_df = pd.read_csv(project.dataset_path)
    
    # 3. Load simulation dataset
    simulation_df = await upload_file_to_dataframe(file)

    # 4. Detect Drift
    drift_results = detect_data_drift(
        baseline_df, 
        simulation_df, 
        project.sensitive_columns, 
        project.target_column
    )

    # 5. Simple fairness prediction (proxy)
    # Since we don't have the full model running here, we'll estimate fairness based on DP shifts
    avg_shift = sum(drift_results.get("sensitive_distribution_shift", {}).values()) / max(len(project.sensitive_columns), 1)
    predicted_fairness = max(0.0, 80.0 - (avg_shift * 100)) # Base 80 minus shift penalty

    return {
        "status": "simulation_complete",
        "predicted_fairness": round(predicted_fairness, 1),
        "drift_results": drift_results,
        "is_safe_to_deploy": not drift_results["drift_alert"]
    }

# Flagging models and endpoints
class FlagPayload(BaseModel):
    project_id: int
    record_id: str
    reason: str

@router.post("/flag")
def create_flag(payload: FlagPayload, db: Session = Depends(get_db)) -> dict[str, Any]:
    flag = FairnessFlag(
        project_id=payload.project_id,
        record_id=payload.record_id,
        reason=payload.reason,
        flagged_by="user",
    )
    db.add(flag)
    db.commit()
    db.refresh(flag)
    return {"id": flag.id, "message": "Flag created"}

@router.get("/flags/{project_id}")
def get_unresolved_flags(project_id: int, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    flags = db.query(FairnessFlag).filter(FairnessFlag.project_id == project_id, FairnessFlag.resolved == False).all()
    return [
        {
            "id": f.id,
            "record_id": f.record_id,
            "reason": f.reason,
            "flagged_by": f.flagged_by,
            "timestamp": f.timestamp,
        }
        for f in flags
    ]

@router.patch("/flag/{flag_id}")
def resolve_flag(flag_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    flag = db.query(FairnessFlag).filter(FairnessFlag.id == flag_id).first()
    if not flag:
        raise HTTPException(status_code=404, detail="Flag not found")
    flag.resolved = True
    db.commit()
    return {"message": "Flag resolved"}

@router.get("/project/{project_id}/monitor")
def get_project_monitoring(project_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    events = (
        db.query(MonitoringEvent)
        .filter(MonitoringEvent.project_id == project_id)
        .order_by(MonitoringEvent.timestamp.asc())
        .all()
    )
    
    trend = [
        {"timestamp": e.timestamp.isoformat(), "score": e.fairness_score}
        for e in events
    ]
    
    drift_detected = False
    if len(events) >= 2:
        latest = events[-1].fairness_score
        previous = events[-2].fairness_score
        # Drop > 15% relative to previous score
        if previous > 0 and (previous - latest) / previous > 0.15:
            drift_detected = True
            
    return {
        "trend": trend,
        "drift_detected": drift_detected
    }

@router.get("/logs/{project_id}")
def get_monitoring_logs(project_id: int, limit: int = 10, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    logs = (
        db.query(MonitoringLog)
        .filter(MonitoringLog.project_id == project_id)
        .order_by(MonitoringLog.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": log.id,
            "timestamp": log.timestamp.isoformat(),
            "fairness_score": log.fairness_score,
            "data_drift_score": log.data_drift_score,
            "prediction_drift_score": log.prediction_drift_score,
            "key_metrics": log.key_metrics,
        }
    ]

@router.get("/project/{project_id}/trend")
def get_project_trend(project_id: int, limit: int = 10, db: Session = Depends(get_db)) -> dict[str, Any]:
    import numpy as np

    logs = (
        db.query(MonitoringLog)
        .filter(MonitoringLog.project_id == project_id)
        .order_by(MonitoringLog.timestamp.desc())
        .limit(limit)
        .all()
    )
    
    if not logs:
        return {
            "trend": "STABLE",
            "stability_score": 100.0,
            "degradation_detected": False
        }

    scores = [log.fairness_score for log in reversed(logs)]
    
    # 1. Compute fairness trend
    if len(scores) < 2:
        trend = "STABLE"
    else:
        diff = scores[-1] - scores[0]
        if diff > 5:
            trend = "UP"
        elif diff < -5:
            trend = "DOWN"
        else:
            trend = "STABLE"

    # 2. Compute stability score (100 - standard deviation)
    if len(scores) < 2:
        stability_score = 100.0
    else:
        std_dev = np.std(scores)
        stability_score = max(0.0, round(100.0 - std_dev, 2))

    # 3. Detect degradation (consistent drop over last 3+ runs)
    degradation_detected = False
    if len(scores) >= 3:
        last_three = scores[-3:]
        if last_three[0] > last_three[1] > last_three[2]:
            degradation_detected = True

    return {
        "trend": trend,
        "stability_score": stability_score,
        "degradation_detected": degradation_detected,
        "recent_scores": scores
    }

@router.get("/project/{project_id}/alerts")
def get_project_alerts(project_id: int, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    alerts = db.query(Alert).filter(Alert.project_id == project_id).order_by(Alert.timestamp.desc()).all()
    return [
        {
            "id": alert.id,
            "type": alert.type,
            "message": alert.message,
            "severity": alert.severity,
            "timestamp": alert.timestamp.isoformat(),
        }
        for alert in alerts
    ]
