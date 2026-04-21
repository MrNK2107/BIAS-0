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
) -> list[dict[str, Any]]:
    """
    Mock endpoint for sandbox simulation. In a real system, this would retrain
    the model with the selected strategies.
    """
    strategy_list = json.loads(strategies)
    
    # Base scenario
    results = [
        {"name": "Original", "accuracy": 0.87, "fairness_score": 42, "risk_level": "Red", "notes": "Baseline"}
    ]
    
    # Mock result generation for the strategies combined
    if strategy_list:
        name = " + ".join(s.replace("remove_", "").replace("_", " ").title() for s in strategy_list)
        # Randomly boost fairness and slightly penalize accuracy
        results.append(
            {"name": name, "accuracy": 0.82, "fairness_score": 79, "risk_level": "Green", "notes": "Simulated result"}
        )
        
    return results
