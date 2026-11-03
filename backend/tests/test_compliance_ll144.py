"""NYC Local Law 144 bias-audit metrics (6 RCNY 5-300 / 5-301).

Source: DCWP final rule, https://rules.cityofnewyork.us/wp-content/uploads/2023/04/DCWP-NOA-for-Use-of-Automated-Employment-Decisionmaking-Tools-2.pdf
"Impact ratio" = selection rate for a category / selection rate of the most
selected category (or scoring rate / scoring rate of the highest-scoring
category). The rule requires calculating and reporting it; it sets no pass mark.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from core.compliance import assess_compliance, impact_ratios, ll144_rates, scoring_rates


def test_impact_ratios_match_the_rule_worked_example():
    # Sex table from the DCWP rule's example: 667/1390 and 555/1181.
    out = impact_ratios({"sex": {"Male": 667 / 1390, "Female": 555 / 1181}})
    rows = {r["category"]: r for r in out["sex"]["categories"]}
    assert rows["Male"]["impact_ratio"] == pytest.approx(1.0)
    assert rows["Female"]["impact_ratio"] == pytest.approx(0.979, abs=1e-3)
    assert out["sex"]["most_selected"] == "Male"


def test_unknown_category_is_excluded_and_counted_separately():
    out = impact_ratios({"race": {"A": 0.5, "B": 0.25, "(missing)": 0.9}})
    cats = {r["category"] for r in out["race"]["categories"]}
    assert cats == {"A", "B"}
    assert out["race"]["unknown_categories"] == ["(missing)"]
    rows = {r["category"]: r for r in out["race"]["categories"]}
    assert rows["B"]["impact_ratio"] == pytest.approx(0.5)


def test_zero_top_rate_gives_undefined_ratios_not_division_error():
    out = impact_ratios({"sex": {"F": 0.0, "M": 0.0}})
    assert all(r["impact_ratio"] is None for r in out["sex"]["categories"])


def test_scoring_rate_is_share_above_full_sample_median():
    scores = pd.Series([1, 2, 3, 4, 5, 6, 7, 8])
    groups = pd.Series(["a", "a", "a", "a", "b", "b", "b", "b"])
    rates = scoring_rates(scores, groups)
    assert rates == {"a": 0.0, "b": 1.0}  # median 4.5


def _nyc(res):
    return res["regulations"]["nyc_law_144"]


def test_nyc_ll144_reports_impact_ratios_instead_of_a_parity_threshold():
    res = assess_compliance(
        fairness_score=90, demographic_parity=0.3, equal_opportunity_gap=0.3,
        has_audit_documentation=True, has_independent_audit=True,
        group_selection_rates={"sex": {"F": 0.3, "M": 0.6}},
    )
    nyc = _nyc(res)
    names = " | ".join(c["check"] for c in nyc["checks"])
    assert "Demographic parity" not in names
    assert "impact ratio" in names.lower()
    assert nyc["impact_ratios"]["sex"]["categories"][0]["impact_ratio"] is not None
    # The four-fifths rule is labelled a heuristic and does not decide status.
    heur = [c for c in nyc["checks"] if c.get("informational")]
    assert len(heur) == 1 and "heuristic" in heur[0]["check"].lower()
    assert heur[0]["passed"] is False  # 0.5 < 0.8
    assert nyc["status"] == "compliant"
    assert nyc["total_checks"] == len(nyc["checks"]) - 1


def test_nyc_ll144_without_group_rates_cannot_be_compliant():
    res = assess_compliance(
        fairness_score=99, demographic_parity=0.0, equal_opportunity_gap=0.0,
        has_audit_documentation=True, has_independent_audit=True,
    )
    nyc = _nyc(res)
    ir = [c for c in nyc["checks"] if "impact ratio" in c["check"].lower() and not c.get("informational")]
    assert ir and ir[0]["passed"] is False
    assert nyc["status"] != "compliant"


def test_other_regulations_keep_their_gap_checks():
    res = assess_compliance(fairness_score=90, demographic_parity=0.1, equal_opportunity_gap=0.1)
    names = [c["check"] for c in res["regulations"]["eu_ai_act"]["checks"]]
    assert any("Demographic parity" in n for n in names)


# ── 6 RCNY 5-301(d): optional exclusion of a category under 2% of the data ──

_RATES = {"race": {"A": 0.50, "B": 0.40, "C": 0.10}}
_COUNTS = {"race": {"A": 600, "B": 390, "C": 10}}  # C = 1% of the data


def test_small_category_is_kept_by_default():
    table = impact_ratios(_RATES, counts_by_attribute=_COUNTS)["race"]
    assert {r["category"] for r in table["categories"]} == {"A", "B", "C"}
    assert table["excluded_categories"] == []
    assert table["min_impact_ratio"] == pytest.approx(0.2)
    assert {r["category"]: r["n"] for r in table["categories"]}["C"] == 10


def test_auditor_may_exclude_a_category_under_two_percent_and_it_is_reported():
    table = impact_ratios(
        _RATES,
        counts_by_attribute=_COUNTS,
        exclude_small_categories=True,
        exclusion_justification="C too small for a stable rate",
    )["race"]
    assert {r["category"] for r in table["categories"]} == {"A", "B"}
    assert table["min_impact_ratio"] == pytest.approx(0.8)
    (ex,) = table["excluded_categories"]
    assert ex["category"] == "C"
    assert ex["n"] == 10
    assert ex["rate"] == pytest.approx(0.10)
    assert ex["share"] == pytest.approx(0.01)
    assert table["exclusion_justification"] == "C too small for a stable rate"


def test_exclusion_never_drops_a_category_at_or_above_two_percent():
    counts = {"race": {"A": 590, "B": 390, "C": 20}}  # C = exactly 2%
    table = impact_ratios(_RATES, counts_by_attribute=counts, exclude_small_categories=True)
    assert table["race"]["excluded_categories"] == []


def test_exclusion_without_counts_is_not_applied_and_says_why():
    table = impact_ratios(_RATES, exclude_small_categories=True)["race"]
    assert table["excluded_categories"] == []
    assert "count" in table["exclusion_note"].lower()


def test_exclusion_without_justification_warns():
    table = impact_ratios(_RATES, counts_by_attribute=_COUNTS, exclude_small_categories=True)
    assert "justification" in table["race"]["exclusion_note"].lower()


def test_assess_compliance_passes_the_exclusion_to_the_nyc_table():
    result = assess_compliance(
        fairness_score=80,
        demographic_parity=0.1,
        equal_opportunity_gap=0.1,
        group_selection_rates=_RATES,
        group_counts=_COUNTS,
        exclude_small_categories=True,
        exclusion_justification="j",
    )
    nyc = result["regulations"]["nyc_law_144"]
    assert nyc["impact_ratios"]["race"]["excluded_categories"][0]["category"] == "C"


# ── Scoring-rate variant (6 RCNY 5-301(c)) wired into the NYC check ──────────



def test_ll144_rates_from_scores_use_the_full_sample_median_and_count_unknowns():
    groups = pd.DataFrame({"sex": ["F", "F", "M", "M", None]})
    scores = pd.Series([0.1, 0.9, 0.8, 0.7, 0.2])  # median 0.7
    out = ll144_rates(groups, scores, rate_type="scoring")
    assert out["rate_type"] == "scoring"
    assert out["rates"]["sex"] == {"F": 0.5, "M": 0.5, "(missing)": 0.0}
    assert out["counts"]["sex"] == {"F": 2, "M": 2, "(missing)": 1}


def test_ll144_rates_from_decisions_are_selection_rates():
    groups = pd.DataFrame({"sex": ["F", "F", "M", "M"]})
    out = ll144_rates(groups, pd.Series([0, 1, 1, 1]), rate_type="selection")
    assert out["rates"]["sex"] == {"F": 0.5, "M": 1.0}


def test_ll144_rates_rejects_unknown_rate_type():
    with pytest.raises(ValueError):
        ll144_rates(pd.DataFrame({"s": ["a"]}), pd.Series([1]), rate_type="odds")


def test_nyc_check_names_scoring_rate_when_the_output_is_a_score():
    result = assess_compliance(
        fairness_score=80,
        demographic_parity=0.1,
        equal_opportunity_gap=0.1,
        group_selection_rates={"sex": {"F": 0.4, "M": 0.5}},
        rate_type="scoring",
    )
    nyc = result["regulations"]["nyc_law_144"]
    assert nyc["checks"][0]["check"].startswith("Scoring rate and impact ratio")
    assert nyc["impact_ratios"]["sex"]["rate_type"] == "scoring"


def test_model_bias_reports_ll144_selection_and_scoring_rates():
    from core.model_bias import run_model_bias_analysis

    rng = np.random.default_rng(0)
    n = 300
    df = pd.DataFrame(
        {"x": rng.random(n), "sex": rng.choice(["F", "M"], size=n)}
    )
    df["y"] = (df["x"] + rng.normal(0, 0.1, n) > 0.5).astype(int)
    res = run_model_bias_analysis(
        df, ["sex"], "y", model_types=["linear"], rigour_config={"n_boot": 0}
    )
    ll = res["ll144"]
    assert ll["selection"]["rate_type"] == "selection"
    assert ll["scoring"]["rate_type"] == "scoring"
    assert set(ll["scoring"]["rates"]["sex"]) == {"F", "M"}
    assert sum(ll["scoring"]["counts"]["sex"].values()) == sum(
        ll["selection"]["counts"]["sex"].values()
    )
