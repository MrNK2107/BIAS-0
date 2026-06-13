"""Fix recommendations router.

Owns only POST /fixes/recommend.
The sandbox simulation lives exclusively in routers/sandbox.py.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends

from core.auth import require_user
from core.auto_fix import generate_fix_recommendations
from core.deps import require_project

router = APIRouter(prefix="/fixes", tags=["fixes"])


@router.post("/recommend")
async def recommend_fixes(
    payload: dict = Body(...),
    uid: str = Depends(require_user),
) -> list[dict[str, Any]]:
    project_id = payload.get("project_id", "")
    await require_project(project_id, uid)
    audit_result = payload.get("audit_result", {})
    proxy_result = payload.get("proxy_result", {})
    bias_result = payload.get("bias_result", {})
    return generate_fix_recommendations(audit_result, proxy_result, bias_result)
