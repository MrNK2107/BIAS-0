"""Fix recommendations router.

Owns only POST /fixes/recommend.
The sandbox simulation lives exclusively in routers/sandbox.py.
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Body

from core.auto_fix import generate_fix_recommendations

router = APIRouter(prefix="/fixes", tags=["fixes"])


@router.post("/recommend")
async def recommend_fixes(
    payload: dict = Body(...),
) -> list[dict[str, Any]]:
    """Accept JSON body with audit_result, proxy_result, bias_result keys."""
    audit_result = payload.get("audit_result", {})
    proxy_result = payload.get("proxy_result", {})
    bias_result = payload.get("bias_result", {})
    return generate_fix_recommendations(audit_result, proxy_result, bias_result)
