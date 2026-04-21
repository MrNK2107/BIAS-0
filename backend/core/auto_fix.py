from __future__ import annotations

from typing import Any


def generate_fix_recommendations(audit_result: dict[str, Any], proxy_result: dict[str, Any], bias_result: dict[str, Any]) -> list[dict[str, Any]]:
    recommendations: list[dict[str, Any]] = []

    proxy_features = proxy_result.get("proxy_features", [])
    if proxy_features:
        top_proxy = proxy_features[0]
        recommendations.append(
            {
                "fix_id": f"remove_{top_proxy['feature'].replace(' ', '_').lower()}",
                "fix_type": "feature_level",
                "bias_type": "proxy_leakage",
                "description": f"Remove {top_proxy['feature']} from the feature set",
                "rationale": f"{top_proxy['feature']} has proxy score {top_proxy['proxy_score']} with {top_proxy.get('correlated_with')} — removing it may reduce indirect discrimination.",
                "estimated_impact": "Fairness score may improve by ~20 points; accuracy may drop by ~2%.",
            }
        )

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

    return recommendations[:5]
