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
from models.db import AuditRun, Project, MonitoringLog, Alert, get_db
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

        # ── Scores & Decision Calculation ─────────────────────────────────────
        data_bias_score = round(100 * (1 - data_audit.get("max_gap", 0.0)))
        model_bias_score = round(model_bias.get("fairness_score", 0.0))
        proxy_risk_score = round(100 * (1 - proxy.get("proxy_score", 0.0)))
        counterfactual_score = round(counterfactual.get("counterfactual_fairness_score", 0.0))

        stress_scenarios = stress.get("scenarios", [])
        if stress_scenarios:
            stress_test_score = round(sum(s["fairness_score"] for s in stress_scenarios) / len(stress_scenarios))
        else:
            stress_test_score = 100

        unified_fairness_score = round(
            0.25 * model_bias_score +
            0.20 * counterfactual_score +
            0.20 * stress_test_score +
            0.20 * data_bias_score +
            0.15 * proxy_risk_score
        )

        if unified_fairness_score < 50:
            decision = "HIGH RISK"
        elif unified_fairness_score <= 70:
            decision = "MODERATE RISK"
        else:
            decision = "LOW RISK"

        # ── Stage 8: Fix Recommendations ──────────────────────────────────────
        recommendations = generate_fix_recommendations(
            data_audit, 
            proxy, 
            model_bias,
            counterfactual_score=counterfactual_score,
            stress_test_score=stress_test_score,
            proxy_risk_score=proxy_risk_score
        )

        scores = {
            "data_bias_score": data_bias_score,
            "model_bias_score": model_bias_score,
            "proxy_risk_score": proxy_risk_score,
            "counterfactual_score": counterfactual_score,
            "stress_test_score": stress_test_score,
        }

        # ── Consolidate ───────────────────────────────────────────────────────
        result: dict[str, Any] = {
            "scores": scores,
            "fairness_score": unified_fairness_score,
            "decision": decision,
            "recommendations": recommendations,
            "data_audit": data_audit,
            "proxy": proxy,
            "model_bias": model_bias,
            "explanations": explanations,
            "explain_summary": explain_summary,
            "counterfactual": counterfactual,
            "stress": stress,
            "model_used": model_used,
        }

        # ── Persist to DB ──────────────────────────────────────────────────────
        risk_level = data_audit.get("risk_level", "Yellow")
        audit_run = AuditRun(
            project_id=project_id,
            fairness_score=float(unified_fairness_score),
            accuracy=float(model_bias.get("overall_accuracy", 0.0)),
            risk_level=risk_level,
            decision=decision,
            results_json=result,  # old field
            full_result_json=result,  # new field
            task_id=task_id,
        )
        db.add(audit_run)

        # Create Monitoring Log entry for time-series tracking
        log_entry = MonitoringLog(
            project_id=project_id,
            fairness_score=float(unified_fairness_score),
            data_drift_score=0.0, # Will be updated if drift detection is run
            prediction_drift_score=0.0,
            key_metrics={
                "accuracy": float(model_bias.get("overall_accuracy", 0.0)),
                "disparate_impact": model_bias.get("metrics", {}).get("disparate_impact"),
                "demographic_parity": model_bias.get("metrics", {}).get("demographic_parity_difference"),
                "max_gap": data_audit.get("max_gap", 0.0)
            }
        )
        db.add(log_entry)
        
        # Trigger Alerts based on scores and historical trends
        if unified_fairness_score < 50:
            db.add(Alert(
                project_id=project_id,
                type="BIAS",
                message=f"Critical bias detected. Fairness score: {unified_fairness_score:.1f}.",
                severity="HIGH"
            ))

        last_log = db.query(MonitoringLog).filter(MonitoringLog.project_id == project_id).order_by(MonitoringLog.timestamp.desc()).first()
        if last_log and last_log.fairness_score > 0:
            drop_pct = (last_log.fairness_score - unified_fairness_score) / last_log.fairness_score
            if drop_pct > 0.15:
                db.add(Alert(
                    project_id=project_id,
                    type="DRIFT",
                    message=f"Critical score drift: {drop_pct*100:.1f}% drop from previous.",
                    severity="HIGH"
                ))

        prev_logs = db.query(MonitoringLog).filter(MonitoringLog.project_id == project_id).order_by(MonitoringLog.timestamp.desc()).limit(2).all()
        if len(prev_logs) == 2:
            s1 = prev_logs[1].fairness_score 
            s2 = prev_logs[0].fairness_score 
            s3 = unified_fairness_score
            if s1 > s2 > s3:
                db.add(Alert(
                    project_id=project_id,
                    type="DEGRADATION",
                    message="Sequential degradation detected over 3+ runs.",
                    severity="MEDIUM"
                ))

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
async def get_task_status(task_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Poll this endpoint after calling /pipeline/run-all to retrieve results."""
    task = _task_store.get(task_id)
    if task is not None:
        return task
        
    # If not in memory, check if it was completed and saved to DB (e.g., after server restart)
    from models.db import AuditRun
    audit = db.query(AuditRun).filter(AuditRun.task_id == task_id).first()
    if audit:
        return {"status": "complete", "result": audit.full_result_json}
        
    raise HTTPException(status_code=404, detail="Task not found")


@router.get("/result/{task_id}")
async def get_task_result(task_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Fetches the final persistent result of a pipeline run."""
    # Check in-memory first
    task = _task_store.get(task_id)
    if task and task.get("status") in ["queued", "processing"]:
        return {"status": "running"}

    # Fetch from DB for persistence
    audit = db.query(AuditRun).filter(AuditRun.task_id == task_id).first()
    if not audit:
        if task and task.get("status") == "error":
            return {"status": "error", "error": task.get("error")}
        raise HTTPException(status_code=404, detail="Audit result not found in database")

    res = audit.full_result_json
    return {
        "status": "completed",
        "fairness_score": audit.fairness_score,
        "decision": audit.decision,
        "scores": res.get("scores", {}),
        "recommendations": res.get("recommendations", []),
        "details": res
    }
