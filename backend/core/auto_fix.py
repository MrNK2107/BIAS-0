"""Auto-fix recommendation engine.

All output values are cast to native Python types to prevent
`TypeError: Object of type int64/float64 is not JSON serializable`.
"""
from __future__ import annotations

from typing import Any

import numpy as np


def _safe(val: Any) -> Any:
    """Recursively convert NumPy scalars to native Python types."""
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        return float(val)
    if isinstance(val, (np.bool_,)):
        return bool(val)
    if isinstance(val, dict):
        return {k: _safe(v) for k, v in val.items()}
    if isinstance(val, (list, tuple)):
        return [_safe(v) for v in val]
    return val


def _is_numeric_feature(feature_name: str) -> bool:
    categorical_keywords = ["name", "category", "type", "status", "code", "id"]
    return not any(keyword in feature_name.lower() for keyword in categorical_keywords)


def generate_fix_recommendations(
    audit_result: dict[str, Any],
    proxy_result: dict[str, Any],
    bias_result: dict[str, Any],
    counterfactual_score: float | None = None,
    stress_test_score: float | None = None,
    proxy_risk_score: float | None = None,
) -> list[dict[str, Any]]:
    recommendations: list[dict[str, Any]] = []

    # 1. Proxy Risk Recommendations
    proxy_features = proxy_result.get("proxy_features", [])
    if proxy_risk_score is not None and proxy_risk_score < 70:
        top_proxy = proxy_features[0].get("feature", "X") if proxy_features else "X"
        fix_id = f"remove_{top_proxy.replace(' ', '_')}"
        recommendations.append({
            "fix_id": fix_id,
            "fix_type": "feature_level",
            "issue": f"High proxy risk detected (Score: {proxy_risk_score})",
            "description": f"Remove proxy features like '{top_proxy}' which correlate strongly with protected attributes.",
            "estimated_impact": "Expected +5-15 fairness score improvement by removing proxy variables.",
            "mitigation_options": [{"option": "default", "rationale": "Dropping the proxy feature eliminates indirect discrimination pathways."}],
            "type": "feature_removal"
        })

    # 2. Counterfactual Recommendations
    if counterfactual_score is not None and counterfactual_score < 60:
        recommendations.append({
            "fix_id": "adversarial_training",
            "fix_type": "model_level",
            "issue": f"Poor counterfactual robustness (Score: {counterfactual_score})",
            "description": "The model is highly sensitive to protected attributes. Use adversarial training to decorrelate predictions from sensitive features.",
            "estimated_impact": "Expected +10-20 fairness score improvement through representation debiasing.",
            "mitigation_options": [{"option": "default", "rationale": "Adversarial training forces the model to learn invariant representations."}],
            "type": "adversarial_training"
        })

    # 3. Stress Test Recommendations
    if stress_test_score is not None and stress_test_score < 60:
        recommendations.append({
            "fix_id": "robustness_tuning",
            "fix_type": "model_level",
            "issue": f"Stress test failure (Score: {stress_test_score})",
            "description": "Model is not robust to data shifts. Implement domain adaptation or increase noise tolerance during training.",
            "estimated_impact": "Expected +8-12 fairness score improvement under distribution shifts.",
            "mitigation_options": [{"option": "default", "rationale": "Robust training improves model stability across demographic strata."}],
            "type": "robustness_tuning"
        })

    # 4. Data Audit Recommendations
    under_represented = audit_result.get("under_represented_groups", [])
    if under_represented:
        recommendations.append({
            "fix_id": "smote_rebalance",
            "fix_type": "data_level",
            "issue": f"Under-representation bias: {', '.join(str(g) for g in under_represented)}",
            "description": "Apply SMOTE or random oversampling to balance the representation of minority groups.",
            "estimated_impact": "Expected +5-12 fairness score improvement through balanced training data.",
            "mitigation_options": [{"option": "default", "rationale": "Synthetic oversampling ensures minority groups are adequately represented."}],
            "type": "data_rebalancing"
        })

    # 5. Bias Mitigation
    fairness_score = float(_safe(bias_result.get("fairness_score", 100)))
    if fairness_score < 60:
        recommendations.append({
            "fix_id": "fairness_constraints",
            "fix_type": "model_level",
            "issue": f"High algorithmic bias (Fairness: {fairness_score})",
            "description": "Integrate fairness constraints into the loss function using Exponentiated Gradient or Grid Search reductions.",
            "estimated_impact": "Expected +15-25 fairness score improvement via constrained optimization.",
            "mitigation_options": [{"option": "default", "rationale": "Fairness constraints explicitly penalize disparate outcomes during training."}],
            "type": "fairness_constraints"
        })

    # Ensure we always have some recommendations
    if not recommendations:
        recommendations.append({
            "fix_id": "threshold_tune",
            "fix_type": "policy_level",
            "issue": "Baseline bias check complete",
            "description": "Continue monitoring model performance across all sub-groups to ensure long-term stability.",
            "estimated_impact": "Expected +3-8 fairness score improvement through careful threshold tuning.",
            "mitigation_options": [{"option": "default", "rationale": "Post-processing threshold adjustment provides quick, reversible improvements."}],
            "type": "monitoring"
        })

    return [_safe(r) for r in recommendations[:5]]
