"""Reproducing a report from its decision log: fingerprint, SHA-256, re-run, tamper cases."""

from __future__ import annotations

import io

import pandas as pd
import pytest

from core.assurance_report import render_report
from core.evidence import sha256_hex
from core.outcome_audit import run_outcome_audit
from core.report_verify import ReportFormatError, extract_fingerprint, fingerprint, reproduce
from utils.hiring_log_sample import HIRING_SAMPLE_PATH

MAP = dict(decision_col="shortlisted", group_cols=["sex", "race_ethnicity"], score_col="screen_score", time_col="applied_date")
CFG = {"n_boot": 150, "seed": 7}


@pytest.fixture(scope="module")
def made():
    raw = HIRING_SAMPLE_PATH.read_bytes()
    df = pd.read_csv(io.BytesIO(raw))
    m = dict(MAP)
    result = run_outcome_audit(df, m.pop("decision_col"), m.pop("group_cols"), config=CFG, **m)
    html = render_report(result, provenance={"sha256": sha256_hex(raw), "filename": "screen.csv"}, system_name='Screener "s1" <x>')
    return raw, df, result, html


def test_report_carries_a_fingerprint_without_scripts(made):
    _, _, result, html = made
    assert "<script" not in html.lower()
    fp = extract_fingerprint(html)
    assert fp["sha256"] == sha256_hex(made[0])
    assert fp["config"] == {"n_boot": 150, "seed": 7, "min_group_size": result["config"]["min_group_size"]}
    assert fp["positive_decision"] == "yes" and fp["period"] == "M"
    assert fp["expect"]["grade"] == result["verdict"]["grade"]
    assert set(fp["expect"]["intersections"]) == {"sex × race_ethnicity"}


def test_same_file_reproduces(made):
    raw, df, _, html = made
    out = reproduce(extract_fingerprint(html), df, raw)
    assert out["verified"] and out["sha256_ok"] and out["reproduced"]
    assert out["n_ok"] == out["n_checks"] >= 5
    assert out["summary"].startswith("Reproduced.")


def test_a_different_file_is_caught(made):
    raw, df, _, html = made
    df2 = df.copy()
    df2.loc[df2.index[:400], "shortlisted"] = "no"  # quietly drop some shortlists
    raw2 = df2.to_csv(index=False).encode()
    out = reproduce(extract_fingerprint(html), df2, raw2)
    assert not out["sha256_ok"] and not out["verified"]
    assert any(not c["ok"] for c in out["checks"])


def test_an_edited_report_is_caught(made):
    raw, df, _, html = made
    fp = extract_fingerprint(html)
    tampered = html.replace(f"&quot;grade&quot;: &quot;{fp['expect']['grade']}&quot;", "&quot;grade&quot;: &quot;A&quot;")
    assert tampered != html
    out = reproduce(extract_fingerprint(tampered), df, raw)
    assert out["sha256_ok"] and not out["reproduced"]
    assert [c["name"] for c in out["checks"] if not c["ok"]] == ["Grade"]
    assert "Same file, different result" in out["summary"]


def test_no_fingerprint_is_a_clear_error():
    with pytest.raises(ReportFormatError, match="No BIAS-0 fingerprint"):
        extract_fingerprint("<html><body>old report</body></html>")
    with pytest.raises(ReportFormatError, match="damaged"):
        extract_fingerprint('<meta name="bias0-audit" content="{not json">')


def test_fingerprint_is_stable_for_the_same_result(made):
    _, _, result, _ = made
    assert fingerprint(result, {"sha256": "x"}) == fingerprint(result, {"sha256": "x"})



def test_numeric_decisions_and_no_time_column_reproduce():
    import numpy as np

    rng = np.random.default_rng(3)
    n = 900
    df = pd.DataFrame({
        "approved": (rng.random(n) < np.where(np.arange(n) % 3 == 0, 0.35, 0.55)).astype(int),
        "region": np.where(np.arange(n) % 3 == 0, "rural", "urban"),
        "repaid": (rng.random(n) < 0.7).astype(int),
    })
    raw = df.to_csv(index=False).encode()
    df = pd.read_csv(io.BytesIO(raw))
    result = run_outcome_audit(df, "approved", ["region"], outcome_col="repaid", config={"n_boot": 80, "seed": 2})
    html = render_report(result, provenance={"sha256": sha256_hex(raw)})
    fp = extract_fingerprint(html)
    assert fp["positive_decision"] == 1 and fp["period"] == "auto"
    out = reproduce(fp, df, raw)
    assert out["verified"], out["checks"]
