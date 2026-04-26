"""Sandbox simulation router.

Owns POST /fixes/sandbox exclusively (deduplicated from fixes.py).
Accepts the full field set that AppContext.runSandboxSimulation sends.
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, File, Form, UploadFile

from core.auto_fix import generate_fix_recommendations
from core.sandbox import run_sandbox_simulation
from utils.data_io import upload_file_to_dataframe

router = APIRouter(prefix="/fixes", tags=["sandbox"])


def _metric_weights_from_priority(metric_priority: str) -> dict[str, float] | None:
    if metric_priority == "fairness":
        return {
            "demographic_parity_difference": 0.4,
            "equal_opportunity_difference": 0.4,
            "fpr_gap": 0.2,
        }
    if metric_priority == "accuracy":
        return {
            "demographic_parity_difference": 0.1,
            "equal_opportunity_difference": 0.1,
            "fpr_gap": 0.1,
        }
    return None  # balanced / default


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
    metric_weights = _metric_weights_from_priority(metric_priority)

    return run_sandbox_simulation(
        df, sensitive_list, targetCol, fixes_to_apply, metric_weights=metric_weights
    )
