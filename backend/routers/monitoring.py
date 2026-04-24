from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy.orm import Session

from core.monitoring import check_alert_condition, get_monitoring_history, log_monitoring_event
from core.common import fairness_score_from_gaps
from models.db import MonitoringEvent, Project, FairnessFlag, get_db
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


@router.post("/drift")
async def monitoring_drift(
    baseline_file: UploadFile = File(...),
    current_file: UploadFile = File(...),
    sensitive_cols: str = Form(...),
    target_col: str = Form(...),
) -> dict[str, Any]:
    from core.common import upload_file_to_dataframe
    from core.monitoring import detect_data_drift
    
    baseline_df = await upload_file_to_dataframe(baseline_file)
    current_df = await upload_file_to_dataframe(current_file)
    sensitive_list = [item.strip() for item in sensitive_cols.split(",") if item.strip()]
    
    return detect_data_drift(baseline_df, current_df, sensitive_list, target_col)

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

