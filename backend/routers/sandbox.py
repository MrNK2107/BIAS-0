"""Sandbox simulation router.

Owns POST /fixes/sandbox exclusively (deduplicated from fixes.py).
Accepts the full field set that AppContext.runSandboxSimulation sends.
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, File, Form, UploadFile

from core.auto_fix import generate_fix_recommendations
from core.common import get_metric_weights
from core.sandbox import run_sandbox_simulation
from utils.data_io import upload_file_to_dataframe

router = APIRouter(prefix="/fixes", tags=["sandbox"])


@router.post("/sandbox")
async def run_sandbox(
    file: UploadFile = File(...),
    sensitiveCols: str = Form(...),
    targetCol: str = Form(...),
    strategies: str = Form(...),
    metric_priority: str = Form(default="balanced"),
    audit_result: str = Form(...),
    proxy_result: str = Form(...),
    bias_result: str = Form(...),
) -> dict[str, Any]:
    df = await upload_file_to_dataframe(file)
    sensitive_list = [item.strip() for item in sensitiveCols.split(",") if item.strip()]
    selected_ids = [s.strip() for s in strategies.split(",") if s.strip()]

    all_recommendations = generate_fix_recommendations(
        json.loads(audit_result),
        json.loads(proxy_result),
        json.loads(bias_result),
    )
    fixes_to_apply = [r for r in all_recommendations if r["fix_id"] in selected_ids]
    metric_weights = get_metric_weights(metric_priority)

    return run_sandbox_simulation(
        df, sensitive_list, targetCol, fixes_to_apply, metric_weights=metric_weights
    )
