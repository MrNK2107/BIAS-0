"""Compliance assessment router — maps fairness audit results to regulatory frameworks."""

from __future__ import annotations

from typing import Any, Literal

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
    # attribute -> {category: selection rate}; used for the NYC LL144 impact ratios.
    group_selection_rates: dict[str, dict[str, float | None]] | None = None
    # attribute -> {category: number of individuals}; enables the optional
    # 6 RCNY 5-301(d) exclusion of categories under 2% of the data.
    group_counts: dict[str, dict[str, int]] | None = None
    exclude_small_categories: bool = False
    exclusion_justification: str | None = Field(default=None, max_length=2000)
    # "scoring" when the AEDT outputs a score: the rates are then scoring rates
    # (share above the full-sample median, 6 RCNY 5-301(c)).
    rate_type: Literal["selection", "scoring"] = "selection"


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
        group_selection_rates=request.group_selection_rates,
        group_counts=request.group_counts,
        exclude_small_categories=request.exclude_small_categories,
        exclusion_justification=request.exclusion_justification,
        rate_type=request.rate_type,
    )
    narrative = generate_compliance_narrative(assessment)
    assessment["narrative"] = narrative
    assessment["projectId"] = request.project_id
    assessment["userId"] = uid
    compliance_repo.create(assessment)
    return assessment
