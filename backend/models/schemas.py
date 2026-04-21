from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str
    domain: str
    sensitive_columns: list[str] = Field(default_factory=list)
    target_column: str


class AuditRequest(BaseModel):
    project_id: int
    sensitive_cols: list[str]
    target_col: str


class ModelBiasRequest(BaseModel):
    project_id: int
    sensitive_cols: list[str]
    target_col: str
    model_path: str | None = None


class ExplainRequest(BaseModel):
    project_id: int
    sensitive_cols: list[str]
    target_col: str
    model_path: str | None = None
    n_samples: int = 5


class CounterfactualRequest(BaseModel):
    project_id: int
    sensitive_col: str
    target_col: str
    model_path: str | None = None


class StressRequest(BaseModel):
    project_id: int
    sensitive_cols: list[str]
    target_col: str
    model_path: str | None = None


class FixRecommendRequest(BaseModel):
    audit_result: dict[str, Any]
    proxy_result: dict[str, Any]
    bias_result: dict[str, Any]


class SandboxRequest(BaseModel):
    project_id: int
    sensitive_cols: list[str]
    target_col: str
    fixes_to_apply: list[dict[str, Any]]


class MonitoringSimulateRequest(BaseModel):
    baseline_score: float = 72


class MonitoringEventOut(BaseModel):
    timestamp: datetime
    fairness_score: float
    alert: bool
    note: str | None = None


class MonitoringHistoryOut(BaseModel):
    project_id: int
    events: list[MonitoringEventOut]
    current_risk_level: Literal["Green", "Yellow", "Red"]
    trend: Literal["improving", "stable", "declining"]


class DemoProjectResponse(BaseModel):
    file_name: str
    csv_text: str
