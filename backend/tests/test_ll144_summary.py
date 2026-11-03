"""NYC LL144 public summary: the 5-303 facts, both rate types, intersections, escaping, blanks."""

from __future__ import annotations

import pandas as pd
import pytest

from core.ll144_summary import _intersection_rows, render_public_summary
from core.outcome_audit import run_outcome_audit
from utils.hiring_log_sample import HIRING_SAMPLE_PATH


@pytest.fixture(scope="module")
def audit():
    df = pd.read_csv(HIRING_SAMPLE_PATH)
    return run_outcome_audit(
        df, "shortlisted", ["sex", "race_ethnicity"], score_col="screen_score", time_col="applied_date",
        config={"n_boot": 50, "seed": 1},
    )


def test_summary_has_the_required_facts(audit):
    html = render_public_summary(audit, provenance={"filename": "screen.csv", "sha256": "ab" * 32},
                                 tool_name="TalentLens <s1>", employer="Example Staffing", audit_date="2026-11-03")
    for fact in ("Date of the bias audit", "Independent auditor", "Distribution date of the tool", "Source of data",
                 "Number of applicants assessed", "Applicants in an unknown category"):
        assert fact in html
    assert "2026-11-03" in html and "4,000" in html and "2026-01 to 2026-10" in html
    assert "TalentLens &lt;s1&gt;" in html and "<s1>" not in html
    assert html.count("to be completed") == 2  # auditor and distribution date
    assert "<script" not in html.lower()


def test_both_rate_types_and_the_intersection(audit):
    html = render_public_summary(audit, auditor="A. Auditor LLP", distribution_date="2026-07-01")
    assert "sex: selection rates" in html and "sex: scoring rates" in html
    assert "race_ethnicity: selection rates" in html
    assert "Intersectional categories: sex × race_ethnicity" in html
    assert html.count("to be completed") == 1  # only the employer, which was not given
    assert "A. Auditor LLP" in html and "2026-07-01" in html
    assert "(small group)" in html  # NHPI, n=21


def test_intersection_impact_ratios_are_against_the_top_category(audit):
    rows = _intersection_rows(audit["intersections"]["sex × race_ethnicity"])
    assert rows[0]["impact_ratio"] == pytest.approx(1.0)
    assert all(0 <= r["impact_ratio"] <= 1 for r in rows)
    assert not any(r["category"] == "(missing)" for r in rows)
    assert [r["rate"] for r in rows] == sorted((r["rate"] for r in rows), reverse=True)
