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
