from __future__ import annotations

import os
import uuid
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from models.db import AuditRun, Project, get_db
from .pipeline import _run_pipeline, _task_store, _get_metric_weights

router = APIRouter(prefix="/project", tags=["project"])

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/create")
async def create_project(
    name: str = Form(...),
    domain: str = Form(default="general"),
    sensitive_cols: Optional[str] = Form(None),
    target_col: Optional[str] = Form(None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    sensitive_list = [col.strip() for col in (sensitive_cols or "").split(",") if col.strip()]
    project = Project(
        name=name,
        domain=domain,
        sensitive_columns=sensitive_list,
        target_column=target_col,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return {"project_id": project.id, "status": "created"}

@router.post("/{project_id}/upload")
async def upload_assets(
    project_id: int,
    dataset: UploadFile = File(...),
    model_file: Optional[UploadFile] = File(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    dataset_path = os.path.join(UPLOAD_DIR, f"proj_{project_id}_data_{dataset.filename}")
    with open(dataset_path, "wb") as f:
        f.write(await dataset.read())
    project.dataset_path = dataset_path

    if model_file and model_file.filename:
        model_path = os.path.join(UPLOAD_DIR, f"proj_{project_id}_model_{model_file.filename}")
        with open(model_path, "wb") as f:
            f.write(await model_file.read())
        project.model_path = model_path

    db.commit()
    # Reset progress to Step 2 after upload
    project.max_step = 2
    db.commit()
    return {"status": "uploaded", "dataset_path": dataset_path}

@router.post("/{project_id}/run")
async def run_project_pipeline(
    project_id: int,
    background_tasks: BackgroundTasks,
    metric_priority: str = Form(default="balanced"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Progress: Once they run analysis in Step 2, they can move to Step 3
    project.max_step = max(project.max_step, 3)
    db.commit()

    if not project.dataset_path or not os.path.exists(project.dataset_path):
        raise HTTPException(status_code=400, detail="No dataset uploaded for this project")

    with open(project.dataset_path, "rb") as f:
        df_bytes = f.read()
    
    model_bytes = None
    if project.model_path and os.path.exists(project.model_path):
        with open(project.model_path, "rb") as f:
            model_bytes = f.read()

    task_id = str(uuid.uuid4())
    _task_store[task_id] = {"status": "queued"}
    
    metric_weights = _get_metric_weights(metric_priority)

    background_tasks.add_task(
        _run_pipeline,
        task_id=task_id,
        df_bytes=df_bytes,
        filename=os.path.basename(project.dataset_path),
        sensitive_list=project.sensitive_columns,
        target_col=project.target_column,
        project_id=project.id,
        metric_weights=metric_weights,
        model_bytes=model_bytes,
        domain=project.domain,
    )

    return {"task_id": task_id, "status": "processing"}

@router.get("/{project_id}/compare")
async def compare_project_runs(project_id: int, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    runs = db.query(AuditRun).filter(AuditRun.project_id == project_id).order_by(AuditRun.timestamp.desc()).all()
    return [
        {
            "run_id": run.id,
            "fairness_score": run.fairness_score,
            "accuracy": run.accuracy,
            "decision": run.decision,
            "timestamp": run.timestamp.isoformat(),
        }
        for run in runs
    ]

@router.get("/list")
async def list_projects(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    projects = db.query(Project).all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "domain": p.domain,
            "sensitive_columns": p.sensitive_columns,
            "target_column": p.target_column,
            "max_step": p.max_step,
        }
        for p in projects
    ]

@router.patch("/{project_id}/config")
async def update_project_config(
    project_id: int,
    sensitive_cols: str = Form(...),
    target_col: str = Form(...),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    sensitive_list = [col.strip() for col in sensitive_cols.split(",") if col.strip()]
    project.sensitive_columns = sensitive_list
    project.target_column = target_col
    
    # If they change config, they shouldn't jump past Step 3 until they re-run analysis
    project.max_step = 2 
    db.commit()
    return {"status": "updated"}

@router.patch("/{project_id}/step")
async def update_project_step(
    project_id: int,
    step: int = Form(...),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project.max_step = max(project.max_step, step)
    db.commit()
    return {"status": "success", "max_step": project.max_step}

@router.get("/{project_id}/latest")
async def get_latest_results(project_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    run = db.query(AuditRun).filter(AuditRun.project_id == project_id).order_by(AuditRun.timestamp.desc()).first()
    if not run:
        return {"status": "none"}
    return {
        "status": "complete",
        "result": run.full_result_json,
        "fairness_score": run.fairness_score,
        "accuracy": run.accuracy
    }
