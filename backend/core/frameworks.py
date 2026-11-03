"""Map an outcome audit to the regulatory frameworks BIAS-0 customers face.

Each control says what the framework asks for, whether *this audit* produces
evidence for it, and points at that evidence. Status values:

- ``evidenced``: the audit produced the evidence the control asks for.
- ``partial``: some of it; the note says what the customer must add.
- ``not_evidenced``: outside what a decision-log audit can show (for example
  human oversight or auditor independence). Listed so nobody assumes it is covered.

This is a reporting aid, not legal advice. Statuses of the instruments
(``FRAMEWORKS[...]["status_note"]``) move: verify before quoting to a customer.
"""

from __future__ import annotations

from typing import Any

FRAMEWORKS: dict[str, dict[str, str]] = {
    "eu_ai_act": {
        "name": "EU AI Act (Regulation (EU) 2024/1689)",
        "scope": "High-risk systems in Annex III, including creditworthiness assessment and employment decisions.",
        "status_note": "High-risk obligations were reported in 2026 as postponed to 2 Dec 2027 (Digital Omnibus). Confirm against the Official Journal.",
    },
    "nyc_ll144": {
        "name": "NYC Local Law 144 (6 RCNY 5-300 to 5-304)",
        "scope": "Automated employment decision tools used for candidates or employees in New York City.",
        "status_note": "In force since 5 Jul 2023. Requires an annual independent bias audit and a published summary.",
    },
    "rbi_free_ai": {
        "name": "RBI FREE-AI framework (Aug 2025)",
        "scope": "AI in Indian regulated financial entities, including credit decisions.",
        "status_note": "Committee recommendations; not confirmed as binding directions. Verify the current RBI position.",
    },
    "dpdp": {
        "name": "India Digital Personal Data Protection Act 2023 and Rules",
        "scope": "Processing of digital personal data, including the group attributes used for this audit.",
        "status_note": "In force, obligations phased in under the DPDP Rules.",
    },
}


def _c(framework: str, ref: str, requirement: str, status: str, evidence: str) -> dict[str, str]:
    return {"framework": framework, "ref": ref, "requirement": requirement, "status": status, "evidence": evidence}


def map_controls(audit: dict[str, Any]) -> list[dict[str, str]]:
    """Controls for one outcome audit result (``run_outcome_audit`` output)."""
    m = audit["mapping"]
    attrs = ", ".join(m["group_cols"])
    has_outcome = bool(m.get("outcome_col"))
    has_score = bool(m.get("score_col"))
    drift = audit.get("drift") or {}
    n_periods = len(drift.get("periods") or [])
    n_inter = len(audit.get("intersections") or {})
    unknown_total = sum(a.get("unknown_count", 0) for a in audit["attributes"].values())
    small = sum(a.get("n_small_groups", 0) for a in audit["attributes"].values())

    out = [
        _c("eu_ai_act", "Art. 10(2)(f)", "Examine data for possible biases likely to affect fundamental rights or lead to discrimination.",
           "evidenced", f"Selection-rate and impact-ratio analysis with 95% CIs across {attrs} and {n_inter} intersection(s); see Findings."),
        _c("eu_ai_act", "Art. 10(2)(g)", "Measures to detect, prevent and mitigate the biases identified.",
           "partial", "Detection is evidenced here. Prevention and mitigation measures are the provider's; record them against each finding."),
        _c("eu_ai_act", "Art. 10(3)", "Data sets sufficiently representative, with appropriate statistical properties for the persons concerned.",
           "partial" if small else "evidenced",
           f"Group sizes reported with small-sample flags ({small} group(s) below {audit['config']['min_group_size']} decisions)." if small
           else "Every group meets the minimum size; group sizes are reported."),
        _c("eu_ai_act", "Art. 10(5)", "Special categories of personal data processed for bias detection only with appropriate safeguards.",
           "partial", "This audit processed the group attributes listed in Scope. Document the safeguards (pseudonymisation, access control, deletion)."),
        _c("eu_ai_act", "Art. 12", "Automatic recording of events (logs) over the system's lifetime.",
           "evidenced" if m.get("time_col") else "partial",
           f"The audited input is a timestamped decision log ('{m['time_col']}')." if m.get("time_col")
           else "The log has no timestamp column; supply one for traceability."),
        _c("eu_ai_act", "Art. 15(1)", "Appropriate accuracy, consistently across the lifecycle.",
           "evidenced" if has_outcome else "not_evidenced",
           f"Per-group TPR/FPR against '{m['outcome_col']}' (coverage {audit.get('outcome_coverage', 0):.0%})." if has_outcome
           else "No outcome column, so accuracy by group cannot be shown."),
        _c("eu_ai_act", "Art. 14", "Human oversight measures.",
           "not_evidenced", "Not observable from a decision log. Document reviewer roles and override rates separately."),
        _c("eu_ai_act", "Art. 72", "Post-market monitoring plan and data.",
           "evidenced" if n_periods >= 3 else ("partial" if n_periods else "not_evidenced"),
           f"Fairness drift over {n_periods} {drift.get('period_label', 'period')}(s) with breach/watch alerts." if n_periods
           else "No time column, so no drift view."),
        _c("nyc_ll144", "5-301(b)", "Selection rate and impact ratio for each category (sex, race/ethnicity) and their intersections.",
           "evidenced" if n_inter else "partial",
           f"Impact-ratio tables for {attrs}" + (f" and {n_inter} intersection(s)." if n_inter else ". Add a second attribute for intersections.")
           + " LL144 categories are EEO-1 sex and race/ethnicity; map your columns accordingly."),
        _c("nyc_ll144", "5-301(b)(5)", "Number of individuals in an unknown category, excluded from the calculations.",
           "evidenced", f"{unknown_total} unknown-category decision(s) excluded and counted."),
        _c("nyc_ll144", "5-301(c)", "Scoring rate (share above the full-sample median) when the tool scores candidates.",
           "evidenced" if has_score else "not_evidenced",
           f"Scoring-rate table from '{m['score_col']}'." if has_score else "No score column supplied; selection rates used."),
        _c("nyc_ll144", "5-300 / 5-301", "Audit by an independent auditor; historical data from the employer's own use where available.",
           "not_evidenced", "BIAS-0 is the instrument. An independent auditor must perform and sign the audit (see Sign-off)."),
        _c("nyc_ll144", "5-303", "Publish a summary of results (date, distribution date, data source, numbers) before use.",
           "partial", "This report contains the required numbers; publication is the employer's step."),
        _c("rbi_free_ai", "Fairness audits", "Regular fairness and bias testing of AI models used in credit decisions.",
           "evidenced", "Outcome audit of actual decisions with uncertainty and a stated verdict rule."),
        _c("rbi_free_ai", "Monitoring", "Ongoing monitoring of AI model behaviour after deployment.",
           "evidenced" if n_periods >= 3 else "partial",
           "Fairness drift by period." if n_periods >= 3 else "Supply a timestamp column to monitor over time."),
        _c("rbi_free_ai", "Disclosure", "Disclose AI-driven credit assessment to customers.",
           "not_evidenced", "Customer disclosure is outside a decision-log audit."),
        _c("dpdp", "Purpose limitation, s.4-6", "Process personal data only for a lawful, specified purpose, with notice or a legitimate use.",
           "partial", "Record the legal basis for using the group attributes for bias testing."),
        _c("dpdp", "Data minimisation", "Use only the data needed.",
           "evidenced", "The report carries aggregates only: no row-level data, identifiers or scores of individuals."),
    ]
    return out


def control_summary(controls: list[dict[str, str]]) -> dict[str, Any]:
    by_fw: dict[str, dict[str, int]] = {}
    for c in controls:
        counts = by_fw.setdefault(c["framework"], {"evidenced": 0, "partial": 0, "not_evidenced": 0})
        counts[c["status"]] += 1
    return {
        fw: {**counts, "total": sum(counts.values()), "name": FRAMEWORKS[fw]["name"]}
        for fw, counts in by_fw.items()
    }
