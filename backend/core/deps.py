from __future__ import annotations

from typing import Any

from fastapi import Depends, HTTPException

from core.auth import require_user
from repositories import project_repo


async def require_project(
    project_id: str,
    uid: str = Depends(require_user),
) -> dict[str, Any]:
    project = project_repo.get(project_id)
    if not project or project.get("userId") != uid:
        raise HTTPException(status_code=404, detail="Project not found")
    return project
