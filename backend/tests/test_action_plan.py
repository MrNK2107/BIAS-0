"""Change attribution and the action plan; the hiring sample's story."""

from __future__ import annotations

import hashlib

import numpy as np
import pandas as pd

from core.action_plan import _more_data, _onset, build_action_plan, detect_changes
from core.outcome_audit import run_outcome_audit, suggest_roles
from utils.decision_log_sample import SAMPLE_PATH
from utils.hiring_log_sample import HIRING_SAMPLE_PATH, make_hiring_log
from utils.samples import SAMPLES, public_samples

FAST = {"n_boot": 200, "seed": 1}


def _log(switch: str | None = "2026-04", gap_after: bool = True, version_col: str = "model_version") -> pd.DataFrame:
    """Two groups, six months, 200 rows a month. Group b's rate drops after the switch when gap_after."""
    rng = np.random.default_rng(0)
    rows = []
    for m in range(1, 7):
        month = f"2026-{m:02d}"
        after = switch is not None and month >= switch
        for i in range(200):
            g = "a" if i % 2 == 0 else "b"
            p = 0.6 if g == "a" or not (after and gap_after) else 0.25
            rows.append({
                "date": f"{month}-{(i % 27) + 1:02d}",
                "group": g,
                version_col: ("v2" if after else "v1"),
                "decision": "approved" if rng.random() < p else "declined",
            })
    return pd.DataFrame(rows)


def test_detect_changes_finds_a_clean_version_switch():
    changes = detect_changes(_log(), "date", "M", exclude=["decision", "group"])
    assert changes == [{"column": "model_version", "period": "2026-04", "from": "v1", "to": "v2", "version_like": True}]


def test_detect_changes_ignores_mixed_columns_and_excluded_ones():
    df = _log()
    df["channel"] = np.where(np.arange(len(df)) % 2 == 0, "web", "branch")  # 50/50 every month: no dominant value
    assert detect_changes(df, "date", "M", exclude=["decision", "group", "model_version"]) == []


def test_non_version_column_is_found_but_marked():
    changes = detect_changes(_log(version_col="region_office"), "date", "M", exclude=["decision", "group"])
    assert changes and changes[0]["version_like"] is False


def test_onset_is_the_latest_run_containing_a_breach():
    pts = [{"period": p, "status": s} for p, s in [
        ("01", "breach"), ("02", "ok"), ("03", "watch"), ("04", "breach"), ("05", "watch"), ("06", "ok"), ("07", "watch"),
    ]]
    assert _onset(pts) == "03"  # 07 is a watch-only run, not a breach
    assert _onset([{"period": "01", "status": "ok"}]) is None


def test_audit_links_drift_to_the_switch_with_before_after_ratios():
    r = run_outcome_audit(_log(), "decision", ["group"], time_col="date", config=FAST)
    links = r["change_points"]["links"]
    assert len(links) == 1
    lk = links[0]
    assert (lk["attribute"], lk["column"], lk["from"], lk["to"], lk["onset"]) == ("group", "model_version", "v1", "v2", "2026-04")
    assert lk["impact_ratio_before"] > 0.85 and lk["impact_ratio_after"] < 0.55
    assert lk["lowest_group_after"] == "b"
    assert "not proof of cause" in lk["text"]
    top = r["action_plan"][0]
    assert top["priority"] == "now" and top["title"] == "Review the model_version change to v2"


def test_no_link_when_the_switch_does_not_move_fairness():
    r = run_outcome_audit(_log(gap_after=False), "decision", ["group"], time_col="date", config=FAST)
    assert r["change_points"]["changes"]  # the switch is still listed
    assert r["change_points"]["links"] == []
    assert not any("model_version" in a["title"] for a in r["action_plan"])


def test_no_time_column_means_no_change_points():
    r = run_outcome_audit(_log(), "decision", ["group"], config=FAST)
    assert r["change_points"] is None
    assert r["action_plan"][-1]["title"] == "Sign off the report"


def test_more_data_estimate():
    # point 0.85, lower 0.75: half-width 0.10, need 0.05 -> 4x the sample -> 3x more
    assert _more_data({"point": 0.85, "ci_lower": 0.75, "ci_upper": 0.95}, 1000, 0.8) == 3000
    assert _more_data({"point": 0.80, "ci_lower": 0.7, "ci_upper": 0.9}, 1000, 0.8) is None  # on the line
    assert _more_data({"point": 0.95, "ci_lower": 0.9, "ci_upper": 0.99}, 1000, 0.8) is None  # already clear


def test_action_plan_orders_priorities_and_flags_missing_outcome():
    r = run_outcome_audit(_log(), "decision", ["group"], time_col="date", config=FAST)
    pr = [a["priority"] for a in r["action_plan"]]
    assert pr == sorted(pr, key=["now", "next", "record"].index)
    assert any(a["title"] == "Add an outcome column" for a in r["action_plan"])
    assert all({"priority", "owner", "title", "detail", "evidence"} <= set(a) for a in r["action_plan"])
    assert build_action_plan(r) == r["action_plan"]  # deterministic


# ── bundled samples ─────────────────────────────────────────────────────────


def test_hiring_sample_file_matches_generator():
    expected = make_hiring_log().to_csv(index=False, lineterminator="\n").encode()
    assert hashlib.sha256(HIRING_SAMPLE_PATH.read_bytes()).hexdigest() == hashlib.sha256(expected).hexdigest()


def test_hiring_sample_roles_are_detected():
    s = suggest_roles(pd.read_csv(HIRING_SAMPLE_PATH))["suggested"]
    m = SAMPLES["hiring"]["mapping"]
    assert s["decision_col"] == m["decision_col"] and s["score_col"] == m["score_col"] and s["time_col"] == m["time_col"]
    assert s["outcome_col"] is None and set(s["group_cols"]) == set(m["group_cols"])


def test_hiring_sample_story():
    df = pd.read_csv(HIRING_SAMPLE_PATH)
    m = SAMPLES["hiring"]["mapping"]
    r = run_outcome_audit(df, m["decision_col"], m["group_cols"], score_col=m["score_col"], time_col=m["time_col"], config={"n_boot": 300})
    # Pooled, sex is not evidenced; the drift since the s1.5 release is.
    assert r["attributes"]["sex"]["verdict"]["status"] != "disparity"
    assert r["drift"]["series"]["sex"]["breach_periods"] >= 2
    lk = next(lk for lk in r["change_points"]["links"] if lk["attribute"] == "sex")
    assert (lk["column"], lk["to"], lk["onset"]) == ("screener_version", "s1.5", "2026-07")
    assert lk["impact_ratio_after"] < 0.7 < 0.9 < lk["impact_ratio_before"]
    # Small group flagged, unknown race counted, LL144 scoring rates present, no outcome.
    small = r["attributes"]["race_ethnicity"]["small_groups"]
    assert [g["group"] for g in small] == ["Native Hawaiian or Other Pacific Islander"]
    assert r["attributes"]["race_ethnicity"]["unknown_count"] > 300
    assert "scoring" in r["ll144"]
    assert r["outcome"] is None


def test_lending_sample_links_drift_to_model_update():
    df = pd.read_csv(SAMPLE_PATH)
    m = SAMPLES["lending"]["mapping"]
    r = run_outcome_audit(df, m["decision_col"], ["region_tier", "caste_category"], time_col=m["time_col"], config={"n_boot": 200})
    linked = {lk["attribute"]: lk for lk in r["change_points"]["links"]}
    assert linked["region_tier"]["to"] == "v2.3" and linked["region_tier"]["onset"] == "2026-05"
    titles = [a["title"] for a in r["action_plan"]]
    assert titles.count("Review the model_version change to v2.3") == 1  # one action for both attributes


def test_public_samples_hide_paths():
    cat = public_samples()
    assert {s["id"] for s in cat} == {"lending", "hiring"}
    assert all("path" not in s and s["filename"].endswith(".csv") for s in cat)


def test_report_has_actions_and_change_table():
    from core.assurance_report import render_report

    r = run_outcome_audit(_log(), "decision", ["group"], time_col="date", config=FAST)
    html = render_report(r, system_name="<b>x</b>")
    assert "<h2 id='actions'>What to do next</h2>" in html
    assert html.index("What to do next") < html.index("1. Key findings")
    assert "Review the model_version change to v2" in html
    assert "<h3>What changed in the log</h3>" in html and "&lt;b&gt;x&lt;/b&gt;" in html
    assert "model_version → v2</text>" in html  # the switch is drawn on the drift chart


def test_ui_template_columns_are_recognised():
    """The CSV template the UI offers (frontend utils/assurance.ts) maps without manual work."""
    import io

    csv = (
        "decision_id,decision_date,decision,gender,age_band,region,model_score,outcome,model_version\n"
        "D-0001,2026-01-04,approved,female,26-35,urban,0.81,yes,v1.0\n"
        "D-0002,2026-01-04,declined,male,18-25,rural,0.32,no,v1.0\n"
        "D-0003,2026-02-11,approved,male,36-50,metro,0.67,,v1.1\n"
    )
    s = suggest_roles(pd.read_csv(io.StringIO(csv)))["suggested"]
    assert (s["decision_col"], s["outcome_col"], s["score_col"], s["time_col"]) == ("decision", "outcome", "model_score", "decision_date")
    assert set(s["group_cols"]) == {"gender", "age_band", "region"}
