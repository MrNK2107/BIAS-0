"""The command-line fairness gate: audit exit codes, outputs, detection, verify."""

from __future__ import annotations

from pathlib import Path

from cli import main
from utils.hiring_log_sample import HIRING_SAMPLE_PATH

SAMPLE = str(HIRING_SAMPLE_PATH)


def test_audit_fails_the_gate_on_disparity_and_writes_outputs(tmp_path: Path, capsys):
    report, js = tmp_path / "r.html", tmp_path / "a.json"
    code = main(["audit", SAMPLE, "--n-boot", "60", "--report", str(report), "--json", str(js), "--system", "TalentLens"])
    out = capsys.readouterr().out
    assert code == 1
    assert "Disparity evidenced (grade E)" in out
    assert "Review the screener_version change to s1.5" in out
    assert "Gate (--fail-on disparity): FAILED" in out
    assert report.read_text(encoding="utf-8").startswith("<!doctype html>") and '"verdict"' in js.read_text(encoding="utf-8")


def test_fail_on_never_passes_and_roles_are_detected(capsys):
    assert main(["audit", SAMPLE, "--n-boot", "40", "--fail-on", "never"]) == 0
    assert "Gate (--fail-on never): passed" in capsys.readouterr().out


def test_empty_role_skips_a_detected_column(tmp_path: Path, capsys):
    js = tmp_path / "a.json"
    main(["audit", SAMPLE, "--n-boot", "40", "--time", "", "--fail-on", "never", "--json", str(js)])
    import json

    body = json.loads(js.read_text(encoding="utf-8"))
    assert body["mapping"]["time_col"] is None and body["drift"] is None


def test_verify_round_trip_and_bad_input(tmp_path: Path, capsys):
    report = tmp_path / "r.html"
    main(["audit", SAMPLE, "--n-boot", "40", "--report", str(report), "--fail-on", "never"])
    assert main(["verify", str(report), SAMPLE]) == 0
    assert "Reproduced." in capsys.readouterr().out
    assert main(["audit", str(tmp_path / "missing.csv")]) == 2
    assert main(["audit", SAMPLE, "--decision", "nope", "--groups", "sex"]) == 2
