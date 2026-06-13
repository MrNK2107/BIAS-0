from __future__ import annotations

import logging
import os
import uuid
from typing import Any, Optional

logger = logging.getLogger(__name__)

from pydantic import BaseModel

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
)

from core.auth import require_user
from core.column_profiler import analyze_columns
from core.common import get_metric_weights
from core.storage import download_file_bytes, upload_file
from repositories import (
    alert_repo,
    audit_run_repo,
    flag_repo,
    monitoring_event_repo,
    monitoring_log_repo,
    project_repo,
)

from .pipeline import _run_pipeline, _store_set

router = APIRouter(prefix="/project", tags=["project"])


@router.post("/create")
async def create_project(
    name: str = Form(...),
    domain: str = Form(default="general"),
    sensitive_cols: Optional[str] = Form(None),
    target_col: str = Form(default=""),
    uid: str = Depends(require_user),
) -> dict[str, Any]:
    sensitive_list = [
        col.strip() for col in (sensitive_cols or "").split(",") if col.strip()
    ]
    doc_id = project_repo.create(
        {
            "userId": uid,
            "name": name,
            "domain": domain,
            "sensitiveColumns": sensitive_list,
            "targetColumn": target_col,
            "datasetPath": "",
            "modelPath": "",
            "maxStep": 1,
        }
    )
    return {"project_id": doc_id, "status": "created"}


class AnalyzeRequest(BaseModel):
    columns: list[str]
    rows: list[list[str]]


@router.post("/analyze-columns")
async def analyze_project_columns(
    body: AnalyzeRequest,
    uid: str = Depends(require_user),
) -> list[dict[str, Any]]:
    return analyze_columns(body.columns, body.rows)


@router.post("/{project_id}/upload")
async def upload_assets(
    project_id: str,
    dataset: UploadFile = File(...),
    model_file: Optional[UploadFile] = File(default=None),
    uid: str = Depends(require_user),
) -> dict[str, Any]:
    project = project_repo.get(project_id)
    if not project or project.get("userId") != uid:
        raise HTTPException(status_code=404, detail="Project not found")

    dataset_url = await upload_file(dataset, f"users/{uid}/datasets")
    model_url = ""
    if model_file and model_file.filename:
        model_url = await upload_file(model_file, f"users/{uid}/models")

    project_repo.update(
        project_id,
        {
            "datasetPath": dataset_url,
            "modelPath": model_url,
            "maxStep": 2,
        },
    )
    return {"status": "uploaded", "datasetPath": dataset_url}


@router.post("/{project_id}/run")
async def run_project_pipeline(
    project_id: str,
    background_tasks: BackgroundTasks,
    metric_priority: str = Form(default="balanced"),
    uid: str = Depends(require_user),
) -> dict[str, Any]:
    project = project_repo.get(project_id)
    if not project or project.get("userId") != uid:
        raise HTTPException(status_code=404, detail="Project not found")

    project_repo.update(project_id, {"maxStep": max(project.get("maxStep", 1), 3)})

    dataset_url = project.get("datasetPath", "")
    if not dataset_url:
        raise HTTPException(
            status_code=400, detail="No dataset uploaded for this project"
        )

    df_bytes = download_file_bytes(dataset_url)

    model_bytes: bytes | None = None
    model_url = project.get("modelPath", "")
    if model_url:
        model_bytes = download_file_bytes(model_url)

    task_id = str(uuid.uuid4())
    _store_set(task_id, {"status": "queued"})

    metric_weights = get_metric_weights(metric_priority)
    background_tasks.add_task(
        _run_pipeline,
        task_id=task_id,
        df_bytes=df_bytes,
        filename=os.path.basename(dataset_url),
        sensitive_list=project.get("sensitiveColumns", []),
        target_col=project.get("targetColumn", ""),
        project_id=project_id,
        metric_weights=metric_weights,
        model_bytes=model_bytes,
        domain=project.get("domain", "general"),
        uid=uid,
    )

    return {"task_id": task_id, "status": "processing"}


@router.get("/{project_id}/compare")
async def compare_project_runs(
    project_id: str,
    uid: str = Depends(require_user),
) -> list[dict[str, Any]]:
    project = project_repo.get(project_id)
    if not project or project.get("userId") != uid:
        raise HTTPException(status_code=404, detail="Project not found")

    runs = audit_run_repo.list(
        filters=[("projectId", "==", project_id)],
        order_by=("timestamp", "DESCENDING"),
    )
    return [
        {
            "run_id": r.get("id"),
            "fairness_score": r.get("fairnessScore", 0),
            "accuracy": r.get("accuracy", 0),
            "decision": r.get("decision", "UNKNOWN"),
            "timestamp": (
                r.get("timestamp").isoformat()
                if hasattr(r.get("timestamp"), "isoformat")
                else str(r.get("timestamp", ""))
            ),
        }
        for r in runs
    ]


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    uid: str = Depends(require_user),
) -> dict[str, Any]:
    project = project_repo.get(project_id)
    if not project or project.get("userId") != uid:
        raise HTTPException(status_code=404, detail="Project not found")

    cascade_repos = [
        audit_run_repo,
        monitoring_event_repo,
        monitoring_log_repo,
        alert_repo,
        flag_repo,
    ]
    failures = []
    for repo in cascade_repos:
        try:
            repo.delete_all([("projectId", "==", project_id)])
        except Exception as exc:
            logger.warning("Cascade delete for %s failed: %s", repo.collection_name, exc)
            failures.append(repo.collection_name)

    try:
        project_repo.delete(project_id)
    except Exception as exc:
        logger.error("Failed to delete project document %s: %s", project_id, exc)
        raise HTTPException(status_code=500, detail=f"Failed to delete project: {exc}")

    return {"status": "deleted", "cascade_failures": failures}


@router.get("/list")
async def list_projects(uid: str = Depends(require_user)) -> list[dict[str, Any]]:
    projects = project_repo.list(filters=[("userId", "==", uid)])
    return [
        {
            "id": p.get("id"),
            "name": p.get("name"),
            "domain": p.get("domain"),
            "sensitive_columns": p.get("sensitiveColumns", []),
            "target_column": p.get("targetColumn", ""),
            "max_step": p.get("maxStep", 1),
        }
        for p in projects
    ]


@router.patch("/{project_id}/config")
async def update_project_config(
    project_id: str,
    sensitive_cols: str = Form(...),
    target_col: str = Form(...),
    uid: str = Depends(require_user),
) -> dict[str, Any]:
    project = project_repo.get(project_id)
    if not project or project.get("userId") != uid:
        raise HTTPException(status_code=404, detail="Project not found")

    sensitive_list = [col.strip() for col in sensitive_cols.split(",") if col.strip()]
    project_repo.update(
        project_id,
        {
            "sensitiveColumns": sensitive_list,
            "targetColumn": target_col,
            "maxStep": 2,
        },
    )
    return {"status": "updated"}


@router.patch("/{project_id}/step")
async def update_project_step(
    project_id: str,
    step: int = Form(...),
    uid: str = Depends(require_user),
) -> dict[str, Any]:
    project = project_repo.get(project_id)
    if not project or project.get("userId") != uid:
        raise HTTPException(status_code=404, detail="Project not found")

    new_step = max(project.get("maxStep", 1), step)
    project_repo.update(project_id, {"maxStep": new_step})
    return {"status": "success", "max_step": new_step}


@router.get("/{project_id}/latest")
async def get_latest_results(
    project_id: str,
    uid: str = Depends(require_user),
) -> dict[str, Any]:
    project = project_repo.get(project_id)
    if not project or project.get("userId") != uid:
        raise HTTPException(status_code=404, detail="Project not found")

    runs = audit_run_repo.list(
        filters=[("projectId", "==", project_id)],
        order_by=("timestamp", "DESCENDING"),
        limit=1,
    )
    if not runs:
        return {"status": "none"}
    run = runs[0]
    return {
        "status": "complete",
        "result": run.get("fullResultJson", {}),
        "fairness_score": run.get("fairnessScore", 0),
        "accuracy": run.get("accuracy", 0),
    }
