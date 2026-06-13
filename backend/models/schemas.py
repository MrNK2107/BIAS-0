from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str
    domain: str
    sensitive_columns: list[str] = []
    target_column: str = ""


class AuditDataRequest(BaseModel):
    project_id: str
    sensitive_cols: str
    target_col: str
    metric_priority: str = "balanced"


class ProxyDetectRequest(BaseModel):
    sensitive_cols: str
