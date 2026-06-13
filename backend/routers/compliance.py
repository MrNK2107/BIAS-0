"""Compliance assessment router — maps fairness audit results to regulatory frameworks."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from core.auth import require_user
from core.compliance import assess_compliance
from core.deps import require_project
from core.remediation_narratives import generate_compliance_narrative
from repositories import compliance_repo

router = APIRouter(prefix="/compliance", tags=["compliance"])


class ComplianceRequest(BaseModel):
    project_id: str
    fairness_score: float = Field(..., ge=0, le=100)
    demographic_parity: float = Field(default=0.0, ge=0, le=1)
    equal_opportunity_gap: float = Field(default=0.0, ge=0, le=1)
    domain: str = Field(default="other")
    has_audit_documentation: bool = Field(default=True)
    has_independent_audit: bool = Field(default=False)
    has_human_oversight: bool = Field(default=True)


@router.post("/assess")
async def compliance_assess(
    request: ComplianceRequest,
    uid: str = Depends(require_user),
) -> dict[str, Any]:
    await require_project(request.project_id, uid)
    assessment = assess_compliance(
        fairness_score=request.fairness_score,
        demographic_parity=request.demographic_parity,
        equal_opportunity_gap=request.equal_opportunity_gap,
        has_audit_documentation=request.has_audit_documentation,
        has_independent_audit=request.has_independent_audit,
        has_human_oversight=request.has_human_oversight,
        domain=request.domain,
    )
    narrative = generate_compliance_narrative(assessment)
    assessment["narrative"] = narrative
    assessment["projectId"] = request.project_id
    assessment["userId"] = uid
    compliance_repo.create(assessment)
    return assessment
