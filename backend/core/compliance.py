"""Compliance scoring engine — maps fairness audit results to regulatory frameworks.

Supports:
  - EU AI Act (High-risk AI system requirements)
  - NYC Local Law 144 (Automated employment decision tools)
  - GDPR Article 22 (Automated individual decision-making)

NYC LL144 bias audits are defined by the DCWP rule (6 RCNY 5-300 / 5-301,
https://rules.cityofnewyork.us/wp-content/uploads/2023/04/DCWP-NOA-for-Use-of-Automated-Employment-Decisionmaking-Tools-2.pdf):
an audit must calculate the selection rate (or, for scoring tools, the scoring
rate: share of a category scoring above the full-sample median) and the impact
ratio for each category, where impact ratio = rate of the category / rate of
the most selected (highest scoring) category. Individuals in an unknown
category are left out and counted. The rule sets no pass/fail threshold; the
four-fifths (0.80) rule shown here is the EEOC Uniform Guidelines rule of
thumb, reported as an informational heuristic only.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypedDict

import numpy as np
import pandas as pd

UNKNOWN_CATEGORIES = {"(missing)", "unknown", "nan", "none", ""}
FOUR_FIFTHS = 0.8


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
    impact_ratio_audit: bool
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
        "description": "New York City's law requires an independent bias audit, at most a year old, of automated employment decision tools (AEDTs) used in hiring or promotion. The audit reports selection (or scoring) rates and impact ratios per sex, race/ethnicity and intersectional category; the rule sets no pass/fail threshold.",
        # LL144 defines the audit by impact ratios (6 RCNY 5-301), not by a
        # fairness score or parity gap, and has no human-oversight requirement.
        "impact_ratio_audit": True,
        "requires_audit_documentation": True,
        "requires_independent_audit": True,
        "requires_human_oversight": False,
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


def _is_unknown(category: Any) -> bool:
    return str(category).strip().lower() in UNKNOWN_CATEGORIES


SMALL_CATEGORY_SHARE = 0.02


def impact_ratios(
    rates_by_attribute: Mapping[str, Mapping[str, float | None]],
    counts_by_attribute: Mapping[str, Mapping[str, int]] | None = None,
    exclude_small_categories: bool = False,
    exclusion_justification: str | None = None,
) -> dict[str, dict[str, Any]]:
    """Impact ratio per category, as 6 RCNY 5-300 defines it.

    ``rates_by_attribute`` maps attribute -> {category: selection or scoring rate}.
    Each ratio is the category's rate divided by the highest rate among known
    categories. Unknown categories ("(missing)") are left out of the
    calculation and listed under ``unknown_categories`` (5-301(b)(5)). A ratio
    is None when the top rate is 0 or the category's rate is undefined.

    ``counts_by_attribute`` (attribute -> {category: number of individuals})
    adds ``n`` to each row. With ``exclude_small_categories`` (off by default:
    5-301(d) says the auditor *may* exclude) a category under 2% of the
    attribute's data is left out of the impact ratios and reported under
    ``excluded_categories`` with its count, share and rate, together with the
    auditor's ``exclusion_justification``, which the summary of results must
    include. Without counts the exclusion is not applied.
    """
    counts_by_attribute = counts_by_attribute or {}
    out: dict[str, dict[str, Any]] = {}
    for attr, rates in rates_by_attribute.items():
        counts = {str(c): int(n) for c, n in (counts_by_attribute.get(attr) or {}).items()}
        known = {str(c): r for c, r in rates.items() if not _is_unknown(c)}
        unknown = sorted(str(c) for c in rates if _is_unknown(c))
        excluded: list[dict[str, Any]] = []
        note: str | None = None
        if exclude_small_categories:
            total = sum(counts.values())
            if not counts or total <= 0:
                note = "Small-category exclusion not applied: category counts were not provided."
            else:
                for cat in list(known):
                    share = counts.get(cat, 0) / total
                    if cat in counts and share < SMALL_CATEGORY_SHARE:
                        rate = known.pop(cat)
                        excluded.append(
                            {
                                "category": cat,
                                "n": counts[cat],
                                "share": round(share, 4),
                                "rate": None if rate is None else round(float(rate), 4),
                            }
                        )
                if excluded and not (exclusion_justification or "").strip():
                    note = (
                        "Categories under 2% were excluded (6 RCNY 5-301(d)); the summary "
                        "of results must include the auditor's justification, which is missing."
                    )
        defined = {c: float(r) for c, r in known.items() if r is not None}
        top_cat = max(defined, key=lambda c: defined[c]) if defined else None
        top = defined[top_cat] if top_cat is not None else 0.0
        rows = []
        for cat, rate in known.items():
            ratio = None
            if rate is not None and top > 0:
                ratio = round(float(rate) / top, 4)
            row: dict[str, Any] = {
                "category": cat,
                "rate": None if rate is None else round(float(rate), 4),
                "impact_ratio": ratio,
            }
            if cat in counts:
                row["n"] = counts[cat]
            rows.append(row)
        rows.sort(key=lambda r: (r["impact_ratio"] is None, r["impact_ratio"] or 0.0))
        ratios = [r["impact_ratio"] for r in rows if r["impact_ratio"] is not None]
        out[str(attr)] = {
            "categories": rows,
            "most_selected": top_cat if top > 0 else None,
            "min_impact_ratio": min(ratios) if ratios else None,
            "unknown_categories": unknown,
            "unknown_count": sum(n for c, n in counts.items() if _is_unknown(c)),
            "excluded_categories": excluded,
            "exclusion_justification": (exclusion_justification or None) if excluded else None,
            "exclusion_note": note,
        }
    return out


def scoring_rates(scores: pd.Series, groups: pd.Series) -> dict[str, float]:
    """LL144 scoring rate: share of each category scoring above the median
    score of the full sample (6 RCNY 5-300, "Scoring Rate")."""
    scores = pd.Series(scores).astype(float).reset_index(drop=True)
    groups = pd.Series(groups).astype(str).reset_index(drop=True)
    above = scores > float(scores.median())
    return {str(g): float(above[groups == g].mean()) for g in pd.unique(groups)}


RATE_TYPES = ("selection", "scoring")


def ll144_rates(
    groups: pd.DataFrame, outcomes: pd.Series, rate_type: str = "selection"
) -> dict[str, Any]:
    """Per-category rates and counts for the LL144 impact-ratio table.

    ``rate_type="selection"`` (6 RCNY 5-301(b)): ``outcomes`` are 0/1 decisions
    and the rate is the share selected. ``rate_type="scoring"`` (5-301(c)):
    ``outcomes`` are the AEDT's scores and the rate is ``scoring_rates`` (share
    above the median of the full sample, unknown categories included in the
    median). Missing category values become the "(missing)" unknown category.
    """
    if rate_type not in RATE_TYPES:
        raise ValueError(f"rate_type must be one of {RATE_TYPES}, got {rate_type!r}")
    from .data import group_labels

    values = pd.Series(np.asarray(outcomes, dtype=float))
    rates: dict[str, dict[str, float]] = {}
    counts: dict[str, dict[str, int]] = {}
    for attr in groups.columns:
        labels = group_labels(groups[attr].reset_index(drop=True))
        if rate_type == "scoring":
            rates[str(attr)] = scoring_rates(values, labels)
        else:
            rates[str(attr)] = {
                str(g): float(values[labels == g].mean()) for g in pd.unique(labels)
            }
        counts[str(attr)] = {str(g): int(n) for g, n in labels.value_counts(sort=False).items()}
    return {"rate_type": rate_type, "rates": rates, "counts": counts}


def _impact_ratio_checks(
    rates_by_attribute: Mapping[str, Mapping[str, float | None]] | None,
    ll144_options: Mapping[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    options = dict(ll144_options or {})
    rate_type = options.pop("rate_type", None) or "selection"
    table = impact_ratios(rates_by_attribute or {}, **options)
    for t in table.values():
        t["rate_type"] = rate_type
    computed = any(
        sum(r["impact_ratio"] is not None for r in t["categories"]) >= 2
        for t in table.values()
    )
    mins = [t["min_impact_ratio"] for t in table.values() if t["min_impact_ratio"] is not None]
    lowest = min(mins) if (computed and mins) else None
    checks: list[dict[str, Any]] = [
        {
            "check": (
                f"{rate_type.capitalize()} rate and impact ratio calculated per category "
                "(6 RCNY 5-301)"
            ),
            "value": round(lowest, 3) if lowest is not None else "Not available",
            "passed": computed,
            "required": True,
        }
    ]
    if lowest is not None:
        checks.append(
            {
                "check": (
                    "Lowest impact ratio ≥ 0.80 (four-fifths heuristic from the EEOC "
                    "Uniform Guidelines; not an LL144 threshold, informational only)"
                ),
                "value": round(lowest, 3),
                "passed": lowest >= FOUR_FIFTHS,
                "required": FOUR_FIFTHS,
                "informational": True,
            }
        )
    return checks, table


def _assess_regulation(
    regulation: RegulationRequirement,
    fairness_score: float,
    demographic_parity: float,
    equal_opportunity_gap: float,
    has_audit_documentation: bool = False,
    has_independent_audit: bool = False,
    has_human_oversight: bool = True,
    group_selection_rates: Mapping[str, Mapping[str, float | None]] | None = None,
    ll144_options: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Assess compliance status for a single regulation."""

    checks: list[dict[str, Any]] = []
    extra: dict[str, Any] = {}

    if regulation.get("impact_ratio_audit", False):
        ir_checks, table = _impact_ratio_checks(group_selection_rates, ll144_options)
        checks.extend(ir_checks)
        extra["impact_ratios"] = table
    else:
        checks.extend(
            _gap_checks(regulation, fairness_score, demographic_parity, equal_opportunity_gap)
        )

    _append_process_checks(
        checks, regulation, has_audit_documentation, has_independent_audit, has_human_oversight
    )

    # Informational checks (heuristics) are shown but do not decide the status.
    scored = [c for c in checks if not c.get("informational")]
    all_passed = all(c["passed"] for c in scored)
    passed_count = sum(1 for c in scored if c["passed"])
    total_count = len(scored)

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
        **extra,
    }


def _gap_checks(
    regulation: RegulationRequirement,
    fairness_score: float,
    demographic_parity: float,
    equal_opportunity_gap: float,
) -> list[dict[str, Any]]:
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
    return checks


def _append_process_checks(
    checks: list[dict[str, Any]],
    regulation: RegulationRequirement,
    has_audit_documentation: bool,
    has_independent_audit: bool,
    has_human_oversight: bool,
) -> None:
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


def assess_compliance(
    fairness_score: float,
    demographic_parity: float,
    equal_opportunity_gap: float,
    has_audit_documentation: bool = False,
    has_independent_audit: bool = False,
    has_human_oversight: bool = True,
    domain: str = "other",
    group_selection_rates: Mapping[str, Mapping[str, float | None]] | None = None,
    group_counts: Mapping[str, Mapping[str, int]] | None = None,
    exclude_small_categories: bool = False,
    exclusion_justification: str | None = None,
    rate_type: str = "selection",
) -> dict[str, Any]:
    """Assess compliance across all regulatory frameworks.

    ``group_selection_rates`` holds selection rates, or scoring rates when
    ``rate_type="scoring"`` (an AEDT that outputs a score, 6 RCNY 5-301(c)).

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
            group_selection_rates=group_selection_rates,
            ll144_options={
                "counts_by_attribute": group_counts,
                "exclude_small_categories": exclude_small_categories,
                "exclusion_justification": exclusion_justification,
                "rate_type": rate_type,
            },
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
