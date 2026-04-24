from __future__ import annotations

from typing import Any

import pandas as pd
from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from core.data_audit import run_data_audit
from core.feature_intelligence import detect_proxy_features
from models.db import AuditRun, get_db
from utils.data_io import upload_file_to_dataframe

router = APIRouter(prefix="/audit", tags=["audit"])


@router.post("/data")
async def audit_data(
    project_id: int = Form(...),
    sensitive_cols: str = Form(...),
    target_col: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    df = await upload_file_to_dataframe(file)
    sensitive_list = [item.strip() for item in sensitive_cols.split(",") if item.strip()]
    result = run_data_audit(df, sensitive_list, target_col)
    audit_run = AuditRun(project_id=project_id, fairness_score=0.0, risk_level=result["risk_level"], results_json=result)
    db.add(audit_run)
    db.commit()
    db.refresh(audit_run)
    return result


@router.post("/proxy")
async def audit_proxy(
    sensitive_cols: str = Form(...),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    df = await upload_file_to_dataframe(file)
    sensitive_list = [item.strip() for item in sensitive_cols.split(",") if item.strip()]
    return detect_proxy_features(df, sensitive_list)

def get_primary_bias_type(audit_result: dict, proxy_result: dict, bias_result: dict) -> dict[str, Any] | None:
    issues = []
    if proxy_result.get("proxy_features"):
        top = proxy_result["proxy_features"][0]
        issues.append({
            "type": "Proxy Leakage",
            "detail": f"{top['feature']} correlates with {top['correlated_with']} (score: {top['proxy_score']})",
            "severity": top["proxy_score"]
        })
    if audit_result.get("under_represented_groups"):
        issues.append({
            "type": "Representation Bias",
            "detail": f"Groups {audit_result['under_represented_groups']} are under-represented in training data",
            "severity": 0.6
        })
    
    metrics = bias_result.get("metrics", {})
    dpd = metrics.get("demographic_parity_difference", 0)
    if dpd > 0.2:
        issues.append({
            "type": "Outcome Disparity",
            "detail": f"Approval rate gap of {round(dpd*100)}% between groups",
            "severity": dpd
        })
    
    issues.sort(key=lambda x: x["severity"], reverse=True)
    return issues[0] if issues else None

@router.post("/summary")
async def audit_summary(
    audit_result: str = Form(...),
    proxy_result: str = Form(...),
    bias_result: str = Form(...),
) -> dict[str, Any] | None:
    import json
    return get_primary_bias_type(
        json.loads(audit_result),
        json.loads(proxy_result),
        json.loads(bias_result)
    )
