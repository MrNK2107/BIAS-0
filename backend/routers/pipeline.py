"""Unified precomputation pipeline with async background execution.

POST /pipeline/run-all  → immediately returns { task_id, status: "processing" }
GET  /pipeline/status/{task_id} → returns { status, result? }
"""
from __future__ import annotations

import uuid
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from core.auto_fix import generate_fix_recommendations
from core.counterfactual import run_counterfactual_test
from core.data_audit import run_data_audit
from core.explainability import explain_flagged_decisions, generate_narrative_summary
from core.feature_intelligence import detect_proxy_features
from core.common import build_classifier, prepare_split
from core.model_bias import run_model_bias_analysis
from core.stress_test import run_stress_tests
from models.db import AuditRun, get_db
from utils.data_io import upload_file_to_dataframe
from utils.model_loader import load_model_from_bytes

router = APIRouter(prefix="/pipeline", tags=["pipeline"])

# ── In-memory task store (suitable for single-process dev; swap for Redis in prod) ──
_task_store: dict[str, dict[str, Any]] = {}


def _get_metric_weights(metric_priority: str) -> dict[str, float]:
    if metric_priority == "equal_opportunity_first":
        return {
            "demographic_parity_difference": 15,
            "equal_opportunity_difference": 45,
            "fpr_gap": 15,
        }
    elif metric_priority == "demographic_parity_first":
        return {
            "demographic_parity_difference": 45,
            "equal_opportunity_difference": 15,
            "fpr_gap": 15,
        }
    else:  # "balanced" or default
        return {
            "demographic_parity_difference": 30,
            "equal_opportunity_difference": 25,
            "fpr_gap": 20,
        }


def _run_pipeline(
    task_id: str,
    df_bytes: bytes,
    filename: str,
    sensitive_list: list[str],
    target_col: str,
    project_id: int,
    metric_weights: dict[str, float],
    model_bytes: bytes | None,
    domain: str,
) -> None:
    """Background worker: runs all 8 stages and writes result to task_store."""
    import io
    import pandas as pd
    from sqlalchemy.orm import Session
    from models.db import SessionLocal

    _task_store[task_id]["status"] = "processing"
    db: Session = SessionLocal()

    try:
        df = pd.read_csv(io.BytesIO(df_bytes))

        # ── Build / load model ────────────────────────────────────────────────
        prepared = prepare_split(df, target_col)
        if model_bytes:
            shared_model = load_model_from_bytes(model_bytes)
            model_used = "user_provided"
        else:
            shared_model = build_classifier(prepared.X_train, model_type="rf")
            shared_model.fit(prepared.X_train, prepared.y_train)
            model_used = "built_in_rf"

        # ── Stage 1: Data Audit ───────────────────────────────────────────────
        data_audit = run_data_audit(df, sensitive_list, target_col)

        # ── Stage 2: Proxy Detection ──────────────────────────────────────────
        proxy = detect_proxy_features(df, sensitive_list)

        # ── Stage 3: Model Bias ───────────────────────────────────────────────
        model_bias = run_model_bias_analysis(
            df, sensitive_list, target_col,
            model=shared_model,
            metric_weights=metric_weights,
        )

        # ── Stage 4: Explainability (SHAP / contrastive) ─────────────────────
        explanations = explain_flagged_decisions(
            df, shared_model, sensitive_list, target_col, n_samples=5
        )

        # ── Stage 5: Narrative Summary ────────────────────────────────────────
        explain_summary = generate_narrative_summary(explanations, sensitive_list, domain=domain)

        # ── Stage 6: Counterfactual (first sensitive col) ─────────────────────
        primary_sensitive_col = sensitive_list[0] if sensitive_list else target_col
        counterfactual = run_counterfactual_test(
            df, shared_model, primary_sensitive_col, target_col,
            metric_weights=metric_weights,
        )

        # ── Stage 7: Stress Tests ─────────────────────────────────────────────
        stress = run_stress_tests(df, shared_model, sensitive_list, target_col)

        # ── Stage 8: Fix Recommendations ──────────────────────────────────────
        recommendations = generate_fix_recommendations(data_audit, proxy, model_bias)

        # ── Consolidate ───────────────────────────────────────────────────────
        result: dict[str, Any] = {
            "data_audit": data_audit,
            "proxy": proxy,
            "model_bias": model_bias,
            "explanations": explanations,
            "explain_summary": explain_summary,
            "counterfactual": counterfactual,
            "stress": stress,
            "recommendations": recommendations,
            "model_used": model_used,
        }

        # ── Persist to DB ──────────────────────────────────────────────────────
        fairness_score = float(model_bias.get("fairness_score", 0.0))
        risk_level = data_audit.get("risk_level", "Yellow")
        audit_run = AuditRun(
            project_id=project_id,
            fairness_score=fairness_score,
            risk_level=risk_level,
            results_json=result,
        )
        db.add(audit_run)
        db.commit()

        _task_store[task_id] = {"status": "complete", "result": result}

    except Exception as exc:
        _task_store[task_id] = {"status": "error", "error": str(exc)}
    finally:
        db.close()


@router.post("/run-all")
async def run_all(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    sensitive_cols: str = Form(...),
    target_col: str = Form(...),
    project_id: int = Form(...),
    metric_priority: str = Form(default="balanced"),
    domain: str = Form(default="general"),
    model_file: Optional[UploadFile] = File(default=None),
) -> dict[str, str]:
    """
    Accepts the CSV and optional model file, immediately returns a task_id.
    The heavy computation runs in a background thread.
    """
    df_bytes = await file.read()
    model_bytes: bytes | None = None
    if model_file is not None and model_file.filename:
        model_bytes = await model_file.read()

    sensitive_list = [col.strip() for col in sensitive_cols.split(",") if col.strip()]
    metric_weights = _get_metric_weights(metric_priority)

    task_id = str(uuid.uuid4())
    _task_store[task_id] = {"status": "queued"}

    background_tasks.add_task(
        _run_pipeline,
        task_id=task_id,
        df_bytes=df_bytes,
        filename=file.filename or "upload.csv",
        sensitive_list=sensitive_list,
        target_col=target_col,
        project_id=project_id,
        metric_weights=metric_weights,
        model_bytes=model_bytes,
        domain=domain,
    )

    return {"task_id": task_id, "status": "processing"}


@router.get("/status/{task_id}")
async def get_task_status(task_id: str) -> dict[str, Any]:
    """Poll this endpoint after calling /pipeline/run-all to retrieve results."""
    task = _task_store.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task
