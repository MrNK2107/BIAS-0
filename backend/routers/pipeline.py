from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, File, Form, UploadFile
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

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


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


@router.post("/run-all")
async def run_all(
    file: UploadFile = File(...),
    sensitive_cols: str = Form(...),
    target_col: str = Form(...),
    project_id: int = Form(...),
    metric_priority: str = Form(default="balanced"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Unified precomputation endpoint. Runs all analysis stages in a single sweep
    and returns a consolidated result object. Persists the full result to the DB.
    """
    df = await upload_file_to_dataframe(file)
    sensitive_list = [col.strip() for col in sensitive_cols.split(",") if col.strip()]
    metric_weights = _get_metric_weights(metric_priority)
    prepared = prepare_split(df, target_col)
    shared_model = build_classifier(prepared.X_train, model_type="rf")
    shared_model.fit(prepared.X_train, prepared.y_train)

    # ── Stage 1: Data Audit ──────────────────────────────────────────────────
    data_audit = run_data_audit(df, sensitive_list, target_col)

    # ── Stage 2: Proxy Detection ─────────────────────────────────────────────
    proxy = detect_proxy_features(df, sensitive_list)

    # ── Stage 3: Model Bias ──────────────────────────────────────────────────
    model_bias = run_model_bias_analysis(
        df, sensitive_list, target_col,
        model=shared_model,
        metric_weights=metric_weights,
    )

    # ── Stage 4: Explainability (SHAP) ───────────────────────────────────────
    explanations = explain_flagged_decisions(
        df, shared_model, sensitive_list, target_col, n_samples=5
    )

    # ── Stage 5: Narrative Summary ───────────────────────────────────────────
    # domain is not passed through this endpoint; use a generic fallback
    explain_summary = generate_narrative_summary(explanations, sensitive_list, domain="general")

    # ── Stage 6: Counterfactual (first sensitive col) ────────────────────────
    primary_sensitive_col = sensitive_list[0] if sensitive_list else target_col
    counterfactual = run_counterfactual_test(
        df, shared_model, primary_sensitive_col, target_col, metric_weights=metric_weights
    )

    # ── Stage 7: Stress Tests ────────────────────────────────────────────────
    stress = run_stress_tests(df, shared_model, sensitive_list, target_col)

    # ── Stage 8: Fix Recommendations ─────────────────────────────────────────
    recommendations = generate_fix_recommendations(data_audit, proxy, model_bias)

    # ── Consolidate ──────────────────────────────────────────────────────────
    result: dict[str, Any] = {
        "data_audit": data_audit,
        "proxy": proxy,
        "model_bias": model_bias,
        "explanations": explanations,
        "explain_summary": explain_summary,
        "counterfactual": counterfactual,
        "stress": stress,
        "recommendations": recommendations,
    }

    # ── Persist to DB ─────────────────────────────────────────────────────────
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

    return result
