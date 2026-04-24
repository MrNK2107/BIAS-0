from __future__ import annotations

from typing import Any

import pandas as pd


def _is_numeric_feature(feature_name: str) -> bool:
    """Heuristic: assume feature is numeric if it doesn't contain certain keywords."""
    categorical_keywords = ["name", "category", "type", "status", "code", "id"]
    return not any(keyword in feature_name.lower() for keyword in categorical_keywords)


def generate_fix_recommendations(audit_result: dict[str, Any], proxy_result: dict[str, Any], bias_result: dict[str, Any]) -> list[dict[str, Any]]:
    recommendations: list[dict[str, Any]] = []

    proxy_features = proxy_result.get("proxy_features", [])
    if proxy_features:
        for proxy in proxy_features[:2]:  # Process top 2 proxies
            feature = proxy["feature"]
            proxy_score = proxy["proxy_score"]
            correlated_with = proxy.get("correlated_with", proxy.get("related_sensitive", "sensitive group"))
            is_numeric = _is_numeric_feature(feature)
            
            # Generate three mitigation options
            mitigation_options = []
            
            # Option A: Removal
            mitigation_options.append({
                "option": "A",
                "name": "Remove",
                "description": f"Remove {feature} from the feature set entirely",
                "rationale": f"Complete removal eliminates any potential discrimination signal from {feature}.",
                "estimated_impact": "Fairness score: +20 points; Accuracy: -2%",
            })
            
            # Option B: Bucketing (only if numeric)
            if is_numeric:
                mitigation_options.append({
                    "option": "B",
                    "name": "Bucketing",
                    "description": f"Replace {feature} with a 4-bucket ordinal encoding to break fine-grained geographic/demographic correlations",
                    "rationale": f"Discretizing {feature} into quartiles reduces the feature's ability to encode sensitive-group identity while retaining predictive signal.",
                    "estimated_impact": "Fairness score: +12 points; Accuracy: -0.5%",
                })
            
            # Option C: PCA/dimensionality reduction
            mitigation_options.append({
                "option": "C",
                "name": "PCA Projection",
                "description": f"Combine {feature} with other correlated features into a principal component that removes sensitive-group signal",
                "rationale": f"PCA creates a latent feature that captures variance in {feature} while orthogonalizing away the {correlated_with} signal.",
                "estimated_impact": "Fairness score: +15 points; Accuracy: -0.3%",
            })
            
            recommendations.append({
                "fix_id": f"remove_{feature}",
                "fix_type": "feature_level",
                "bias_type": "proxy_leakage",
                "description": f"Mitigate proxy feature: {feature}",
                "rationale": f"{feature} has proxy score {proxy_score} with {correlated_with} — choose a mitigation strategy below.",
                "estimated_impact": "Varies by option selected",
                "mitigation_options": mitigation_options,
                "feature": feature,
                "proxy_score": proxy_score,
            })

    under_represented = audit_result.get("under_represented_groups", [])
    if under_represented:
        recommendations.append(
            {
                "fix_id": "resample_minority",
                "fix_type": "data_level",
                "bias_type": "representation_bias",
                "description": "Oversample the under-represented group using SMOTE",
                "rationale": f"{', '.join(under_represented)} are under-represented; resampling can reduce model bias.",
                "estimated_impact": "Fairness score may improve by ~15 points.",
            }
        )

    approval_gap = 0.0
    for sensitive_stats in audit_result.get("group_stats", {}).values():
        rates = [group.get("positive_rate", 0.0) for group in sensitive_stats.values()]
        if rates:
            approval_gap = max(approval_gap, max(rates) - min(rates))
    if approval_gap > 0.4:
        recommendations.append(
            {
                "fix_id": "label_audit",
                "fix_type": "process_level",
                "bias_type": "label_bias",
                "description": "Audit historical labels for bias",
                "rationale": "Large approval gaps suggest the labels may reflect historic bias rather than merit.",
                "estimated_impact": "Fairness score may improve materially after relabeling or policy review.",
            }
        )

    fpr_gap = bias_result.get("metrics", {}).get("fpr_gap", 0.0)
    if fpr_gap > 0.2:
        recommendations.append(
            {
                "fix_id": "threshold_tune",
                "fix_type": "model_level",
                "bias_type": "threshold_bias",
                "description": "Optimize per-group decision thresholds",
                "rationale": "High false-positive disparity suggests threshold calibration may help equalize mistakes.",
                "estimated_impact": "Fairness score may improve by ~10 points with modest accuracy trade-offs.",
            }
        )

    fairness_score = bias_result.get("fairness_score", 100)
    if fairness_score < 60:
        recommendations.append(
            {
                "fix_id": "fairness_constrained_model",
                "fix_type": "model_level",
                "bias_type": "algorithmic_bias",
                "description": "Train a fairness-constrained model using ExponentiatedGradient with DemographicParity constraint",
                "rationale": "Fairness-constrained optimization directly penalizes group disparity during training rather than post-hoc correction.",
                "estimated_impact": "Fairness score may improve by ~25 points with ~3-5% accuracy trade-offs.",
            }
        )

    if len(recommendations) < 3:
        existing_ids = {r["fix_id"] for r in recommendations}
        if "collect_more_data" not in existing_ids:
            recommendations.append(
                {
                    "fix_id": "collect_more_data",
                    "fix_type": "data_level",
                    "bias_type": "representation_bias",
                    "description": "Collect more balanced training data",
                    "rationale": "The most fundamental fix for any bias issue is ensuring training data represents all groups fairly.",
                    "estimated_impact": "Long-term improvement of 15-30 points depending on collection quality.",
                }
            )
        if "human_review_loop" not in existing_ids:
            recommendations.append(
                {
                    "fix_id": "human_review_loop",
                    "fix_type": "process_level",
                    "bias_type": "process_bias",
                    "description": "Add a mandatory human review step for borderline cases near the decision threshold",
                    "rationale": "Human oversight at the margin reduces automated discrimination for edge cases.",
                    "estimated_impact": "Reduces false-positive disparity without any accuracy trade-off.",
                }
            )

    return recommendations[:5]
