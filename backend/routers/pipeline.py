"""Unified precomputation pipeline with async background execution.

POST /pipeline/run-all  → immediately returns { task_id, status: "processing" }
GET  /pipeline/status/{task_id} → returns { status, result? }
"""

from __future__ import annotations

import io
import logging
import threading
import uuid
from typing import Any

import pandas as pd
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
from core.auto_fix import generate_fix_recommendations
from core.common import (
    get_metric_weights,
    normalize_target_binary,
    prepare_split,
    utcnow_iso,
    validate_target_column,
)
from core.deps import require_project
from core.tuning import train_best_model
from core.counterfactual import run_counterfactual_test
from core.data_audit import run_data_audit
from core.evidence import (
    UNIFIED_SCORE_WEIGHTS,
    build_provenance,
    display_name,
    project_ll144_rate_type,
)
from core.explainability import explain_flagged_decisions, generate_narrative_summary
from core.feature_intelligence import detect_proxy_features
from core.data import describe_target_binarisation, resolve_target_positive
from core.model_bias import run_model_bias_analysis, wrap_label_model
from core.stress_test import run_stress_tests
from repositories import alert_repo, audit_run_repo, monitoring_log_repo, project_repo
from utils.model_loader import load_model_from_bytes

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


def _worst_disparate_impact(model_bias: dict[str, Any]) -> float | None:
    """Lowest disparate impact ratio (min/max selection rate) over the sensitive
    columns, from the statistical-rigour block; None when it is absent."""
    per_attr = (model_bias.get("statistical_rigour") or {}).get("per_attribute") or {}
    values = [
        res["gaps"]["disparate_impact_ratio"]["point"]
        for res in per_attr.values()
        if res.get("gaps", {}).get("disparate_impact_ratio", {}).get("point") is not None
    ]
    return float(min(values)) if values else None


def _now() -> str:
    return utcnow_iso()


# ── In-memory task store for fast polling ──
_task_store: dict[str, dict[str, Any]] = {}
_task_lock = threading.Lock()


def _store_get(task_id: str) -> dict[str, Any] | None:
    with _task_lock:
        return _task_store.get(task_id)


def _store_set(task_id: str, value: dict[str, Any]) -> None:
    with _task_lock:
        _task_store[task_id] = value


def _stage(task_id: str, stage: str) -> None:
    """Record the running stage so /status shows where a slow run is."""
    logger.info("Pipeline task %s: %s", task_id, stage)
    _store_set(task_id, {"status": "processing", "stage": stage})


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

    audit_run_repo.create(
        {
            "projectId": project_id,
            "userId": uid,
            "fairnessScore": float(unified_fairness_score),
            "accuracy": float(model_bias.get("overall_accuracy", 0.0)),
            "riskLevel": risk_level,
            "decision": decision,
            "fullResultJson": result,
            "taskId": task_id,
            "timestamp": _now(),
        }
    )

    monitoring_log_repo.create(
        {
            "projectId": project_id,
            "userId": uid,
            "fairnessScore": float(unified_fairness_score),
            "dataDriftScore": 0.0,
            "predictionDriftScore": 0.0,
            "keyMetrics": {
                "accuracy": float(model_bias.get("overall_accuracy", 0.0)),
                "disparate_impact": _worst_disparate_impact(model_bias),
                "demographic_parity": model_bias.get("metrics", {}).get(
                    "demographic_parity_difference"
                ),
                "max_gap": data_audit.get("max_gap", 0.0),
            },
            "timestamp": _now(),
        }
    )

    if unified_fairness_score < 50:
        alert_repo.create(
            {
                "projectId": project_id,
                "userId": uid,
                "type": "BIAS",
                "message": f"Critical bias detected. Fairness score: {unified_fairness_score:.1f}.",
                "severity": "HIGH",
                "timestamp": _now(),
            }
        )

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
                alert_repo.create(
                    {
                        "projectId": project_id,
                        "userId": uid,
                        "type": "DRIFT",
                        "message": f"Critical score drift: {drop_pct * 100:.1f}% drop from previous.",
                        "severity": "HIGH",
                        "timestamp": _now(),
                    }
                )

    if len(prev_logs) == 2:
        s1 = prev_logs[1].get("fairnessScore", 0)
        s2 = prev_logs[0].get("fairnessScore", 0)
        if s1 > s2 > unified_fairness_score:
            alert_repo.create(
                {
                    "projectId": project_id,
                    "userId": uid,
                    "type": "DEGRADATION",
                    "message": "Sequential degradation detected over 3+ runs.",
                    "severity": "MEDIUM",
                    "timestamp": _now(),
                }
            )


def unified_score(scores: dict[str, float]) -> int:
    """Weighted blend of the stage scores (weights in core.evidence)."""
    return round(sum(w * scores[k] for k, w in UNIFIED_SCORE_WEIGHTS.items()))


FINAL_WORKFLOW_STEP = 9


def _unlock_all_steps(project_id: str, uid: str) -> None:
    """A finished analysis has results for every stage, so every workflow
    step (Data Audit .. Monitoring) should be reachable. Without this the
    project stayed at maxStep 3 and steps 4-9 were locked forever."""
    try:
        project = project_repo.get(project_id)
        if project and project.get("userId") == uid:
            project_repo.update(
                project_id,
                {"maxStep": max(project.get("maxStep", 1), FINAL_WORKFLOW_STEP)},
            )
    except Exception as exc:  # never fail a finished run over bookkeeping
        logger.warning("Could not unlock steps for project %s: %s", project_id, exc)


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
    stored_name: str | None = None,
    positive_label: str | None = None,
    ll144_rate_type: dict[str, Any] | None = None,
) -> None:
    """Background worker: runs all 8 stages and persists to Firestore."""
    _store_set(task_id, {"status": "processing"})

    try:
        df = pd.read_csv(io.BytesIO(df_bytes))

        if target_col not in df.columns:
            raise ValueError(f"Target column '{target_col}' not found in dataset")

        validation = validate_target_column(df[target_col], target_col)
        if not validation["valid"]:
            _store_set(task_id, {"status": "error", "error": validation["error"]})
            return

        # ── Normalize target to binary 0/1 ─────────────────────────────────
        # The positive class is the user's choice, else the inferred label;
        # either way it is recorded in the provenance block.
        raw_target = df[target_col].dropna()
        target_labels = list(pd.unique(raw_target))
        positive = resolve_target_positive(raw_target, positive_label)
        binarisation = describe_target_binarisation(raw_target, positive_label or None)
        try:
            normalize_target_binary(df, target_col, positive_label=positive_label or None)
        except ValueError as exc:
            _store_set(task_id, {"status": "error", "error": str(exc)})
            return

        # ── Build / load / tune model ───────────────────────────────────────────
        _stage(task_id, "training")
        prepared = prepare_split(df, target_col)
        if model_bytes:
            # A user model may predict the original text labels; map them
            # with the same positive class for every stage.
            shared_model = wrap_label_model(
                load_model_from_bytes(model_bytes), positive["value"], target_labels
            )
            model_used = "user_provided"
        else:
            shared_model, model_type = train_best_model(
                prepared.X_train, prepared.y_train,
            )
            model_used = f"tuned_{model_type}"

        # ── Stage 1: Data Audit ───────────────────────────────────────────────
        _stage(task_id, "data_audit")
        data_audit = run_data_audit(df, sensitive_list, target_col, domain=domain)

        # ── Stage 2: Proxy Detection ──────────────────────────────────────────
        proxy = detect_proxy_features(df, sensitive_list)

        # ── Stage 3: Model Bias ───────────────────────────────────────────────
        _stage(task_id, "model_bias")
        model_bias = run_model_bias_analysis(
            df,
            sensitive_list,
            target_col,
            model=shared_model,
            metric_weights=metric_weights,
            domain=domain,
        )

        # ── Stage 4: Explainability (SHAP / contrastive) ─────────────────────
        _stage(task_id, "explanations")
        explanations = explain_flagged_decisions(
            df, shared_model, sensitive_list, target_col, n_samples=5, proxy_result=proxy
        )

        # ── Stage 5: Narrative Summary ────────────────────────────────────────
        explain_summary = generate_narrative_summary(
            explanations, sensitive_list, domain=domain
        )

        # ── Stage 6: Counterfactual (first sensitive col) ─────────────────────
        primary_sensitive_col = sensitive_list[0] if sensitive_list else target_col
        _stage(task_id, "counterfactual")
        counterfactual = run_counterfactual_test(
            df,
            shared_model,
            primary_sensitive_col,
            target_col,
            metric_weights=metric_weights,
        )

        # ── Stage 7: Stress Tests ─────────────────────────────────────────────
        _stage(task_id, "stress")
        stress = run_stress_tests(df, shared_model, sensitive_list, target_col)

        # ── Scores & Decision Calculation ─────────────────────────────────────
        data_bias_score = round(100 * (1 - data_audit.get("max_gap", 0.0)))
        model_bias_score = round(model_bias.get("fairness_score", 0.0))
        proxy_risk_score = round(100 * (1 - proxy.get("proxy_score", 0.0)))
        counterfactual_score = round(
            counterfactual.get("counterfactual_fairness_score", 0.0)
        )

        stress_scenarios = stress.get("scenarios", [])
        if stress_scenarios:
            stress_test_score = round(
                sum(s["fairness_score"] for s in stress_scenarios)
                / len(stress_scenarios)
            )
        else:
            stress_test_score = 100

        unified_fairness_score = unified_score(
            {
                "model_bias_score": model_bias_score,
                "counterfactual_score": counterfactual_score,
                "stress_test_score": stress_test_score,
                "data_bias_score": data_bias_score,
                "proxy_risk_score": proxy_risk_score,
            }
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
        rigour_cfg = (model_bias.get("statistical_rigour") or {}).get("config")
        if rigour_cfg is None:
            from core.rigour import default_config

            rigour_cfg = default_config()
        result["provenance"] = build_provenance(
            df_bytes=df_bytes,
            filename=filename,
            n_rows=len(df),
            columns=list(df.columns),
            sensitive_cols=sensitive_list,
            target_col=target_col,
            domain=domain,
            metric_weights=metric_weights,
            model_used=model_used,
            model_bytes=model_bytes,
            rigour_config=rigour_cfg,
            stored_name=stored_name,
            positive_label=positive,
            target_binarisation=binarisation,
            ll144_rate_type=ll144_rate_type,
        )

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

        _unlock_all_steps(str(project_id), uid)
        _store_set(task_id, {"status": "complete", "result": result})

    except Exception as exc:
        logger.exception("Pipeline task %s failed", task_id)
        _store_set(task_id, {"status": "error", "error": str(exc)})


MAX_UPLOAD_SIZE = 200 * 1024 * 1024  # 200 MB


@router.post("/run-all")
async def run_all(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    sensitive_cols: str = Form(...),
    target_col: str = Form(...),
    project_id: str = Form(...),
    metric_priority: str = Form(default="balanced"),
    domain: str = Form(default="general"),
    positive_label: str | None = Form(None),
    custom_model_file: UploadFile | None = None,
    uid: str = Depends(require_user),
) -> dict[str, str]:
    project = await require_project(project_id, uid)
    if file.size and file.size > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({file.size / 1024 / 1024:.0f} MB). Maximum allowed is 200 MB.",
        )
    df_bytes = await file.read()

    model_bytes: bytes | None = None
    if custom_model_file is not None:
        try:
            model_bytes = await custom_model_file.read()
            if not model_bytes:
                model_bytes = None
        except Exception as exc:
            logger.warning("Failed to read custom model file: %s", exc)
            model_bytes = None

    sensitive_list = [col.strip() for col in sensitive_cols.split(",") if col.strip()]
    metric_weights = get_metric_weights(metric_priority)

    task_id = str(uuid.uuid4())
    _store_set(task_id, {"status": "queued"})

    background_tasks.add_task(
        _run_pipeline,
        task_id=task_id,
        df_bytes=df_bytes,
        filename=display_name(file.filename),
        sensitive_list=sensitive_list,
        target_col=target_col,
        project_id=project_id,
        metric_weights=metric_weights,
        model_bytes=model_bytes,
        domain=domain,
        uid=uid,
        positive_label=(positive_label or "").strip() or None,
        ll144_rate_type=project_ll144_rate_type(project),
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
