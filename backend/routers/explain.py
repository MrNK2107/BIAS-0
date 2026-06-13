from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from core.auth import require_user
from core.deps import require_project
from core.llm import llm_explain

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/explain", tags=["explain"])


class ExplainMetricRequest(BaseModel):
    project_id: str
    module: str
    metric_name: str
    metric_value: float | None = None
    context: dict[str, Any] = {}
    question: str | None = None


class ExplainMetricResponse(BaseModel):
    explanation: str
    provider: str


@router.post("/metric", response_model=ExplainMetricResponse)
async def explain_metric(
    body: ExplainMetricRequest,
    uid: str = Depends(require_user),
):
    await require_project(body.project_id, uid)

    context = {
        "metric_name": body.metric_name,
        "metric_value": body.metric_value,
        "module": body.module,
        **body.context,
    }
    explanation = await llm_explain(context, body.question)

    from core.llm import _detect_provider

    return ExplainMetricResponse(explanation=explanation, provider=_detect_provider())


class ExplainSummaryRequest(BaseModel):
    project_id: str
    pipeline_results: dict[str, Any]
    question: str | None = None


class ExplainSummaryResponse(BaseModel):
    summary: str
    provider: str


@router.post("/summary", response_model=ExplainSummaryResponse)
async def explain_summary(
    body: ExplainSummaryRequest,
    uid: str = Depends(require_user),
):
    await require_project(body.project_id, uid)

    context = {
        "module": "pipeline_summary",
        "metric_name": "pipeline_summary",
        "pipeline_results": body.pipeline_results,
    }
    summary = await llm_explain(context, body.question)

    from core.llm import _detect_provider

    return ExplainSummaryResponse(summary=summary, provider=_detect_provider())
