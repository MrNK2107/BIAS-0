"""Reproduce an assurance report from its decision log.

Every HTML report carries a small machine-readable fingerprint in a
``<meta name="bias0-audit">`` tag: the input SHA-256, the exact mapping and
settings (favourable values, period, threshold, bootstrap count and seed,
minimum group size) and the headline numbers. Anyone holding the report and
the CSV can then check two things without trusting the person who sent them:

1. the CSV is the file the report was made from (SHA-256), and
2. re-running the audit with the recorded settings gives the same verdict,
   grade and impact-ratio intervals.

The fingerprint is data in an attribute, not a script, so the report stays
script-free.
"""

from __future__ import annotations

import html
import json
import math
import re
from typing import Any

import pandas as pd

from .evidence import sha256_hex

META_NAME = "bias0-audit"
FINGERPRINT_VERSION = 1
TOLERANCE = 1e-4  # numbers are stored rounded to 4 places

_META_RE = re.compile(r'<meta name="bias0-audit" content="([^"]*)"', re.S)


def _interval(ir: dict[str, Any]) -> dict[str, float | None]:
    return {k: ir.get(k) for k in ("point", "ci_lower", "ci_upper")}


def fingerprint(result: dict[str, Any], provenance: dict[str, Any] | None = None) -> dict[str, Any]:
    """The settings needed to re-run the audit, and the numbers it must reproduce."""
    m = result["mapping"]
    drift = result.get("drift")
    return {
        "v": FINGERPRINT_VERSION,
        "schema": result["schema"],
        "sha256": (provenance or result.get("provenance") or {}).get("sha256"),
        "mapping": m,
        "positive_decision": result["decision"]["positive"]["value"],
        "positive_outcome": (result.get("outcome") or {}).get("positive", {}).get("value"),
        "period": drift["period"] if drift else "auto",
        "threshold": result["threshold"],
        "config": {k: result["config"][k] for k in ("n_boot", "seed", "min_group_size")},
        "expect": {
            "verdict": result["verdict"]["status"],
            "grade": result["verdict"]["grade"],
            "n_decisions": result["n_decisions"],
            "attributes": {a: _interval(b["gaps"]["disparate_impact_ratio"]) for a, b in result["attributes"].items()},
            "intersections": {a: _interval(b["gaps"]["disparate_impact_ratio"]) for a, b in result["intersections"].items()},
        },
    }


def meta_tag(fp: dict[str, Any]) -> str:
    return f'<meta name="{META_NAME}" content="{html.escape(json.dumps(fp, sort_keys=True, default=str), quote=True)}">'


class ReportFormatError(ValueError):
    """The file is not a BIAS-0 report with a fingerprint."""


def extract_fingerprint(report_html: str) -> dict[str, Any]:
    match = _META_RE.search(report_html)
    if not match:
        raise ReportFormatError(
            "No BIAS-0 fingerprint in this file. Reports made before fingerprints were added "
            "cannot be reproduced automatically; re-run the audit with the settings printed on the report."
        )
    try:
        fp = json.loads(html.unescape(match.group(1)))
    except json.JSONDecodeError as exc:
        raise ReportFormatError(f"The fingerprint is damaged: {exc}") from exc
    if not isinstance(fp, dict) or fp.get("v") != FINGERPRINT_VERSION:
        raise ReportFormatError("Unknown fingerprint version.")
    return fp


def _same(a: Any, b: Any) -> bool:
    if a is None or b is None:
        return a is None and b is None
    if isinstance(a, float) and math.isnan(a):
        return isinstance(b, float) and math.isnan(b)
    try:
        return abs(float(a) - float(b)) <= TOLERANCE
    except (TypeError, ValueError):
        return a == b


def reproduce(fp: dict[str, Any], df: pd.DataFrame, raw: bytes) -> dict[str, Any]:
    """Re-run the audit with the fingerprint's settings and compare."""
    from .outcome_audit import run_outcome_audit

    actual_sha = sha256_hex(raw)
    sha_ok = actual_sha == fp.get("sha256")
    m = fp["mapping"]
    result = run_outcome_audit(
        df,
        m["decision_col"],
        m["group_cols"],
        outcome_col=m.get("outcome_col"),
        score_col=m.get("score_col"),
        time_col=m.get("time_col"),
        positive_decision=fp.get("positive_decision"),
        positive_outcome=fp.get("positive_outcome"),
        period=fp.get("period") or "auto",
        threshold=float(fp["threshold"]),
        config=fp.get("config") or {},
    )
    now = fingerprint(result, {"sha256": actual_sha})["expect"]
    want = fp["expect"]
    checks: list[dict[str, Any]] = [
        {"name": "Verdict", "expected": want["verdict"], "actual": now["verdict"], "ok": want["verdict"] == now["verdict"]},
        {"name": "Grade", "expected": want["grade"], "actual": now["grade"], "ok": want["grade"] == now["grade"]},
        {"name": "Decisions", "expected": want["n_decisions"], "actual": now["n_decisions"], "ok": want["n_decisions"] == now["n_decisions"]},
    ]
    for scope in ("attributes", "intersections"):
        for name, exp in want.get(scope, {}).items():
            got = now.get(scope, {}).get(name)
            ok = got is not None and all(_same(exp[k], got[k]) for k in ("point", "ci_lower", "ci_upper"))
            checks.append({"name": f"Impact ratio: {name}", "expected": exp, "actual": got, "ok": ok})
    n_ok = sum(c["ok"] for c in checks)
    reproduced = n_ok == len(checks)
    if sha_ok and reproduced:
        summary = f"Reproduced. The file matches the report's SHA-256 and all {len(checks)} checks agree."
    elif not sha_ok and reproduced:
        summary = (f"The numbers reproduce ({len(checks)} of {len(checks)} checks), but this file is not the one the "
                   "report was made from (SHA-256 differs). Ask for the original export.")
    elif sha_ok:
        summary = (f"Same file, different result: {len(checks) - n_ok} of {len(checks)} checks disagree. "
                   "The report was edited, or made with a different BIAS-0 version.")
    else:
        summary = f"Not reproduced: different file and {len(checks) - n_ok} of {len(checks)} checks disagree."
    return {
        "sha256_expected": fp.get("sha256"),
        "sha256_actual": actual_sha,
        "sha256_ok": sha_ok,
        "reproduced": reproduced,
        "verified": sha_ok and reproduced,
        "checks": checks,
        "n_checks": len(checks),
        "n_ok": n_ok,
        "summary": summary,
        "settings": {k: fp.get(k) for k in ("mapping", "positive_decision", "positive_outcome", "period", "threshold", "config")},
    }
