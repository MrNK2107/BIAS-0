from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends

from core.auth import require_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/gemini", tags=["gemini"])


@router.post("/narrative")
async def generate_gemini_narrative(
    payload: dict[str, Any],
    uid: str = Depends(require_user),
) -> dict[str, str]:
    audit_result = payload.get("audit_result", {})
    bias_result = payload.get("bias_result", {})

    fairness_score = bias_result.get("fairness_score", 0)
    risk_level = audit_result.get("risk_level", "Unknown")
    under_represented = audit_result.get("under_represented_groups", [])

    parts = []
    parts.append(f"Fairness Score: {fairness_score} — {risk_level} risk.")
    if under_represented:
        parts.append(f"Under-represented groups detected: {', '.join(under_represented[:3])}.")
    else:
        parts.append("No significant under-representation observed.")

    summary = " ".join(parts)
    return {"narrative": summary}
