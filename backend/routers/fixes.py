from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Form, UploadFile, File

from core.auto_fix import generate_fix_recommendations

router = APIRouter(prefix="/fixes", tags=["fixes"])


@router.post("/recommend")
async def recommend_fixes(
    audit_result: str = Form(...),
    proxy_result: str = Form(...),
    bias_result: str = Form(...),
) -> list[dict[str, Any]]:
    return generate_fix_recommendations(json.loads(audit_result), json.loads(proxy_result), json.loads(bias_result))


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
    from core.sandbox import run_sandbox_simulation
    from core.common import upload_file_to_dataframe
    
    df = await upload_file_to_dataframe(file)
    sensitive_list = [item.strip() for item in sensitiveCols.split(",") if item.strip()]
    selected_ids = [s.strip() for s in strategies.split(",") if s.strip()]
    
    # Get all recommendations to find the full fix objects
    all_recommendations = generate_fix_recommendations(
        json.loads(audit_result), 
        json.loads(proxy_result), 
        json.loads(bias_result)
    )
    
    fixes_to_apply = [r for r in all_recommendations if r["fix_id"] in selected_ids]
    
    # Define metric weights based on priority
    metric_weights = None
    if metric_priority == "fairness":
        metric_weights = {"demographic_parity_difference": 0.4, "equal_opportunity_difference": 0.4, "fpr_gap": 0.2}
    elif metric_priority == "accuracy":
         metric_weights = {"demographic_parity_difference": 0.1, "equal_opportunity_difference": 0.1, "fpr_gap": 0.1}
         
    return run_sandbox_simulation(df, sensitive_list, targetCol, fixes_to_apply, metric_weights=metric_weights)
