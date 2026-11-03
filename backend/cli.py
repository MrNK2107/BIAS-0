"""BIAS-0 from the command line: a fairness gate for pipelines.

Run from ``backend/``::

    python -m cli audit samples/sample_hiring_screen.csv --decision shortlisted \\
        --groups sex,race_ethnicity --score screen_score --time applied_date \\
        --report report.html --json audit.json --fail-on disparity

    python -m cli verify report.html samples/sample_hiring_screen.csv

    # Paired test (Mode B) for a vendor API or LLM screener:
    python -m cli probes generate --pairs 200 --seed 7 --out probes.csv
    python -m cli probes run probes.csv --endpoint https://screener.example/v1/score \\
        --decision-path result.shortlisted --score-path result.score \\
        --header "Authorization: Bearer $SCREENER_KEY" --out results.csv   # try --dry-run first
    python -m cli paired results.csv --fail-on disparity

``audit`` prints the verdict, the worst findings and the act-now steps, writes the
HTML report and/or JSON if asked, and exits 1 when the verdict reaches the
``--fail-on`` level (``disparity`` by default; ``inconclusive`` is stricter;
``never`` always exits 0). Column roles not given are detected the same way
the UI does. ``verify`` re-runs a report's fingerprinted settings against the
CSV and exits 0 only if the hash and every number match.

``probes generate`` writes the name-swapped probe set (CSV or JSONL; groups as
``--group "label=Name1,Name2"`` twice; same settings and seed, same file).
``probes run`` POSTs each probe to your screener and writes its decisions;
``--endpoint mock`` uses a built-in offline screener and ``--dry-run`` only
prepares the requests. ``paired`` analyses the results and gates like ``audit``.

Exit codes: 0 pass, 1 gate failed / not reproduced, 2 bad input.
"""

from __future__ import annotations

import argparse
import io
import json
import sys
from pathlib import Path
from typing import Any

import pandas as pd

from core.assurance_report import render_report
from core.evidence import display_name, sha256_hex
from core.outcome_audit import AuditInputError, run_outcome_audit, suggest_roles
from core.paired import paired_probe
from core.probe_runner import run_probes
from core.probes import generate_probes, probes_to_csv, probes_to_jsonl, read_probes
from core.report_verify import ReportFormatError, extract_fingerprint, reproduce

SEVERITY = {"no_material_disparity": 0, "inconclusive": 1, "disparity": 2}
FAIL_AT = {"never": 99, "disparity": 2, "inconclusive": 1}


def _read(path: str) -> tuple[pd.DataFrame, bytes]:
    raw = Path(path).read_bytes()
    return pd.read_csv(io.BytesIO(raw)), raw


def _summary(result: dict[str, Any], out) -> None:
    v = result["verdict"]
    print(f"BIAS-0 outcome audit: {v['label']} (grade {v['grade']})", file=out)
    print(f"  {result['n_decisions']:,} decisions, selection rate {result['overall_selection_rate']:.1%}", file=out)
    for f in result["findings"][:3]:
        print(f"  [{f['label']}] {f['name']}: {f['text']}", file=out)
    now = [a for a in result.get("action_plan", []) if a["priority"] == "now"]
    if now:
        print("Act now:", file=out)
        for a in now:
            print(f"  - {a['title']} ({a['owner']})", file=out)


def _role(given: str | None, detected: str | None) -> str | None:
    """Not given: use the detected column. Given as '': skip the role."""
    if given is None:
        return detected
    return given or None


def cmd_audit(args: argparse.Namespace, out=None) -> int:
    out = out or sys.stdout
    df, raw = _read(args.file)
    guess = suggest_roles(df)["suggested"]
    decision = args.decision or guess["decision_col"]
    groups = [g.strip() for g in args.groups.split(",")] if args.groups else guess["group_cols"]
    if not decision or not groups:
        print("Could not detect the decision or group columns; pass --decision and --groups.", file=sys.stderr)
        return 2
    result = run_outcome_audit(
        df,
        decision,
        groups,
        outcome_col=_role(args.outcome, guess["outcome_col"]),
        score_col=_role(args.score, guess["score_col"]),
        time_col=_role(args.time, guess["time_col"]),
        positive_decision=args.positive,
        threshold=args.threshold,
        config={"seed": args.seed, **({"n_boot": args.n_boot} if args.n_boot is not None else {})},
    )
    provenance = {"filename": display_name(Path(args.file).name), "sha256": sha256_hex(raw)}
    result["provenance"] = provenance
    _summary(result, out)
    if args.report:
        Path(args.report).write_text(render_report(result, provenance=provenance, system_name=args.system), encoding="utf-8")
        print(f"Report: {args.report}", file=out)
    if args.json:
        Path(args.json).write_text(json.dumps(result, indent=2, default=str), encoding="utf-8")
        print(f"JSON: {args.json}", file=out)
    failed = SEVERITY[result["verdict"]["status"]] >= FAIL_AT[args.fail_on]
    print(f"Gate (--fail-on {args.fail_on}): {'FAILED' if failed else 'passed'}", file=out)
    return 1 if failed else 0


def cmd_verify(args: argparse.Namespace, out=None) -> int:
    out = out or sys.stdout
    fp = extract_fingerprint(Path(args.report).read_text(encoding="utf-8", errors="replace"))
    df, raw = _read(args.file)
    res = reproduce(fp, df, raw)
    print(res["summary"], file=out)
    for c in res["checks"]:
        if not c["ok"]:
            print(f"  differs: {c['name']}: report {c['expected']} vs re-run {c['actual']}", file=out)
    return 0 if res["verified"] else 1


def _parse_group(raw: str) -> dict[str, Any]:
    label, sep, names = raw.partition("=")
    if not sep:
        raise AuditInputError(f"--group must look like 'label=Name1,Name2', got '{raw}'.")
    return {"label": label.strip(), "names": [n.strip() for n in names.split(",") if n.strip()]}


def _is_jsonl(path: str | None) -> bool:
    return (path or "").lower().endswith((".jsonl", ".ndjson"))


def cmd_probes_generate(args: argparse.Namespace, out=None) -> int:
    out = out or sys.stdout
    groups = [_parse_group(g) for g in args.group] if args.group else None
    roles = [r.strip() for r in args.roles.split(",")] if args.roles else None
    rows = generate_probes(args.pairs, args.seed, groups, roles)
    fmt = args.format or ("jsonl" if _is_jsonl(args.out) else "csv")
    text = probes_to_jsonl(rows) if fmt == "jsonl" else probes_to_csv(rows)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8", newline="")
        labels = " / ".join(dict.fromkeys(r["variant"] for r in sorted(rows, key=lambda r: r["probe_id"])))
        print(f"{len(rows)} probes ({args.pairs} pairs, {labels}), probe set {rows[0]['probe_set']}: {args.out}", file=out)
    else:
        out.write(text)
    return 0


def cmd_probes_run(args: argparse.Namespace, out=None) -> int:
    out = out or sys.stdout
    probes = read_probes(Path(args.file).read_text(encoding="utf-8"))
    if args.limit:
        probes = probes[: args.limit]
    headers = {}
    for h in args.header or []:
        k, sep, v = h.partition(":")
        if not sep:
            raise AuditInputError(f"--header must look like 'Name: value', got '{h}'.")
        headers[k.strip()] = v.strip()
    template = json.loads(args.template) if args.template else None
    rows = run_probes(
        probes, args.endpoint, template=template, decision_path=args.decision_path,
        score_path=args.score_path or None, headers=headers, timeout=args.timeout, delay=args.delay,
        dry_run=args.dry_run, mock_penalised=args.mock_penalise, mock_penalty=args.mock_penalty,
    )
    errors = sum(1 for r in rows if r.get("error"))
    if args.dry_run:
        print(f"Dry run: {len(rows)} requests prepared, none sent. First request:", file=out)
        print(rows[0]["request"] if rows else "(no probes)", file=out)
    else:
        print(f"{len(rows) - errors} of {len(rows)} probes answered" + (f", {errors} failed" if errors else ""), file=out)
    if args.out:
        text = probes_to_jsonl(rows) if _is_jsonl(args.out) else probes_to_csv(rows, ["decision", "score", "error", "request"])
        Path(args.out).write_text(text, encoding="utf-8", newline="")
        print(f"Results: {args.out}", file=out)
    return 1 if rows and errors == len(rows) else 0


def cmd_paired(args: argparse.Namespace, out=None) -> int:
    out = out or sys.stdout
    df, raw = _read(args.file)
    score = args.score or None
    if score and score not in df.columns:
        score = None  # the default 'score' column is optional
    result = paired_probe(
        df, args.pair, args.variant, args.decision, score_col=score,
        positive_decision=args.positive, reference=args.reference, config={"seed": args.seed},
    )
    v = result["verdict"]
    print(f"BIAS-0 paired test: {v['label']}", file=out)
    flip = result["flip_rate"]
    p_val = result["mcnemar_p"]
    p_txt = "< 0.0001" if p_val < 1e-4 else f"= {p_val:.4f}"
    print(f"  {result['n_pairs']} pairs, flip rate {flip:.1%}, exact McNemar p {p_txt}"
          if flip is not None else f"  {result['n_pairs']} pairs", file=out)
    print(f"  {v['reason']}", file=out)
    for w in result["warnings"]:
        print(f"  warning: {w}", file=out)
    if args.json:
        result["provenance"] = {"filename": display_name(Path(args.file).name), "sha256": sha256_hex(raw)}
        Path(args.json).write_text(json.dumps(result, indent=2, default=str), encoding="utf-8")
        print(f"JSON: {args.json}", file=out)
    failed = SEVERITY[v["status"]] >= FAIL_AT[args.fail_on]
    print(f"Gate (--fail-on {args.fail_on}): {'FAILED' if failed else 'passed'}", file=out)
    return 1 if failed else 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m cli", description="BIAS-0 from the command line: outcome audit, report verification, paired tests.")
    sub = p.add_subparsers(dest="command", required=True)
    a = sub.add_parser("audit", help="audit a decision log (CSV)")
    a.add_argument("file")
    a.add_argument("--decision", help="decision column (detected if omitted)")
    a.add_argument("--groups", help="comma-separated group columns (detected if omitted)")
    a.add_argument("--outcome", help="outcome column; pass '' to skip a detected one")
    a.add_argument("--score", help="score column; pass '' to skip a detected one")
    a.add_argument("--time", help="timestamp column; pass '' to skip a detected one")
    a.add_argument("--positive", help="favourable decision value (inferred if omitted)")
    a.add_argument("--threshold", type=float, default=0.8, help="materiality threshold for the impact ratio")
    a.add_argument("--n-boot", type=int, dest="n_boot", help="bootstrap resamples (default 1000)")
    a.add_argument("--seed", type=int, default=42)
    a.add_argument("--system", help="system name for the report")
    a.add_argument("--report", help="write the HTML report here")
    a.add_argument("--json", help="write the audit JSON here")
    a.add_argument("--fail-on", choices=list(FAIL_AT), default="disparity", dest="fail_on")
    v = sub.add_parser("verify", help="reproduce a BIAS-0 report from its CSV")
    v.add_argument("report")
    v.add_argument("file")

    pr = sub.add_parser("probes", help="paired test: generate name-swapped probes or send them to a screener")
    psub = pr.add_subparsers(dest="probes_command", required=True)
    g = psub.add_parser("generate", help="write the name-swapped probe set")
    g.add_argument("--pairs", type=int, default=200)
    g.add_argument("--seed", type=int, default=7)
    g.add_argument("--group", action="append", help="'label=Name1,Name2', given twice (default: female-/male-coded names)")
    g.add_argument("--roles", help="comma-separated roles (default: all four)")
    g.add_argument("--format", choices=["csv", "jsonl"], help="default: from --out, else csv")
    g.add_argument("--out", help="write here (default: stdout)")
    r = psub.add_parser("run", help="POST each probe to a screener and record its decision")
    r.add_argument("file", help="probes CSV or JSONL from 'probes generate'")
    r.add_argument("--endpoint", required=True, help="http(s) URL, or 'mock' for the built-in offline screener")
    r.add_argument("--template", help="JSON request body with {{field}} placeholders (default: probe_id, role, resume_text)")
    r.add_argument("--decision-path", default="decision", dest="decision_path", help="dotted path to the decision in the response")
    r.add_argument("--score-path", default="score", dest="score_path", help="dotted path to the score ('' for none)")
    r.add_argument("--header", action="append", help="'Name: value', repeatable (for example an Authorization header)")
    r.add_argument("--timeout", type=float, default=30.0)
    r.add_argument("--delay", type=float, default=0.0, help="seconds between calls, for rate limits")
    r.add_argument("--limit", type=int, help="send only the first N probes")
    r.add_argument("--dry-run", action="store_true", dest="dry_run", help="prepare the requests, send nothing")
    r.add_argument("--mock-penalise", dest="mock_penalise", help="mock only: the variant the stand-in screener docks")
    r.add_argument("--mock-penalty", type=float, default=0.6, dest="mock_penalty")
    r.add_argument("--out", help="write results here (CSV, or JSONL by extension)")
    pa = sub.add_parser("paired", help="analyse paired-probe results")
    pa.add_argument("file")
    pa.add_argument("--pair", default="pair_id")
    pa.add_argument("--variant", default="variant")
    pa.add_argument("--decision", default="decision")
    pa.add_argument("--score", default="score", help="score column ('' for none)")
    pa.add_argument("--positive", help="favourable decision value (inferred if omitted)")
    pa.add_argument("--reference", help="reference variant (default: first alphabetically)")
    pa.add_argument("--seed", type=int, default=42)
    pa.add_argument("--json", help="write the result JSON here")
    pa.add_argument("--fail-on", choices=list(FAIL_AT), default="disparity", dest="fail_on")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):  # column names and "×" print correctly on Windows consoles too
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except (ValueError, OSError):
            pass
    try:
        if args.command == "probes":
            return cmd_probes_generate(args) if args.probes_command == "generate" else cmd_probes_run(args)
        return {"audit": cmd_audit, "verify": cmd_verify, "paired": cmd_paired}[args.command](args)
    except (AuditInputError, ReportFormatError, FileNotFoundError, pd.errors.ParserError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
