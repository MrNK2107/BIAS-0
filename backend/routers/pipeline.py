"""Unified precomputation pipeline with async background execution.

POST /pipeline/run-all  → immediately returns { task_id, status: "processing" }
GET  /pipeline/status/{task_id} → returns { status, result? }
"""
from __future__ import annotations

import logging
import threading
import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from google.cloud.firestore import SERVER_TIMESTAMP

from core.auto_fix import generate_fix_recommendations
from core.auth import require_user
from core.counterfactual import run_counterfactual_test
from core.data_audit import run_data_audit
from core.explainability import explain_flagged_decisions, generate_narrative_summary
from core.feature_intelligence import detect_proxy_features
from core.common import build_classifier, get_metric_weights, prepare_split
from core.model_bias import run_model_bias_analysis
from core.stress_test import run_stress_tests
from firebase.repositories import audit_run_repo, monitoring_log_repo, alert_repo
from utils.model_loader import load_model_from_bytes

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pipeline", tags=["pipeline"])

# ── In-memory task store for fast polling ──
_task_store: dict[str, dict[str, Any]] = {}
_task_lock = threading.Lock()


def _store_get(task_id: str) -> dict[str, Any] | None:
    with _task_lock:
        return _task_store.get(task_id)


def _store_set(task_id: str, value: dict[str, Any]) -> None:
    with _task_lock:
        _task_store[task_id] = value


def _persist_pipeline_result(
    project_id: str,
    task_id: str,
    uid: str,
    result: dict[str, Any],
    unified_fairness_score: float,
    model_bias: dict[str, Any],
    data_audit: dict[str, Any],
    decision: str,
) -> None:
    risk_level = data_audit.get("risk_level", "Yellow")

    audit_run_repo.create({
        "projectId": project_id,
        "userId": uid,
        "fairnessScore": float(unified_fairness_score),
        "accuracy": float(model_bias.get("overall_accuracy", 0.0)),
        "riskLevel": risk_level,
        "decision": decision,
        "fullResultJson": result,
        "taskId": task_id,
        "timestamp": SERVER_TIMESTAMP,
    })

    monitoring_log_repo.create({
        "projectId": project_id,
        "userId": uid,
        "fairnessScore": float(unified_fairness_score),
        "dataDriftScore": 0.0,
        "predictionDriftScore": 0.0,
        "keyMetrics": {
            "accuracy": float(model_bias.get("overall_accuracy", 0.0)),
            "disparate_impact": model_bias.get("metrics", {}).get("disparate_impact"),
            "demographic_parity": model_bias.get("metrics", {}).get("demographic_parity_difference"),
            "max_gap": data_audit.get("max_gap", 0.0),
        },
        "timestamp": SERVER_TIMESTAMP,
    })

    if unified_fairness_score < 50:
        alert_repo.create({
            "projectId": project_id,
            "userId": uid,
            "type": "BIAS",
            "message": f"Critical bias detected. Fairness score: {unified_fairness_score:.1f}.",
            "severity": "HIGH",
            "timestamp": SERVER_TIMESTAMP,
        })

    # Check for drift and degradation from previous logs
    prev_logs = monitoring_log_repo.list(
        filters=[("projectId", "==", project_id)],
        order_by=("timestamp", "DESCENDING"),
        limit=2,
    )
    if len(prev_logs) >= 1:
        last = prev_logs[0]
        last_score = last.get("fairnessScore", 0)
        if last_score > 0:
            drop_pct = (last_score - unified_fairness_score) / last_score
            if drop_pct > 0.15:
                alert_repo.create({
                    "projectId": project_id,
                    "userId": uid,
                    "type": "DRIFT",
                    "message": f"Critical score drift: {drop_pct * 100:.1f}% drop from previous.",
                    "severity": "HIGH",
                    "timestamp": SERVER_TIMESTAMP,
                })

    if len(prev_logs) == 2:
        s1 = prev_logs[1].get("fairnessScore", 0)
        s2 = prev_logs[0].get("fairnessScore", 0)
        if s1 > s2 > unified_fairness_score:
            alert_repo.create({
                "projectId": project_id,
                "userId": uid,
                "type": "DEGRADATION",
                "message": "Sequential degradation detected over 3+ runs.",
                "severity": "MEDIUM",
                "timestamp": SERVER_TIMESTAMP,
            })


def _run_pipeline(
    task_id: str,
    df_bytes: bytes,
    filename: str,
    sensitive_list: list[str],
    target_col: str,
    project_id: str,
    metric_weights: dict[str, float],
    model_bytes: bytes | None,
    domain: str,
    uid: str,
) -> None:
    """Background worker: runs all 8 stages and persists to Firestore."""
    import io

    import pandas as pd

    _store_set(task_id, {"status": "processing"})

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
            proxy_risk_score=proxy_risk_score,
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

        import json
        logger.info("=== RESULT SIZE DEBUG ===")
        for k, v in result.items():
            try:
                size = len(json.dumps(v))
                logger.info("Key: %s, Size in JSON bytes: %d", k, size)
            except Exception as e:
                logger.error("Key: %s failed to serialize: %s", k, str(e))

        # ── Persist to Firestore ──────────────────────────────────────────────
        _persist_pipeline_result(
            project_id=str(project_id),
            task_id=task_id,
            uid=uid,
            result=result,
            unified_fairness_score=unified_fairness_score,
            model_bias=model_bias,
            data_audit=data_audit,
            decision=decision,
        )

        _store_set(task_id, {"status": "complete", "result": result})

    except Exception as exc:
        logger.exception("Pipeline task %s failed", task_id)
        _store_set(task_id, {"status": "error", "error": str(exc)})


@router.post("/run-all")
async def run_all(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    sensitive_cols: str = Form(...),
    target_col: str = Form(...),
    project_id: str = Form(default=""),
    metric_priority: str = Form(default="balanced"),
    domain: str = Form(default="general"),
    custom_model_file: UploadFile | None = None,
    uid: str = Depends(require_user),
) -> dict[str, str]:
    df_bytes = await file.read()

    model_bytes: bytes | None = None
    if custom_model_file is not None:
        try:
            model_bytes = await custom_model_file.read()
            if not model_bytes:
                model_bytes = None
        except Exception:
            model_bytes = None

    sensitive_list = [col.strip() for col in sensitive_cols.split(",") if col.strip()]
    metric_weights = get_metric_weights(metric_priority)

    task_id = str(uuid.uuid4())
    _store_set(task_id, {"status": "queued"})

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
        uid=uid,
    )

    return {"task_id": task_id, "status": "processing"}


@router.get("/status/{task_id}")
async def get_task_status(task_id: str) -> dict[str, Any]:
    task = _store_get(task_id)
    if task is not None:
        return task

    # Check Firestore for completed tasks from prior runs
    runs = audit_run_repo.list(filters=[("taskId", "==", task_id)], limit=1)
    if runs:
        return {"status": "complete", "result": runs[0].get("fullResultJson", {})}

    raise HTTPException(status_code=404, detail="Task not found")


@router.get("/result/{task_id}")
async def get_task_result(task_id: str) -> dict[str, Any]:
    task = _store_get(task_id)
    if task and task.get("status") in ["queued", "processing"]:
        return {"status": "running"}

    runs = audit_run_repo.list(filters=[("taskId", "==", task_id)], limit=1)
    if not runs:
        if task and task.get("status") == "error":
            return {"status": "error", "error": task.get("error")}
        raise HTTPException(status_code=404, detail="Audit result not found")

    run = runs[0]
    res = run.get("fullResultJson", {})
    return {
        "status": "completed",
        "fairness_score": run.get("fairnessScore", 0),
        "decision": run.get("decision", "UNKNOWN"),
        "scores": res.get("scores", {}),
        "recommendations": res.get("recommendations", []),
        "details": res,
    }
