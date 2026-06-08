from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from google.cloud.firestore import SERVER_TIMESTAMP
from pydantic import BaseModel, Field

from core.auth import require_user, verify_token
from core.common import fairness_score_from_gaps, risk_from_score
from core.monitoring import check_alert_condition, get_monitoring_history_fire, log_monitoring_event_fire
from firebase.repositories import (
    alert_repo,
    flag_repo,
    monitoring_event_repo,
    monitoring_log_repo,
    project_repo,
)


class IngestPrediction(BaseModel):
    record_id: int
    prediction: float
    sensitive_attrs: dict[str, Any]
    timestamp: str


class IngestPayload(BaseModel):
    project_id: str = Field(..., description="Project identifier")
    predictions: list[IngestPrediction]


class FlagPayload(BaseModel):
    project_id: str
    record_id: str
    reason: str


router = APIRouter(prefix="/monitoring", tags=["monitoring"])


@router.get("/{project_id}")
def monitoring_history(
    project_id: str,
    uid: str = Depends(require_user),
) -> dict[str, Any]:
    _check_project_owner(project_id, uid)
    events = get_monitoring_history_fire(project_id)
    baseline = events[0]["fairnessScore"] if events else 72
    latest = events[-1]["fairnessScore"] if events else baseline
    check = check_alert_condition(latest, baseline)
    trend = "declining" if latest < baseline - 3 else "improving" if latest > baseline + 3 else "stable"
    return {
        "project_id": project_id,
        "events": events,
        "current_risk_level": risk_from_score(latest),
        "trend": trend,
        "alert": check,
    }


@router.post("/{project_id}/simulate")
def simulate_monitoring(
    project_id: str,
    uid: str = Depends(require_user),
) -> dict[str, Any]:
    _check_project_owner(project_id, uid)
    monitoring_event_repo.delete_all([("projectId", "==", project_id)])
    base = 76.0
    for day in range(30):
        fairness = base - day * 0.55 + (1 if day % 7 < 3 else -2) + (0.8 if day < 8 else -0.5)
        breakdown = {
            "gender": {"male": round(0.72 + (day % 5) * 0.02, 2), "female": round(0.68 - (day % 3) * 0.03, 2)},
        }
        note = "Score dropped from baseline." if fairness < base - 15 else ""
        log_monitoring_event_fire(project_id, uid, fairness, note=note, group_breakdown=breakdown)
    return monitoring_history(project_id, uid)


@router.post("/ingest")
def ingest_monitoring(
    payload: IngestPayload,
    uid: str = Depends(require_user),
) -> dict[str, Any]:
    project = project_repo.get(payload.project_id)
    sensitive_columns: list[str] = project.get("sensitiveColumns", []) if project else []

    group_rates: dict[str, list[float]] = {}
    for pred in payload.predictions:
        group_key = json.dumps(pred.sensitive_attrs, sort_keys=True)
        group_rates.setdefault(group_key, []).append(float(pred.prediction))
    approval_rates = {k: sum(v) / len(v) for k, v in group_rates.items()}
    rates = list(approval_rates.values())
    dp_gap = max(rates) - min(rates) if rates else 0.0
    gaps = {
        "demographic_parity_difference": dp_gap,
        "equal_opportunity_difference": 0.0,
        "fpr_gap": 0.0,
        "fnr_gap": 0.0,
    }
    fairness_score = fairness_score_from_gaps(gaps)

    breakdown: dict[str, dict[str, float]] = {}
    for attr in sensitive_columns:
        attr_rates: dict[str, list[float]] = {}
        for pred in payload.predictions:
            val = str(pred.sensitive_attrs.get(attr, "unknown"))
            attr_rates.setdefault(val, []).append(float(pred.prediction))
        if attr_rates:
            breakdown[attr] = {k: sum(v) / len(v) for k, v in attr_rates.items()}

    log_monitoring_event_fire(payload.project_id, uid, fairness_score, note="Ingest batch", group_breakdown=breakdown)
    events = get_monitoring_history_fire(payload.project_id)
    baseline = events[0]["fairnessScore"] if events else fairness_score
    latest = events[-1]["fairnessScore"] if events else fairness_score
    alert = check_alert_condition(latest, baseline)
    return {"fairness_score": fairness_score, "alerts": alert}


@router.post("/project/{project_id}/simulate-data")
async def simulate_monitoring_data(
    project_id: str,
    file: UploadFile = File(...),
    uid: str = Depends(require_user),
) -> dict[str, Any]:
    import pandas as pd

    from core.monitoring import detect_data_drift
    from utils.data_io import upload_file_to_dataframe

    project = _check_project_owner(project_id, uid)

    if not project.get("datasetPath"):
        raise HTTPException(status_code=400, detail="Baseline dataset not found for this project")

    # Download baseline from Firebase Storage
    from firebase.client import get_storage_bucket
    bucket = get_storage_bucket()
    blob_name = project["datasetPath"].replace(f"gs://{bucket.name}/", "", 1) if project["datasetPath"].startswith("gs://") else project["datasetPath"]
    baseline_bytes = bucket.blob(blob_name).download_as_bytes()
    baseline_df = pd.read_csv(pd.io.common.BytesIO(baseline_bytes))

    simulation_df = await upload_file_to_dataframe(file)

    drift_results = detect_data_drift(
        baseline_df,
        simulation_df,
        project.get("sensitiveColumns", []),
        project.get("targetColumn", ""),
    )

    avg_shift = sum(drift_results.get("sensitive_distribution_shift", {}).values()) / max(len(project.get("sensitiveColumns", [])), 1)
    predicted_fairness = max(0.0, 80.0 - (avg_shift * 100))

    return {
        "status": "simulation_complete",
        "predicted_fairness": round(predicted_fairness, 1),
        "drift_results": drift_results,
        "is_safe_to_deploy": not drift_results["drift_alert"],
    }


@router.post("/flag")
def create_flag(
    payload: FlagPayload,
    uid: str = Depends(require_user),
) -> dict[str, Any]:
    doc_id = flag_repo.create({
        "projectId": payload.project_id,
        "userId": uid,
        "recordId": payload.record_id,
        "reason": payload.reason,
        "flaggedBy": "user",
        "resolved": False,
        "timestamp": SERVER_TIMESTAMP,
    })
    return {"id": doc_id, "message": "Flag created"}


@router.get("/flags/{project_id}")
def get_unresolved_flags(
    project_id: str,
    uid: str = Depends(require_user),
) -> list[dict[str, Any]]:
    _check_project_owner(project_id, uid)
    flags = flag_repo.list(filters=[
        ("projectId", "==", project_id),
        ("resolved", "==", False),
    ])
    return [
        {
            "id": f.get("id"),
            "record_id": f.get("recordId"),
            "reason": f.get("reason"),
            "flagged_by": f.get("flaggedBy"),
            "timestamp": str(f.get("timestamp", "")),
        }
        for f in flags
    ]


@router.patch("/flag/{flag_id}")
def resolve_flag(
    flag_id: str,
    uid: str = Depends(require_user),
) -> dict[str, Any]:
    flag = flag_repo.get(flag_id)
    if not flag:
        raise HTTPException(status_code=404, detail="Flag not found")
    flag_repo.update(flag_id, {"resolved": True})
    return {"message": "Flag resolved"}


@router.get("/project/{project_id}/monitor")
def get_project_monitoring(
    project_id: str,
    uid: str = Depends(require_user),
) -> dict[str, Any]:
    _check_project_owner(project_id, uid)
    events = monitoring_event_repo.list(
        filters=[("projectId", "==", project_id)],
        order_by=("timestamp", "ASCENDING"),
    )

    trend = [
        {"timestamp": str(e.get("timestamp", "")), "score": e.get("fairnessScore", 0)}
        for e in events
    ]

    drift_detected = False
    if len(events) >= 2:
        latest = events[-1].get("fairnessScore", 0)
        previous = events[-2].get("fairnessScore", 0)
        if previous > 0 and (previous - latest) / previous > 0.15:
            drift_detected = True

    return {"trend": trend, "drift_detected": drift_detected}


@router.get("/logs/{project_id}")
def get_monitoring_logs(
    project_id: str,
    limit: int = 10,
    uid: str = Depends(require_user),
) -> list[dict[str, Any]]:
    _check_project_owner(project_id, uid)
    logs = monitoring_log_repo.list(
        filters=[("projectId", "==", project_id)],
        order_by=("timestamp", "DESCENDING"),
        limit=limit,
    )
    return [
        {
            "id": log.get("id"),
            "timestamp": str(log.get("timestamp", "")),
            "fairness_score": log.get("fairnessScore"),
            "data_drift_score": log.get("dataDriftScore"),
            "prediction_drift_score": log.get("predictionDriftScore"),
            "key_metrics": log.get("keyMetrics", {}),
        }
        for log in logs
    ]


@router.post("/drift")
async def detect_drift(
    baseline_file: UploadFile = File(...),
    current_file: UploadFile = File(...),
    sensitive_cols: str = Form(...),
    target_col: str = Form(...),
    uid: str = Depends(verify_token),
):
    import io

    import pandas as pd

    from core.monitoring import detect_data_drift

    baseline_bytes = await baseline_file.read()
    current_bytes = await current_file.read()
    baseline_df = pd.read_csv(io.BytesIO(baseline_bytes))
    current_df = pd.read_csv(io.BytesIO(current_bytes))
    sensitive_list = [s.strip() for s in sensitive_cols.split(",") if s.strip()]
    return detect_data_drift(baseline_df, current_df, sensitive_list, target_col)


@router.get("/project/{project_id}/trend")
def get_project_trend(
    project_id: str,
    limit: int = 10,
    uid: str = Depends(require_user),
) -> dict[str, Any]:
    import numpy as np

    _check_project_owner(project_id, uid)
    logs = monitoring_log_repo.list(
        filters=[("projectId", "==", project_id)],
        order_by=("timestamp", "DESCENDING"),
        limit=limit,
    )

    if not logs:
        return {"trend": "STABLE", "stability_score": 100.0, "degradation_detected": False}

    scores = [log.get("fairnessScore", 0) for log in reversed(logs)]

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

    if len(scores) < 2:
        stability_score = 100.0
    else:
        std_dev = np.std(scores)
        stability_score = max(0.0, round(100.0 - std_dev, 2))

    degradation_detected = False
    if len(scores) >= 3:
        last_three = scores[-3:]
        if last_three[0] > last_three[1] > last_three[2]:
            degradation_detected = True

    return {
        "trend": trend,
        "stability_score": stability_score,
        "degradation_detected": degradation_detected,
        "recent_scores": scores,
    }


@router.get("/project/{project_id}/alerts")
def get_project_alerts(
    project_id: str,
    uid: str = Depends(require_user),
) -> list[dict[str, Any]]:
    _check_project_owner(project_id, uid)
    alerts = alert_repo.list(
        filters=[("projectId", "==", project_id)],
        order_by=("timestamp", "DESCENDING"),
    )
    return [
        {
            "id": a.get("id"),
            "type": a.get("type"),
            "message": a.get("message"),
            "severity": a.get("severity"),
            "timestamp": str(a.get("timestamp", "")),
        }
        for a in alerts
    ]


def _check_project_owner(project_id: str, uid: str) -> dict[str, Any]:
    project = project_repo.get(project_id)
    if not project or project.get("userId") != uid:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


