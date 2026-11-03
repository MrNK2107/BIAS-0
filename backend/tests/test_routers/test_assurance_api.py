"""Assurance API: outcome audit, report, inspect and sample endpoints."""

from __future__ import annotations

import hashlib

import pytest

from utils.decision_log_sample import SAMPLE_PATH

FORM = {
    "decision_col": "decision",
    "group_cols": "gender,region_tier",
    "time_col": "decision_date",
    "outcome_col": "repaid_12m",
}


def _file():
    data = SAMPLE_PATH.read_bytes()
    return data, {"file": ("loans q3.csv", data, "text/csv")}


def test_outcome_audit_returns_verdict_and_provenance(client, monkeypatch):
    monkeypatch.setenv("BIAS_BOOTSTRAP_N", "200")
    data, files = _file()
    r = client.post("/api/assurance/outcome-audit", files=files, data=FORM)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["schema"].startswith("bias0.outcome-audit@")
    assert body["verdict"]["status"] in {"disparity", "inconclusive", "no_material_disparity"}
    assert body["provenance"]["sha256"] == hashlib.sha256(data).hexdigest()
    assert body["provenance"]["filename"] == "loans q3.csv"
    assert body["drift"]["period"] == "M"
    assert body["frameworks"]["controls"]


def test_group_cols_accepts_json_list(client, monkeypatch):
    monkeypatch.setenv("BIAS_BOOTSTRAP_N", "100")
    _, files = _file()
    r = client.post(
        "/api/assurance/outcome-audit", files=files,
        data={"decision_col": "decision", "group_cols": '["gender"]'},
    )
    assert r.status_code == 200
    assert list(r.json()["attributes"]) == ["gender"]


def test_bad_mapping_is_422(client):
    _, files = _file()
    r = client.post("/api/assurance/outcome-audit", files=files, data={"decision_col": "decision", "group_cols": "nope"})
    assert r.status_code == 422 and "Not in the file" in r.json()["detail"]
    r = client.post(
        "/api/assurance/outcome-audit", files=_file()[1],
        data={**FORM, "period": "fortnight"},
    )
    assert r.status_code == 422


def test_empty_and_unreadable_files_are_400(client):
    r = client.post("/api/assurance/outcome-audit", files={"file": ("e.csv", b"", "text/csv")}, data=FORM)
    assert r.status_code == 400
    r = client.post("/api/assurance/inspect", files={"file": ("h.csv", b"a,b\n", "text/csv")})
    assert r.status_code == 400


def test_report_is_html_with_hash(client, monkeypatch):
    monkeypatch.setenv("BIAS_BOOTSTRAP_N", "100")
    data, files = _file()
    r = client.post(
        "/api/assurance/outcome-audit/report", files=files,
        data={**FORM, "system_name": "PL-Score", "organisation": "Example Finance"},
    )
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")
    assert hashlib.sha256(data).hexdigest() in r.text
    assert "PL-Score" in r.text and "Regulatory mapping" in r.text


def test_inspect_and_sample(client):
    data, files = _file()
    r = client.post("/api/assurance/inspect", files=files)
    assert r.status_code == 200
    assert r.json()["suggested"]["decision_col"] == "decision"
    s = client.get("/api/assurance/sample")
    assert s.status_code == 200 and s.content == data
    f = client.get("/api/assurance/frameworks")
    assert "nyc_ll144" in f.json()["frameworks"]


def test_audits_are_recorded_in_a_verified_chain(client, monkeypatch):
    from repositories import assurance_ledger_repo

    monkeypatch.setenv("BIAS_BOOTSTRAP_N", "100")
    before = client.get("/api/assurance/history").json()["chain"]["n_entries"]
    form = {"decision_col": "decision", "group_cols": "region_tier", "system_name": "PL-Score"}
    first = client.post("/api/assurance/outcome-audit", files=_file()[1], data=form).json()["ledger"]
    second = client.post("/api/assurance/outcome-audit", files=_file()[1], data=form).json()["ledger"]
    assert second["seq"] == first["seq"] + 1
    assert second["prev_entry_sha256"] == first["entry_sha256"]
    cmp = second["compared_to_previous"]
    assert cmp["same_input"] is True and cmp["changes"]["region_tier"]["delta"] == 0
    not_recorded = client.post("/api/assurance/outcome-audit", files=_file()[1], data={**form, "record": "false"}).json()
    assert not_recorded["ledger"] is None

    h = client.get("/api/assurance/history").json()
    assert h["chain"]["ok"] and h["chain"]["n_entries"] == before + 2
    assert h["entries"][0]["seq"] == second["seq"]  # newest first
    assert "uid" not in h["entries"][0]

    # tamper with the stored copy: the chain check fails, then restore
    store = assurance_ledger_repo._memory_store
    key = next(k for k, v in store.items() if v.get("seq") == first["seq"])
    original = store[key]["verdict"]["grade"]
    store[key]["verdict"]["grade"] = "A" if original != "A" else "B"
    try:
        bad = client.get("/api/assurance/history").json()["chain"]
        assert not bad["ok"] and bad["problems"]
    finally:
        store[key]["verdict"]["grade"] = original


def test_tradeoff_endpoint(client):
    _, files = _file()
    r = client.post(
        "/api/assurance/tradeoff", files=files,
        data={"score_col": "model_score", "outcome_col": "repaid_12m", "group_col": "region_tier", "decision_col": "decision"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["points"]) == 11 and body["baseline_selection_rate"] == pytest.approx(0.5643, abs=1e-3)
    assert body["input_sha256"]
    bad = client.post(
        "/api/assurance/tradeoff", files=_file()[1],
        data={"score_col": "model_score", "outcome_col": "repaid_12m", "group_col": "nope"},
    )
    assert bad.status_code == 422


def test_tradeoff_since_a_model_update(client):
    data = {"score_col": "model_score", "outcome_col": "repaid_12m", "group_col": "region_tier", "decision_col": "decision"}
    full = client.post("/api/assurance/tradeoff", files=_file()[1], data=data).json()
    recent = client.post(
        "/api/assurance/tradeoff", files=_file()[1],
        data={**data, "time_col": "decision_date", "since": "2026-05"},
    ).json()
    assert recent["window"] == {"time_col": "decision_date", "since": "2026-05-01", "rows": recent["n_fit"] + recent["n_holdout"]}
    # after v2.3 the single-threshold disparity is much worse than the 12-month pool
    assert recent["points"][0]["impact_ratio"] < full["points"][0]["impact_ratio"] - 0.1
    assert recent["points"][-1]["impact_ratio"] > 0.8
    bad = client.post("/api/assurance/tradeoff", files=_file()[1], data={**data, "since": "2026-05"})
    assert bad.status_code == 422


def test_sample_catalogue_and_named_samples(client):
    from utils.hiring_log_sample import HIRING_SAMPLE_PATH

    cat = client.get("/api/assurance/samples").json()["samples"]
    assert [s["id"] for s in cat] == ["lending", "hiring"]
    hiring = next(s for s in cat if s["id"] == "hiring")
    assert hiring["mapping"]["decision_col"] == "shortlisted" and "path" not in hiring
    r = client.get("/api/assurance/sample", params={"name": "hiring"})
    assert r.status_code == 200 and r.content == HIRING_SAMPLE_PATH.read_bytes()
    assert client.get("/api/assurance/sample", params={"name": "nope"}).status_code == 404


def test_audit_returns_action_plan_and_change_points(client, monkeypatch):
    monkeypatch.setenv("BIAS_BOOTSTRAP_N", "100")
    _, files = _file()
    body = client.post("/api/assurance/outcome-audit", files=files, data=FORM).json()
    assert body["action_plan"][0]["priority"] == "now"
    assert any(lk["column"] == "model_version" for lk in body["change_points"]["links"])


def test_verify_endpoint(client, monkeypatch):
    import re

    from utils.hiring_log_sample import HIRING_SAMPLE_PATH

    monkeypatch.setenv("BIAS_BOOTSTRAP_N", "120")
    raw = HIRING_SAMPLE_PATH.read_bytes()
    form = {"decision_col": "shortlisted", "group_cols": "sex,race_ethnicity", "score_col": "screen_score", "time_col": "applied_date"}
    rep = client.post("/api/assurance/outcome-audit/report", files={"file": ("screen.csv", raw, "text/csv")}, data=form)
    assert rep.status_code == 200
    assert re.search(r'<meta name="bias0-audit" content="', rep.text)
    files = {"file": ("screen.csv", raw, "text/csv"), "report": ("report.html", rep.content, "text/html")}
    out = client.post("/api/assurance/verify-report", files=files)
    assert out.status_code == 200, out.text
    body = out.json()
    assert body["verified"] is True and body["report_filename"] == "report.html"
    bad = client.post("/api/assurance/verify-report", files={"file": ("screen.csv", raw, "text/csv"), "report": ("r.html", b"<html></html>", "text/html")})
    assert bad.status_code == 422


def test_ll144_summary_endpoint(client, monkeypatch):
    from utils.hiring_log_sample import HIRING_SAMPLE_PATH

    monkeypatch.setenv("BIAS_BOOTSTRAP_N", "50")
    raw = HIRING_SAMPLE_PATH.read_bytes()
    form = {"decision_col": "shortlisted", "group_cols": "sex,race_ethnicity", "score_col": "screen_score",
            "time_col": "applied_date", "system_name": "TalentLens", "auditor": "A. Auditor LLP"}
    r = client.post("/api/assurance/ll144-summary", files={"file": ("screen.csv", raw, "text/csv")}, data=form)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/html")
    assert "NYC Local Law 144" in r.text and "A. Auditor LLP" in r.text and "Intersectional categories" in r.text


def test_paired_endpoint_and_sample(client, monkeypatch):
    monkeypatch.setenv("BIAS_BOOTSTRAP_N", "100")
    s = client.get("/api/assurance/paired/sample")
    assert s.status_code == 200
    form = {"pair_col": "pair_id", "variant_col": "name_signal", "decision_col": "shortlisted",
            "score_col": "screen_score", "reference": "male-coded"}
    r = client.post("/api/assurance/paired", files={"file": ("probes.csv", s.content, "text/csv")}, data=form)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["verdict"]["status"] == "disparity" and body["provenance"]["filename"] == "probes.csv"
    bad = client.post("/api/assurance/paired", files={"file": ("probes.csv", s.content, "text/csv")},
                      data={**form, "variant_col": "role"})
    assert bad.status_code == 422
