"""Compliance scoring engine — maps fairness audit results to regulatory frameworks.

Supports:
  - EU AI Act (High-risk AI system requirements)
  - NYC Local Law 144 (Automated employment decision tools)
  - GDPR Article 22 (Automated individual decision-making)
"""

from __future__ import annotations

from typing import Any, TypedDict


class RegulationRequirement(TypedDict, total=False):
    name: str
    short_name: str
    description: str
    min_fairness_score: float
    max_demographic_parity: float
    max_equal_opportunity_gap: float
    requires_audit_documentation: bool
    requires_independent_audit: bool
    requires_human_oversight: bool
    color: str
    icon: str


REGULATIONS: dict[str, RegulationRequirement] = {
    "eu_ai_act": {
        "name": "EU AI Act",
        "short_name": "EU AI Act",
        "description": "High-risk AI systems must comply with strict fairness, transparency, and human oversight requirements under the EU's risk-based regulation framework.",
        "min_fairness_score": 70.0,
        "max_demographic_parity": 0.20,
        "max_equal_opportunity_gap": 0.20,
        "requires_audit_documentation": True,
        "requires_independent_audit": False,
        "requires_human_oversight": True,
        "color": "#C89D7C",
        "icon": "globe",
    },
    "nyc_law_144": {
        "name": "NYC Local Law 144",
        "short_name": "NYC Law 144",
        "description": "New York City's law requires independent bias audits for automated employment decision tools (AEDTs) used in hiring or promotion.",
        "min_fairness_score": 75.0,
        "max_demographic_parity": 0.15,
        "max_equal_opportunity_gap": 0.15,
        "requires_audit_documentation": True,
        "requires_independent_audit": True,
        "requires_human_oversight": True,
        "color": "#DFB99B",
        "icon": "building",
    },
    "gdpr_article_22": {
        "name": "GDPR Article 22",
        "short_name": "GDPR Art. 22",
        "description": "EU regulation granting individuals the right to not be subject to solely automated decisions that produce legal or similarly significant effects.",
        "min_fairness_score": 60.0,
        "max_demographic_parity": 0.25,
        "max_equal_opportunity_gap": 0.25,
        "requires_audit_documentation": True,
        "requires_independent_audit": False,
        "requires_human_oversight": True,
        "color": "#8FA89B",
        "icon": "shield",
    },
}


def _assess_regulation(
    regulation: RegulationRequirement,
    fairness_score: float,
    demographic_parity: float,
    equal_opportunity_gap: float,
    has_audit_documentation: bool = False,
    has_independent_audit: bool = False,
    has_human_oversight: bool = True,
) -> dict[str, Any]:
    """Assess compliance status for a single regulation."""

    checks: list[dict[str, Any]] = []

    # Fairness score check
    score_ok = fairness_score >= regulation["min_fairness_score"]
    checks.append(
        {
            "check": f"Fairness score ≥ {regulation['min_fairness_score']:.0f}",
            "value": round(fairness_score, 1),
            "passed": score_ok,
            "required": regulation["min_fairness_score"],
        }
    )

    # Demographic parity check
    dp_required = regulation.get("max_demographic_parity", 0.5)
    dp_ok = demographic_parity <= dp_required
    checks.append(
        {
            "check": f"Demographic parity gap ≤ {dp_required:.0%}",
            "value": round(demographic_parity, 3),
            "passed": dp_ok,
            "required": dp_required,
        }
    )

    # Equal opportunity check
    eo_required = regulation.get("max_equal_opportunity_gap", 0.5)
    eo_ok = equal_opportunity_gap <= eo_required
    checks.append(
        {
            "check": f"Equal opportunity gap ≤ {eo_required:.0%}",
            "value": round(equal_opportunity_gap, 3),
            "passed": eo_ok,
            "required": eo_required,
        }
    )

    # Documentation check
    if regulation.get("requires_audit_documentation", False):
        checks.append(
            {
                "check": "Audit documentation maintained",
                "value": "Yes" if has_audit_documentation else "No",
                "passed": has_audit_documentation,
                "required": True,
            }
        )

    # Independent audit check
    if regulation.get("requires_independent_audit", False):
        checks.append(
            {
                "check": "Independent audit conducted",
                "value": "Yes" if has_independent_audit else "No",
                "passed": has_independent_audit,
                "required": True,
            }
        )

    # Human oversight check
    if regulation.get("requires_human_oversight", False):
        checks.append(
            {
                "check": "Human oversight mechanism in place",
                "value": "Yes" if has_human_oversight else "No",
                "passed": has_human_oversight,
                "required": True,
            }
        )

    all_passed = all(c["passed"] for c in checks)
    passed_count = sum(1 for c in checks if c["passed"])
    total_count = len(checks)

    if all_passed:
        status = "compliant"
    elif passed_count >= total_count * 0.6:
        status = "partial"
    else:
        status = "non_compliant"

    return {
        "short_name": regulation["short_name"],
        "status": status,
        "passed_checks": passed_count,
        "total_checks": total_count,
        "checks": checks,
        "overall_score": round((passed_count / max(total_count, 1)) * 100, 1),
    }


def assess_compliance(
    fairness_score: float,
    demographic_parity: float,
    equal_opportunity_gap: float,
    has_audit_documentation: bool = False,
    has_independent_audit: bool = False,
    has_human_oversight: bool = True,
    domain: str = "other",
) -> dict[str, Any]:
    """Assess compliance across all regulatory frameworks.

    Returns a structured assessment per regulation plus an overall summary.
    """

    results: dict[str, dict[str, Any]] = {}

    for reg_key, regulation in REGULATIONS.items():
        results[reg_key] = _assess_regulation(
            regulation,
            fairness_score,
            demographic_parity,
            equal_opportunity_gap,
            has_audit_documentation=has_audit_documentation,
            has_independent_audit=has_independent_audit,
            has_human_oversight=has_human_oversight,
        )

    overall_passed = sum(r["passed_checks"] for r in results.values())
    overall_total = sum(r["total_checks"] for r in results.values())
    overall_status = (
        "compliant"
        if overall_passed == overall_total
        else "partial" if overall_passed >= overall_total * 0.75 else "non_compliant"
    )

    # Domain-specific compliance weighting
    domain_risk_multipliers = {
        "criminal_justice": 1.3,
        "healthcare": 1.2,
        "loan": 1.1,
        "hiring": 1.0,
        "insurance": 1.0,
        "education": 0.9,
        "marketing": 0.7,
        "other": 0.8,
    }
    risk_multiplier = domain_risk_multipliers.get(domain, 0.8)

    return {
        "regulations": results,
        "overall": {
            "compliant_count": sum(
                1 for r in results.values() if r["status"] == "compliant"
            ),
            "partial_count": sum(
                1 for r in results.values() if r["status"] == "partial"
            ),
            "non_compliant_count": sum(
                1 for r in results.values() if r["status"] == "non_compliant"
            ),
            "overall_score": round((overall_passed / max(overall_total, 1)) * 100, 1),
            "overall_status": overall_status,
            "risk_adjusted_score": round(
                min(
                    100,
                    max(
                        0,
                        (overall_passed / max(overall_total, 1))
                        * 100
                        / risk_multiplier,
                    ),
                )
            ),
        },
        "metadata": {
            "domain": domain,
            "fairness_score": fairness_score,
            "demographic_parity": demographic_parity,
            "equal_opportunity_gap": equal_opportunity_gap,
        },
    }
