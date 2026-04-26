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
) -> list[dict[str, Any]]:
    recommendations: list[dict[str, Any]] = []

    # ── Proxy-feature mitigations ─────────────────────────────────────────────
    proxy_features = proxy_result.get("proxy_features", [])
    for proxy in proxy_features[:2]:
        feature = str(proxy.get("feature", "unknown"))
        proxy_score = float(_safe(proxy.get("proxy_score") or proxy.get("cluster_proxy_score", 0.0)))
        correlated_with = str(
            proxy.get("correlated_with") or proxy.get("related_sensitive", "sensitive group")
        )
        is_numeric = _is_numeric_feature(feature)

        mitigation_options: list[dict[str, Any]] = [
            {
                "option": "A",
                "name": "Remove",
                "description": f"Remove {feature} from the feature set entirely",
                "rationale": f"Complete removal eliminates any discrimination signal from {feature}.",
                "estimated_impact": "Fairness score: +20 pts; Accuracy: -2%",
            }
        ]
        if is_numeric:
            mitigation_options.append({
                "option": "B",
                "name": "Bucketing",
                "description": (
                    f"Replace {feature} with a 4-bucket ordinal encoding to break "
                    f"fine-grained demographic correlations"
                ),
                "rationale": (
                    f"Discretizing {feature} into quartiles reduces its ability to encode "
                    f"sensitive-group identity while retaining predictive signal."
                ),
                "estimated_impact": "Fairness score: +12 pts; Accuracy: -0.5%",
            })
        mitigation_options.append({
            "option": "C",
            "name": "PCA Projection",
            "description": (
                f"Combine {feature} with correlated features into a principal component "
                f"that removes sensitive-group signal"
            ),
            "rationale": (
                f"PCA creates a latent feature that captures variance in {feature} "
                f"while orthogonalizing away the {correlated_with} signal."
            ),
            "estimated_impact": "Fairness score: +15 pts; Accuracy: -0.3%",
        })

        recommendations.append(_safe({
            "fix_id": f"remove_{feature}",
            "fix_type": "feature_level",
            "bias_type": "proxy_leakage",
            "description": f"Mitigate proxy feature: {feature}",
            "rationale": (
                f"{feature} has proxy score {proxy_score:.2f} with {correlated_with} — "
                f"choose a mitigation strategy below."
            ),
            "estimated_impact": "Varies by option selected",
            "mitigation_options": mitigation_options,
            "feature": feature,
            "proxy_score": proxy_score,
        }))

    # ── Representation bias ───────────────────────────────────────────────────
    under_represented = audit_result.get("under_represented_groups", [])
    if under_represented:
        recommendations.append(_safe({
            "fix_id": "resample_minority",
            "fix_type": "data_level",
            "bias_type": "representation_bias",
            "description": "Oversample the under-represented group using SMOTE",
            "rationale": (
                f"{', '.join(str(g) for g in under_represented)} are under-represented; "
                f"resampling can reduce model bias."
            ),
            "estimated_impact": "Fairness score may improve by ~15 pts.",
        }))

    # ── Label bias ────────────────────────────────────────────────────────────
    approval_gap = 0.0
    for sensitive_stats in audit_result.get("group_stats", {}).values():
        rates = [float(_safe(g.get("positive_rate", 0.0))) for g in sensitive_stats.values()]
        if rates:
            approval_gap = max(approval_gap, max(rates) - min(rates))
    if approval_gap > 0.4:
        recommendations.append(_safe({
            "fix_id": "label_audit",
            "fix_type": "process_level",
            "bias_type": "label_bias",
            "description": "Audit historical labels for bias",
            "rationale": (
                "Large approval gaps suggest the labels may reflect historic bias "
                "rather than merit."
            ),
            "estimated_impact": "Fairness score may improve materially after relabeling.",
        }))

    # ── Threshold bias ────────────────────────────────────────────────────────
    fpr_gap = float(_safe(bias_result.get("metrics", {}).get("fpr_gap", 0.0)))
    if fpr_gap > 0.2:
        recommendations.append(_safe({
            "fix_id": "threshold_tune",
            "fix_type": "model_level",
            "bias_type": "threshold_bias",
            "description": "Optimize per-group decision thresholds",
            "rationale": (
                "High false-positive disparity suggests threshold calibration "
                "may help equalize mistakes across groups."
            ),
            "estimated_impact": "Fairness score may improve by ~10 pts with modest accuracy trade-offs.",
        }))

    # ── Algorithmic bias ──────────────────────────────────────────────────────
    fairness_score = float(_safe(bias_result.get("fairness_score", 100)))
    if fairness_score < 60:
        recommendations.append(_safe({
            "fix_id": "fairness_constrained_model",
            "fix_type": "model_level",
            "bias_type": "algorithmic_bias",
            "description": "Train a fairness-constrained model (ExponentiatedGradient + DemographicParity)",
            "rationale": (
                "Fairness-constrained optimisation directly penalises group disparity "
                "during training rather than post-hoc correction."
            ),
            "estimated_impact": "Fairness score may improve by ~25 pts with ~3-5% accuracy trade-offs.",
        }))

    # ── Minimum 3 recommendations ─────────────────────────────────────────────
    existing_ids = {r["fix_id"] for r in recommendations}
    defaults = [
        {
            "fix_id": "collect_more_data",
            "fix_type": "data_level",
            "bias_type": "representation_bias",
            "description": "Collect more balanced training data",
            "rationale": (
                "The most fundamental fix for any bias issue is ensuring training data "
                "represents all groups fairly."
            ),
            "estimated_impact": "Long-term improvement of 15-30 pts depending on collection quality.",
        },
        {
            "fix_id": "human_review_loop",
            "fix_type": "process_level",
            "bias_type": "process_bias",
            "description": "Add mandatory human review for borderline cases near the decision threshold",
            "rationale": "Human oversight at the margin reduces automated discrimination for edge cases.",
            "estimated_impact": "Reduces false-positive disparity without any accuracy trade-off.",
        },
    ]
    for default in defaults:
        if len(recommendations) >= 3:
            break
        if default["fix_id"] not in existing_ids:
            recommendations.append(_safe(default))

    return recommendations[:5]
