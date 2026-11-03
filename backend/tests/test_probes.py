"""Paired-probe generation and the screener runner (no real network calls anywhere)."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pandas as pd
import pytest

from cli import main
from core.outcome_audit import AuditInputError
from core.paired import paired_probe
from core.probe_runner import extract, render, run_probes
from core.probes import generate_probes, probes_to_csv, probes_to_jsonl, read_probes

GROUPS = [{"label": "A-names", "names": ["Ana", "Bea"]}, {"label": "B-names", "names": ["Carl", "Dan Ortiz"]}]


def test_pairs_differ_only_in_the_name():
    rows = generate_probes(50, seed=3)
    assert len(rows) == 100
    by_pair: dict[str, list[dict]] = {}
    for r in rows:
        by_pair.setdefault(r["pair_id"], []).append(r)
    for pair in by_pair.values():
        a, b = pair
        assert {a["variant"], b["variant"]} == {"female-coded", "male-coded"}
        assert a["first_name"] != b["first_name"]
        for key in ("role", "years_experience", "education", "skills", "employers", "probe_set"):
            assert a[key] == b[key]
        # Swapping the names back makes the resumes identical.
        assert a["resume_text"].replace(a["name"], "<N>") == b["resume_text"].replace(b["name"], "<N>")
        assert a["name"].split()[-1] == b["name"].split()[-1]  # shared surname


def test_same_seed_same_file_different_seed_different_file():
    assert probes_to_csv(generate_probes(40, seed=9)) == probes_to_csv(generate_probes(40, seed=9))
    assert probes_to_csv(generate_probes(40, seed=9)) != probes_to_csv(generate_probes(40, seed=10))
    assert generate_probes(5, seed=1)[0]["probe_set"] != generate_probes(5, seed=1, groups=GROUPS)[0]["probe_set"]


def test_custom_groups_full_names_and_roles():
    rows = generate_probes(30, seed=2, groups=GROUPS, roles=["Data analyst"])
    assert {r["variant"] for r in rows} == {"A-names", "B-names"}
    assert {r["role"] for r in rows} == {"Data analyst"}
    full = [r for r in rows if r["first_name"] == "Dan Ortiz"]
    assert full and all(r["name"] == "Dan Ortiz" for r in full)
    assert all(r["first_name"] in {"Ana", "Bea"} for r in rows if r["variant"] == "A-names")


@pytest.mark.parametrize("kwargs, msg", [
    ({"groups": GROUPS[:1]}, "exactly two"),
    ({"groups": [GROUPS[0], {"label": "A-names", "names": ["Zed"]}]}, "different labels"),
    ({"groups": [GROUPS[0], {"label": "x", "names": ["Ana"]}]}, "both groups"),
    ({"groups": [GROUPS[0], {"label": "x", "names": [" "]}]}, "no names"),
    ({"n_pairs": 0}, "between"),
    ({"roles": ["Astronaut"]}, "Unknown role"),
])
def test_validation(kwargs, msg):
    with pytest.raises(AuditInputError, match=msg):
        generate_probes(**{"n_pairs": 10, **kwargs})


def test_csv_and_jsonl_round_trip():
    rows = generate_probes(10, seed=4)
    assert read_probes(probes_to_jsonl(rows)) == rows
    back = read_probes(probes_to_csv(rows))
    assert [r["resume_text"] for r in back] == [r["resume_text"] for r in rows]  # newlines survive CSV quoting


def test_render_and_extract():
    probe = {"probe_id": "P-1-A", "years_experience": 4, "resume_text": "hi"}
    body = render({"messages": [{"content": "Resume: {{resume_text}}"}], "n": "{{years_experience}}", "k": 1}, probe)
    assert body == {"messages": [{"content": "Resume: hi"}], "n": 4, "k": 1}
    with pytest.raises(AuditInputError, match="not a probe field"):
        render({"x": "{{nope}}"}, probe)
    data = {"result": {"choices": [{"score": 0.7}], "ok": True}}
    assert extract(data, "result.choices.0.score") == 0.7
    assert extract(data, "result.missing") is None and extract(data, "result.choices.5") is None


def test_dry_run_sends_nothing():
    def boom(request):  # pragma: no cover - must not be called
        raise AssertionError("network call in a dry run")

    client = httpx.Client(transport=httpx.MockTransport(boom))
    rows = run_probes(generate_probes(3, seed=1), "https://screener.example/score", dry_run=True, client=client)
    req = json.loads(rows[0]["request"])
    assert req["url"] == "https://screener.example/score" and req["body"]["resume_text"].startswith("Name: ")
    assert all(r["decision"] is None for r in rows)


def test_http_runner_against_a_mock_transport_and_analysis():
    """A fake screener behind httpx.MockTransport docks one group; the loop ends in a disparity verdict."""
    seen = []

    def screener(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        seen.append((request.headers.get("authorization"), body))
        if body["meta"] == "P-0003-A":
            return httpx.Response(500, text="boom")
        docked = body["text"].split("\n")[0].split()[1] in {"Emily", "Anne", "Jill", "Allison", "Laurie", "Sarah",
                                                              "Meredith", "Carrie"}
        years = int(body["text"].split("Experience: ")[1].split(" ")[0])
        score = min(1.0, years / 10) - (0.25 if docked else 0.0)
        return httpx.Response(200, json={"result": {"shortlisted": score >= 0.45, "score": round(score, 3)}})

    probes = generate_probes(120, seed=8)
    client = httpx.Client(transport=httpx.MockTransport(screener))
    rows = run_probes(
        probes, "https://screener.example/score", client=client,
        template={"text": "{{resume_text}}", "meta": "{{probe_id}}"},
        decision_path="result.shortlisted", score_path="result.score", headers={"Authorization": "Bearer t"},
    )
    assert len(seen) == 240 and seen[0][0] == "Bearer t"
    failed = [r for r in rows if r["error"]]
    assert len(failed) == 1 and "500" in failed[0]["error"]
    df = pd.DataFrame(rows)
    res = paired_probe(df, "pair_id", "variant", "decision", score_col="score", config={"n_boot": 100})
    assert res["n_pairs"] == 119 and res["n_pairs_dropped"] == 1
    assert res["verdict"]["status"] == "disparity" and res["favoured"] == "male-coded"


def test_endpoint_must_be_http_or_mock():
    with pytest.raises(AuditInputError, match="http"):
        run_probes(generate_probes(1), "file:///etc/passwd")


def test_cli_generate_run_mock_and_gate(tmp_path: Path, capsys):
    probes, results = tmp_path / "p.jsonl", tmp_path / "r.csv"
    assert main(["probes", "generate", "--pairs", "200", "--seed", "7", "--out", str(probes),
                 "--group", "f=Emily,Sarah", "--group", "m=Greg,Todd"]) == 0
    assert len(probes.read_text(encoding="utf-8").splitlines()) == 400
    assert main(["probes", "run", str(probes), "--endpoint", "mock", "--mock-penalise", "f", "--out", str(results)]) == 0
    assert main(["paired", str(results)]) == 1
    out = capsys.readouterr().out
    assert "400 of 400 probes answered" in out and "Differential treatment evidenced" in out and "FAILED" in out
    # Without a penalty the stand-in screener is fair: the gate passes.
    assert main(["probes", "run", str(probes), "--endpoint", "mock", "--out", str(results)]) == 0
    assert main(["paired", str(results)]) == 0


def test_cli_dry_run_and_bad_input(tmp_path: Path, capsys):
    probes = tmp_path / "p.csv"
    main(["probes", "generate", "--pairs", "5", "--out", str(probes)])
    assert main(["probes", "run", str(probes), "--endpoint", "https://x.example/s", "--dry-run", "--limit", "2"]) == 0
    assert "Dry run: 2 requests prepared, none sent." in capsys.readouterr().out
    assert main(["probes", "generate", "--group", "only-one"]) == 2
    assert main(["probes", "run", str(probes), "--endpoint", "mock", "--template", "{not json"]) == 2
