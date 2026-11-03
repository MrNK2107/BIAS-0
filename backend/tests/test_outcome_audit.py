"""Outcome audit (Mode A): hand-computed rates, verdict rules, guards, drift, report."""

from __future__ import annotations

import hashlib

import numpy as np
import pandas as pd
import pytest

from core.assurance_report import render_report
from core.frameworks import map_controls
from core.outcome_audit import (
    AuditInputError,
    attribute_verdict,
    binarise,
    grade,
    run_outcome_audit,
    suggest_roles,
)
from utils.decision_log_sample import SAMPLE_PATH, make_decision_log

FAST = {"n_boot": 200, "seed": 1}


def _frame(spec: dict[str, tuple[int, int]], col: str = "g") -> pd.DataFrame:
    """spec: group -> (n, number approved)."""
    rows = []
    for group, (n, k) in spec.items():
        rows += [{col: group, "decision": "approved"}] * k
        rows += [{col: group, "decision": "declined"}] * (n - k)
    return pd.DataFrame(rows)


# ── rates and impact ratios ─────────────────────────────────────────────────


def test_selection_rates_and_impact_ratio_hand_computed():
    df = _frame({"a": (200, 120), "b": (100, 30)})
    r = run_outcome_audit(df, "decision", ["g"], config=FAST)
    groups = r["attributes"]["g"]["groups"]
    assert groups["a"]["selection_rate"] == pytest.approx(0.6)
    assert groups["b"]["selection_rate"] == pytest.approx(0.3)
    gaps = r["attributes"]["g"]["gaps"]
    assert gaps["disparate_impact_ratio"]["point"] == pytest.approx(0.5)
    assert gaps["demographic_parity_difference"]["point"] == pytest.approx(0.3)
    table = r["ll144"]["selection"]["attributes"]["g"]
    assert table["most_selected"] == "a"
    ratios = {row["category"]: row["impact_ratio"] for row in table["categories"]}
    assert ratios == {"a": 1.0, "b": 0.5}
    # Wilson interval contains the point and is inside [0, 1]
    lo, hi = groups["b"]["selection_rate_ci"]
    assert 0 <= lo < 0.3 < hi <= 1
    # selection-only audit carries no error-rate fields
    assert "tpr" not in groups["a"] and "error_rates" not in r["attributes"]["g"]


def test_small_group_is_flagged_and_does_not_drive_the_gap():
    df = _frame({"a": (300, 150), "b": (300, 147), "tiny": (6, 0)})
    r = run_outcome_audit(df, "decision", ["g"], config=FAST)
    att = r["attributes"]["g"]
    assert att["groups"]["tiny"]["reliable"] is False
    assert [s["group"] for s in att["small_groups"]] == ["tiny"]
    # without the guard the ratio would be 0/0.5 = 0
    assert att["gaps"]["disparate_impact_ratio"]["point"] == pytest.approx(0.98)
    assert any("below 30 decisions" in w for w in r["warnings"])


def test_unknown_category_is_excluded_and_counted():
    df = _frame({"a": (100, 50), "b": (100, 50)})
    extra = pd.DataFrame({"g": [None] * 40, "decision": ["declined"] * 40})
    r = run_outcome_audit(pd.concat([df, extra]), "decision", ["g"], config=FAST)
    table = r["ll144"]["selection"]["attributes"]["g"]
    assert table["unknown_count"] == 40
    assert {row["category"] for row in table["categories"]} == {"a", "b"}
    assert r["attributes"]["g"]["unknown_count"] == 40
    assert r["attributes"]["g"]["gaps"]["disparate_impact_ratio"]["point"] == pytest.approx(1.0)


# ── verdicts and grade ─────────────────────────────────────────────────────


def test_verdict_disparity_when_whole_interval_below_threshold():
    df = _frame({"a": (2000, 1200), "b": (2000, 600)})
    r = run_outcome_audit(df, "decision", ["g"], config=FAST)
    assert r["attributes"]["g"]["verdict"]["status"] == "disparity"
    assert r["verdict"]["status"] == "disparity"
    assert r["verdict"]["grade"] == "E"  # worst ratio 0.5 < 0.65


def test_verdict_no_material_disparity_and_grade_a():
    df = _frame({"a": (3000, 1500), "b": (3000, 1490)})
    r = run_outcome_audit(df, "decision", ["g"], config=FAST)
    assert r["attributes"]["g"]["verdict"]["status"] == "no_material_disparity"
    assert r["verdict"]["grade"] == "A"


def test_verdict_inconclusive_when_interval_crosses_threshold():
    df = _frame({"a": (60, 30), "b": (60, 24)})  # ratio 0.8, wide CI
    r = run_outcome_audit(df, "decision", ["g"], config=FAST)
    v = r["attributes"]["g"]["verdict"]
    assert v["status"] == "inconclusive" and "crosses" in v["reason"]
    assert r["verdict"]["grade"] == "C"


def test_verdict_inconclusive_with_one_reliable_group():
    v = attribute_verdict(
        {"disparate_impact_ratio": {"point": 0.5, "ci_lower": None, "ci_upper": None}},
        n_reliable=1, threshold=0.8, min_n=30,
    )
    assert v["status"] == "inconclusive"


@pytest.mark.parametrize(
    "verdicts,expected",
    [
        ([("no_material_disparity", 0.95, 0.91)], "A"),
        ([("no_material_disparity", 0.95, 0.85)], "B"),
        ([("no_material_disparity", 0.95, 0.91), ("inconclusive", 0.8, 0.6)], "C"),
        ([("disparity", 0.7, 0.6), ("inconclusive", 0.8, 0.6)], "D"),
        ([("disparity", 0.6, 0.5)], "E"),
    ],
)
def test_grade_rules(verdicts, expected):
    vs = [
        {"attribute": f"x{i}", "status": s, "impact_ratio": {"point": p, "ci_lower": lo}}
        for i, (s, p, lo) in enumerate(verdicts)
    ]
    assert grade(vs, 0.8)["grade"] == expected


def test_intersection_disparity_escalates_overall_verdict():
    # Each attribute alone is balanced; the combination is not.
    rows = []
    for g in ("f", "m"):
        for r in ("rural", "metro"):
            approve = 0.3 if (g, r) in {("f", "rural"), ("m", "metro")} else 0.7
            n = 800
            k = int(n * approve)
            rows += [{"gender": g, "region": r, "decision": 1}] * k
            rows += [{"gender": g, "region": r, "decision": 0}] * (n - k)
    res = run_outcome_audit(pd.DataFrame(rows), "decision", ["gender", "region"], config=FAST)
    assert res["attributes"]["gender"]["verdict"]["status"] == "no_material_disparity"
    assert res["intersections"]["gender × region"]["verdict"]["status"] == "disparity"
    assert res["verdict"]["status"] == "disparity"


# ── inputs ──────────────────────────────────────────────────────────────────


def test_binarise_string_and_multivalued():
    vals, info = binarise(pd.DataFrame({"d": ["approved", "declined", "approved"]}), "d")
    assert list(vals) == [1.0, 0.0, 1.0] and info["positive"]["value"] == "approved"
    with pytest.raises(AuditInputError, match="more than two values"):
        binarise(pd.DataFrame({"d": ["hire", "hold", "reject"]}), "d")
    vals, _ = binarise(pd.DataFrame({"d": ["hire", "hold", "reject"]}), "d", "hire")
    assert list(vals) == [1.0, 0.0, 0.0]


def test_mapping_errors_are_clear():
    df = _frame({"a": (10, 5)})
    with pytest.raises(AuditInputError, match="Not in the file"):
        run_outcome_audit(df, "decision", ["nope"])
    with pytest.raises(AuditInputError, match="at least one group"):
        run_outcome_audit(df, "decision", [])
    with pytest.raises(AuditInputError, match="cannot also be a group"):
        run_outcome_audit(df, "decision", ["decision"])


def test_error_rates_with_partial_outcomes_warn_about_selective_labels():
    rng = np.random.default_rng(0)
    df = _frame({"a": (400, 200), "b": (400, 160)})
    df["repaid"] = np.where(rng.random(len(df)) < 0.7, "yes", "no").astype(object)
    df.loc[df.index[:100], "repaid"] = None
    r = run_outcome_audit(df, "decision", ["g"], outcome_col="repaid", config=FAST)
    er = r["attributes"]["g"]["error_rates"]
    assert er["n_rows"] == 700
    assert "equal_opportunity_difference" in er["gaps"]
    assert r["outcome_coverage"] == pytest.approx(0.875)
    assert any("selective labels" in w for w in r["warnings"])


def test_suggest_roles_on_sample():
    s = suggest_roles(pd.read_csv(SAMPLE_PATH))["suggested"]
    assert s["decision_col"] == "decision"
    assert s["outcome_col"] == "repaid_12m"
    assert s["score_col"] == "model_score"
    assert s["time_col"] == "decision_date"
    assert set(s["group_cols"]) == {"gender", "age_band", "region_tier", "caste_category"}


# ── drift ───────────────────────────────────────────────────────────────────


def _drift_frame() -> pd.DataFrame:
    rows = []
    for month in range(1, 7):
        rate_b = 0.5 if month <= 3 else 0.2
        for g, rate in (("a", 0.5), ("b", rate_b)):
            n = 300
            k = int(n * rate)
            date = f"2026-{month:02d}-15"
            rows += [{"g": g, "date": date, "decision": 1}] * k
            rows += [{"g": g, "date": date, "decision": 0}] * (n - k)
    # a sparse month: only 10 decisions per group
    rows += [{"g": g, "date": "2026-07-03", "decision": d} for g in "ab" for d in [1, 0] * 5]
    rows.append({"g": "a", "date": "not a date", "decision": 1})
    return pd.DataFrame(rows)


def test_drift_flags_breach_insufficient_and_unreadable_dates():
    r = run_outcome_audit(_drift_frame(), "decision", ["g"], time_col="date", config=FAST)
    d = r["drift"]
    assert d["period"] == "M"  # 6 months of data: auto picks months
    pts = d["series"]["g"]["points"]
    status = {p["period"]: p["status"] for p in pts}
    assert status["2026-01"] == "ok" and status["2026-04"] == "breach"
    assert status["2026-07"] == "insufficient"
    assert d["series"]["g"]["breach_start"] == "2026-04"
    assert d["series"]["g"]["trend_per_period"] < 0
    assert any(a["level"] == "breach" for a in d["alerts"])
    assert any("unreadable" in w for w in r["warnings"])
    assert any(f["scope"] == "drift" for f in r["findings"])


# ── sample dataset story ────────────────────────────────────────────────────


def test_sample_file_matches_generator():
    expected = make_decision_log().to_csv(index=False, lineterminator="\n").encode()
    assert hashlib.sha256(SAMPLE_PATH.read_bytes()).hexdigest() == hashlib.sha256(expected).hexdigest()


def test_sample_story_drift_after_model_update():
    df = pd.read_csv(SAMPLE_PATH)
    r = run_outcome_audit(
        df, "decision", ["gender", "region_tier", "caste_category"],
        outcome_col="repaid_12m", score_col="model_score", time_col="decision_date",
        config={"n_boot": 300},
    )
    region = r["drift"]["series"]["region_tier"]
    assert region["breach_start"] == "2026-05"
    before = [p["status"] for p in region["points"] if p["period"] < "2026-05"]
    assert "breach" not in before
    assert r["attributes"]["gender"]["groups"]["other"]["reliable"] is False
    assert r["ll144"]["selection"]["attributes"]["caste_category"]["unknown_count"] > 0
    assert "scoring" in r["ll144"]
    assert r["verdict"]["status"] == "disparity"


# ── frameworks and report ───────────────────────────────────────────────────


def test_framework_status_depends_on_what_was_supplied():
    df = _frame({"a": (100, 50), "b": (100, 45)})
    bare = {c["ref"]: c["status"] for c in map_controls(run_outcome_audit(df, "decision", ["g"], config=FAST))}
    assert bare["Art. 15(1)"] == "not_evidenced"
    assert bare["Art. 72"] == "not_evidenced"
    assert bare["5-301(c)"] == "not_evidenced"
    assert bare["Art. 14"] == "not_evidenced"  # never claimed by a log audit
    full = run_outcome_audit(_drift_frame(), "decision", ["g"], time_col="date", config=FAST)
    statuses = {c["ref"]: c["status"] for c in full["frameworks"]["controls"]}
    assert statuses["Art. 72"] == "evidenced" and statuses["Art. 12"] == "evidenced"
    assert full["frameworks"]["summary"]["eu_ai_act"]["total"] == 8


def test_report_escapes_user_strings_and_carries_provenance():
    df = _frame({"<script>alert(1)</script>": (100, 50), "b&c": (100, 40)}, col="grp<x>")
    r = run_outcome_audit(df, "decision", ["grp<x>"], config=FAST)
    page = render_report(
        r, provenance={"filename": "q3 <log>.csv", "sha256": "ab" * 32},
        system_name="Loans <b>v2</b>", organisation="Acme & Co",
    )
    assert "<script>alert(1)</script>" not in page
    assert "&lt;script&gt;" in page and "grp&lt;x&gt;" in page and "Acme &amp; Co" in page
    assert "ab" * 32 in page
    for section in ("Key findings", "Scope and method", "Regulatory mapping", "Limitations", "Sign-off"):
        assert section in page
    assert "<script" not in page.lower()


def test_numeric_multivalued_decision_is_split_at_median_with_a_warning():
    df = pd.DataFrame({"g": ["a", "b"] * 100, "score": list(range(200))})
    r = run_outcome_audit(df, "score", ["g"], config=FAST)
    assert r["decision"]["encoding"]["method"] == "median_threshold"
    assert any("split at its median" in w for w in r["warnings"])


def test_findings_rank_lower_impact_ratio_first_within_a_status():
    from core.outcome_audit import build_findings

    def block(status, point):
        return {
            "verdict": {"status": status, "label": status, "reason": "r"},
            "groups": {},
            "gaps": {"disparate_impact_ratio": {"point": point, "ci_lower": point - 0.1, "ci_upper": point + 0.05}},
        }

    result = {
        "attributes": {"a": block("inconclusive", 0.79), "b": block("disparity", 0.75)},
        "intersections": {"x": block("disparity", 0.71), "y": block("disparity", 0.64), "z": block("disparity", 0.67)},
    }
    names = [f["name"] for f in build_findings(result)]
    assert names == ["b", "y", "z", "x", "a"]
