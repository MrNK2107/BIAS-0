"""LLM-style remediation narrative generator.

Generates plain-English compliance documentation narratives from
structured compliance assessment data. Uses template-driven generation
that mimics LLM-quality output without requiring an external API.
"""

from __future__ import annotations

from typing import Any

# ── Domain-specific context templates ─────────────────────────────────────

DOMAIN_CONTEXT: dict[str, str] = {
    "criminal_justice": "Criminal justice applications carry the highest fairness burden — even minor disparities can have severe constitutional implications. Regulatory scrutiny under the EU AI Act classifies most criminal justice AI as 'high-risk' or 'unacceptable risk.'",
    "healthcare": "Healthcare AI systems affect patient outcomes directly. Regulatory frameworks require rigorous validation across demographic groups to prevent diagnostic or treatment disparities that could harm vulnerable populations.",
    "loan": "Financial services AI is heavily regulated under fair lending laws. Demographic parity is closely scrutinized by regulators including the CFPB and ECOA. Proxy features like zip code that correlate with race or gender are a primary enforcement focus.",
    "hiring": "Employment AI faces the most active regulatory landscape in 2024-2025. NYC Local Law 144 already mandates independent bias audits. The EEOC has signaled increased enforcement of disparate impact theory in AI-driven hiring.",
    "insurance": "Insurance AI must balance risk assessment with anti-discrimination requirements. Regulators focus on whether pricing or coverage decisions disproportionately affect protected groups, even when using actuarially justified factors.",
    "education": "Educational AI systems must ensure equal access and opportunity. Disparities in algorithmic admissions, grading, or resource allocation can reinforce systemic inequities across socioeconomic and demographic lines.",
    "marketing": "Marketing AI systems face lower regulatory burden but must avoid discriminatory targeting or exclusion. The FTC has warned against using protected attributes to exclude groups from housing, credit, or employment opportunities.",
    "other": "AI systems should be evaluated for fairness across all demographic groups. While regulatory requirements vary by domain, the core principles of transparency, accountability, and non-discrimination apply universally.",
}

REGULATION_NARRATIVES: dict[str, dict[str, str]] = {
    "eu_ai_act": {
        "intro": "The EU AI Act adopts a risk-based approach to AI regulation. High-risk AI systems must meet strict requirements for risk management, data governance, transparency, human oversight, and accuracy/fairness before deployment.",
        "compliant": "Your model meets the EU AI Act's fairness requirements for high-risk systems. Continue monitoring to maintain compliance as the regulatory framework evolves.",
        "near_compliant": "Your model is approaching EU AI Act compliance but requires targeted improvements. Focus on the gaps identified below to reach full compliance before the enforcement deadline.",
        "non_compliant": "Your model does not currently meet EU AI Act requirements for high-risk AI systems. Significant remediation is needed to address fairness gaps before this system could be deployed in regulated contexts.",
    },
    "nyc_law_144": {
        "intro": "NYC Local Law 144 requires independent bias audits for automated employment decision tools (AEDTs). The law mandates specific fairness metrics, public disclosure, and notification to candidates.",
        "compliant": "Your model meets NYC Local Law 144's audit requirements. Ensure you maintain documentation and notification procedures as required by the law's ongoing compliance provisions.",
        "near_compliant": "Your model partially satisfies NYC Local Law 144 requirements. To achieve full compliance, address the specific gaps highlighted below — particularly around independent audit and fairness thresholds.",
        "non_compliant": "Your model does not satisfy NYC Local Law 144 requirements. The law mandates an independent bias audit with specific fairness thresholds that your current model does not meet. Remediation is strongly recommended.",
    },
    "gdpr_article_22": {
        "intro": "GDPR Article 22 grants individuals the right to not be subject to decisions based solely on automated processing that produce legal effects. This requires meaningful human oversight and algorithmic fairness.",
        "compliant": "Your model aligns with GDPR Article 22 requirements. Ensure that human oversight mechanisms remain operational and that individuals can exercise their right to human review.",
        "near_compliant": "Your model is partially aligned with GDPR Article 22. Focus on strengthening fairness metrics and human oversight to ensure individuals' rights are fully protected.",
        "non_compliant": "Your model does not meet GDPR Article 22 standards. The current level of algorithmic bias may infringe on individuals' rights to not be subject to solely automated decisions with legal effects.",
    },
}

REMEDIATION_ACTIONS: dict[str, list[dict[str, str]]] = {
    "fairness_score": [
        {
            "action": "Rebalance training data",
            "detail": "Collect additional data from under-represented groups to improve representation and reduce model bias. Consider targeted data collection campaigns or synthetic data augmentation.",
        },
        {
            "action": "Apply fairness constraints",
            "detail": "Use techniques like adversarial debiasing, equalized odds post-processing, or reweighing to explicitly optimize for fairness during model training.",
        },
        {
            "action": "Swap to fairer model architecture",
            "detail": "Some model architectures are inherently more fair. Consider switching from complex ensemble methods to simpler, more interpretable models with fairness-aware training.",
        },
        {
            "action": "Threshold optimization",
            "detail": "Apply per-group decision thresholds optimized using the Youden index to balance true positive and false positive rates across demographic groups.",
        },
    ],
    "demographic_parity": [
        {
            "action": "Remove proxy features",
            "detail": "Identify and remove features that act as proxies for protected attributes. Use the platform's proxy detection results to identify the most correlated features.",
        },
        {
            "action": "Apply demographic parity constraint",
            "detail": "Use fairlearn's ExponentiatedGradient or GridSearch reductions to enforce demographic parity during training, ensuring equal approval rates across groups.",
        },
        {
            "action": "Post-processing calibration",
            "detail": "Calibrate model outputs using Platt scaling or isotonic regression applied separately per demographic group to equalize outcome distributions.",
        },
    ],
    "equal_opportunity": [
        {
            "action": "Equalize true positive rates",
            "detail": "Apply equal opportunity post-processing to ensure similar true positive rates across groups. This is particularly important when false negatives have high cost (e.g., loan denials).",
        },
        {
            "action": "Group-specific threshold tuning",
            "detail": "Tune decision thresholds per demographic group to achieve equal true positive rates while monitoring impact on false positive rates.",
        },
        {
            "action": "Adversarial training",
            "detail": "Use adversarial neural networks that penalize the model for being able to predict protected attributes from its representations, forcing invariant feature learning.",
        },
    ],
    "audit_documentation": [
        {
            "action": "Create model documentation",
            "detail": "Maintain comprehensive model documentation including training data provenance, preprocessing steps, fairness evaluation results, and deployment monitoring plans.",
        },
        {
            "action": "Establish audit trail",
            "detail": "Implement automated logging of model versions, training runs, and evaluation results. Use the platform's version comparison feature to track fairness over time.",
        },
    ],
    "independent_audit": [
        {
            "action": "Engage certified auditor",
            "detail": "NYC Local Law 144 requires independent audits. Engage a qualified third-party auditor who can certify compliance with the law's specific requirements.",
        },
        {
            "action": "Prepare audit package",
            "detail": "Compile model documentation, fairness evaluation results, training data description, and deployment details into a structured audit package ready for independent review.",
        },
    ],
    "human_oversight": [
        {
            "action": "Implement human-in-the-loop",
            "detail": "Design workflows where automated decisions are reviewed by qualified humans, especially for high-impact or borderline cases where fairness is most critical.",
        },
        {
            "action": "Create escalation procedures",
            "detail": "Establish clear procedures for escalating automated decisions to human reviewers when confidence is low or when the system detects potential fairness violations.",
        },
    ],
}


def _get_failed_metrics(compliance: dict[str, Any]) -> list[str]:
    """Identify which metric categories failed across all regulations."""
    failed: set[str] = set()
    for reg_key, reg in compliance.get("regulations", {}).items():
        for check in reg.get("checks", []):
            if not check.get("passed", False):
                check_name = check.get("check", "").lower()
                if "fairness score" in check_name:
                    failed.add("fairness_score")
                elif "demographic parity" in check_name:
                    failed.add("demographic_parity")
                elif "equal opportunity" in check_name:
                    failed.add("equal_opportunity")
                elif "audit documentation" in check_name:
                    failed.add("audit_documentation")
                elif "independent audit" in check_name:
                    failed.add("independent_audit")
                elif "human oversight" in check_name:
                    failed.add("human_oversight")
    return list(failed)


def _get_failed_regulations(compliance: dict[str, Any]) -> list[tuple[str, str]]:
    """Get list of (reg_key, status) for non-compliant regulations."""
    failed: list[tuple[str, str]] = []
    for reg_key, reg in compliance.get("regulations", {}).items():
        if reg.get("status") != "compliant":
            failed.append((reg_key, reg.get("status", "non_compliant")))
    return failed


def generate_compliance_narrative(compliance: dict[str, Any]) -> dict[str, Any]:
    """Generate a complete compliance narrative with executive summary,
    per-regulation narratives, and prioritized remediation actions."""

    metadata = compliance.get("metadata", {})
    fairness_score = metadata.get("fairness_score", 0)
    demographic_parity = metadata.get("demographic_parity", 0)
    equal_opportunity_gap = metadata.get("equal_opportunity_gap", 0)
    domain = metadata.get("domain", "other")
    domain_text = DOMAIN_CONTEXT.get(domain, DOMAIN_CONTEXT["other"])
    overall = compliance.get("overall", {})
    overall_status = overall.get("overall_status", "non_compliant")

    failed_metrics = _get_failed_metrics(compliance)
    failed_regs = _get_failed_regulations(compliance)

    # ── Executive Summary ───────────────────────────────────────────────
    if overall_status == "compliant":
        exec_summary = (
            f"**Compliance Status: Full Compliance.** Your model achieves a compliance score "
            f"of {overall.get('overall_score', 0):.0f}%, meeting all evaluated regulatory requirements. "
            f"Your fairness score of {fairness_score:.0f}/100 and demographic parity gap of "
            f"{demographic_parity:.1%} satisfy the thresholds of all{'' if len(compliance.get('regulations', {})) == 3 else ''} "
            f"applicable frameworks. Continue monitoring to maintain this standing."
        )
    elif overall_status == "partial":
        compliant = [
            k
            for k, v in compliance.get("regulations", {}).items()
            if v.get("status") == "compliant"
        ]
        non_compliant_names = [
            v.get("short_name", k)
            for k, v in compliance.get("regulations", {}).items()
            if v.get("status") != "compliant"
        ]
        exec_summary = (
            f"**Compliance Status: Partial Compliance.** Your model achieves a compliance score "
            f"of {overall.get('overall_score', 0):.0f}%, meeting requirements for {len(compliant)} of "
            f"{len(compliance.get('regulations', {}))} regulatory frameworks. "
            f"{'Your fairness score of ' + str(fairness_score) + '/100 ' if fairness_score else ''}"
            f"{'does not meet the thresholds required by ' + ', '.join(non_compliant_names) + '. ' if non_compliant_names else ''}"
            f"Targeted remediation is needed in the areas identified below to reach full compliance."
        )
    else:
        exec_summary = (
            f"**Compliance Status: Non-Compliant.** Your model achieves a compliance score "
            f"of {overall.get('overall_score', 0):.0f}%, falling short of all evaluated regulatory frameworks. "
            f"With a fairness score of {fairness_score:.0f}/100, demographic parity gap of "
            f"{demographic_parity:.1%}, and equal opportunity gap of {equal_opportunity_gap:.1%}, "
            f"significant remediation is required before this model can be deployed in regulated contexts."
        )

    # ── Domain Context ──────────────────────────────────────────────────
    domain_narrative = (
        f"**Domain Context ({domain.replace('_', ' ').title()}):** {domain_text}"
    )

    # ── Per-Regulation Narratives ───────────────────────────────────────
    regulation_narratives: dict[str, dict[str, Any]] = {}
    for reg_key, reg in compliance.get("regulations", {}).items():
        status = reg.get("status", "non_compliant")
        narratives = REGULATION_NARRATIVES.get(reg_key, {})
        intro = narratives.get("intro", "")
        if status == "compliant":
            status_narrative = narratives.get("compliant", "")
        elif status == "partial":
            status_narrative = narratives.get("near_compliant", "")
        else:
            status_narrative = narratives.get("non_compliant", "")

        # Generate specific failure details
        failed_checks = [c for c in reg.get("checks", []) if not c.get("passed", False)]
        failure_details: list[str] = []
        for check in failed_checks:
            check_name = check.get("check", "")
            current_val = check.get("value", "N/A")
            required_val = check.get("required", "N/A")
            if isinstance(current_val, float) and current_val <= 1:
                current_display = f"{current_val * 100:.1f}%"
            else:
                current_display = str(current_val)
            failure_details.append(
                f"- **{check_name}:** Current value is {current_display}, "
                f"but requires {required_val if isinstance(required_val, str) else ''} "
                f"{'' if isinstance(required_val, bool) else (f'{required_val * 100:.0f}%' if isinstance(required_val, float) and required_val <= 1 else str(required_val))}"
                f" — {check_name.split(' ')[0]} gap is {current_display} above the threshold."
                if "gap" in check_name.lower()
                else f"- **{check_name}:** Current value is {current_display}, "
                f"but requires {required_val if isinstance(required_val, str) else ''} "
                f"{'' if isinstance(required_val, bool) else (f'{required_val * 100:.0f}%' if isinstance(required_val, float) and required_val <= 1 else str(required_val))}."
            )

        regulation_narratives[reg_key] = {
            "intro": intro,
            "status_narrative": status_narrative,
            "failure_details": failure_details,
            "passed_count": reg.get("passed_checks", 0),
            "total_count": reg.get("total_checks", 0),
        }

    # ── Prioritized Remediation Actions ─────────────────────────────────
    remediation_actions: list[dict[str, Any]] = []
    seen_actions: set[str] = set()

    priority_order = [
        "fairness_score",
        "demographic_parity",
        "equal_opportunity",
        "audit_documentation",
        "independent_audit",
        "human_oversight",
    ]
    for metric in priority_order:
        if metric in failed_metrics:
            actions = REMEDIATION_ACTIONS.get(metric, [])
            for action in actions:
                action_key = action["action"]
                if action_key not in seen_actions:
                    seen_actions.add(action_key)
                    remediation_actions.append(
                        {
                            "priority": len(remediation_actions) + 1,
                            "category": metric.replace("_", " ").title(),
                            "action": action["action"],
                            "detail": action["detail"],
                        }
                    )

    # If compliant, add monitoring recommendations
    if not remediation_actions:
        remediation_actions.append(
            {
                "priority": 1,
                "category": "Monitoring",
                "action": "Continue monitoring",
                "detail": "Your model meets all evaluated compliance requirements. Maintain ongoing monitoring to detect any fairness degradation over time.",
            }
        )
        remediation_actions.append(
            {
                "priority": 2,
                "category": "Documentation",
                "action": "Document compliance posture",
                "detail": "Generate and archive compliance reports using this platform to create a documented audit trail for regulatory review.",
            }
        )

    return {
        "executive_summary": exec_summary,
        "domain_context": domain_narrative,
        "regulation_narratives": regulation_narratives,
        "remediation_actions": remediation_actions,
        "failed_regulations": [r[0] for r in failed_regs],
        "failed_metrics": failed_metrics,
    }
