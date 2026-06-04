"""Pydantic schemas for the Unbiased AI API.

NOTE: Most schemas are currently unused — endpoints use raw Form() parameters.
Kept for reference and future migration to request body models.
"""
from __future__ import annotations

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    domain: str
    sensitive_columns: list[str] = []
    target_column: str
