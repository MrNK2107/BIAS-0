"""BIAS-0 from the command line: a fairness gate for pipelines.

Run from ``backend/``::

    python -m cli audit samples/sample_hiring_screen.csv --decision shortlisted \\
        --groups sex,race_ethnicity --score screen_score --time applied_date \\
        --report report.html --json audit.json --fail-on disparity

    python -m cli verify report.html samples/sample_hiring_screen.csv

``audit`` prints the verdict, the worst findings and the act-now steps, writes the
HTML report and/or JSON if asked, and exits 1 when the verdict reaches the
``--fail-on`` level (``disparity`` by default; ``inconclusive`` is stricter;
``never`` always exits 0). Column roles not given are detected the same way
the UI does. ``verify`` re-runs a report's fingerprinted settings against the
CSV and exits 0 only if the hash and every number match.

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


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m cli", description="BIAS-0 outcome audit from the command line.")
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
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):  # column names and "×" print correctly on Windows consoles too
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except (ValueError, OSError):
            pass
    try:
        return cmd_audit(args) if args.command == "audit" else cmd_verify(args)
    except (AuditInputError, ReportFormatError, FileNotFoundError, pd.errors.ParserError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
