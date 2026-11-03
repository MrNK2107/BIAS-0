"""NYC Local Law 144 public summary of a bias audit, ready to post.

An employer using an automated employment decision tool (AEDT) in New York City
must publish a summary of the most recent bias audit (6 RCNY 5-303): the date
of the audit, the source and an explanation of the data, the number of
individuals assessed, the number in an unknown category, the selection or
scoring rates and impact ratios for every category (sex, race/ethnicity and
their intersection), and the distribution date of the tool.

This page is built from an outcome audit. It is deliberately plain: no
verdicts, grades or interpretation, because the rule asks for the numbers and
sets no pass mark. Fields only the employer or the independent auditor can
supply (auditor name, distribution date) are left as visible blanks unless
given. It is a drafting aid, not legal advice.
"""

from __future__ import annotations

import html
from datetime import UTC, datetime
from typing import Any

from .assurance_report import CSS as REPORT_CSS

BLANK = '<span class="blank">to be completed</span>'


def _e(v: Any) -> str:
    return html.escape("" if v is None else str(v), quote=True)


def _rate(v: Any) -> str:
    return "n/a" if v is None else f"{float(v):.1%}"


def _ratio(v: Any) -> str:
    return "n/a" if v is None else f"{float(v):.3f}"


def _intersection_rows(block: dict[str, Any]) -> list[dict[str, Any]]:
    """Intersectional categories: rate and impact ratio against the highest-rate category."""
    rows = [
        {"category": g, "n": d["count"], "rate": d["selection_rate"], "reliable": d.get("reliable", True)}
        for g, d in block["groups"].items()
        if g != "(missing)" and d.get("selection_rate") is not None
    ]
    top = max((r["rate"] for r in rows), default=0) or None
    for r in rows:
        r["impact_ratio"] = None if not top else r["rate"] / top
    rows.sort(key=lambda r: -r["rate"])
    return rows


def _table(rows: list[dict[str, Any]], rate_label: str, min_n: int) -> str:
    out = [f"<table><thead><tr><th>Category</th><th>Number of applicants</th><th>{_e(rate_label)}</th>"
           "<th>Impact ratio</th></tr></thead><tbody>"]
    for r in rows:
        note = " <span class='small'>(small group)</span>" if r.get("n") is not None and r["n"] < min_n else ""
        n_text = "" if r.get("n") is None else f"{int(r['n']):,}"
        out.append(
            f"<tr><td>{_e(r['category'])}{note}</td><td class='num'>{n_text}</td>"
            f"<td class='num'>{_rate(r.get('rate'))}</td><td class='num'>{_ratio(r.get('impact_ratio'))}</td></tr>"
        )
    out.append("</tbody></table>")
    return "".join(out)


def render_public_summary(
    audit: dict[str, Any],
    *,
    provenance: dict[str, Any] | None = None,
    tool_name: str | None = None,
    employer: str | None = None,
    distribution_date: str | None = None,
    auditor: str | None = None,
    audit_date: str | None = None,
) -> str:
    prov = provenance or {}
    min_n = int(audit["config"]["min_group_size"])
    audit_date = audit_date or datetime.now(UTC).strftime("%Y-%m-%d")
    drift = audit.get("drift")
    window = (
        f"{drift['periods'][0]['period']} to {drift['periods'][-1]['period']}"
        if drift and drift.get("periods") else "not stated in the data"
    )
    m = audit["mapping"]
    unknown_total = max((b.get("unknown_count", 0) for b in audit["attributes"].values()), default=0)
    rate_types = [t for t in ("selection", "scoring") if t in audit["ll144"]]
    labels = {"selection": "Selection rate", "scoring": "Scoring rate"}
    explain = {
        "selection": "share of applicants selected to move forward, 6 RCNY 5-301(b)",
        "scoring": "share of applicants scoring above the median score, 6 RCNY 5-301(c)",
    }
    rate_text = "; ".join(f"{labels[t]} ({explain[t]})" for t in rate_types)

    out: list[str] = [f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bias audit summary: {_e(tool_name or 'automated employment decision tool')}</title>
<style>{REPORT_CSS}
.blank{{display:inline-block;min-width:160px;border-bottom:1px dashed var(--bad);color:var(--bad);font-size:12px}}
.facts{{display:grid;grid-template-columns:max-content 1fr;gap:6px 18px;margin:18px 0}}
.facts dt{{font-weight:600}}.facts dd{{margin:0}}</style></head><body><main>
<div class="eyebrow">NYC Local Law 144 · summary of bias audit results</div>
<h1>{_e(tool_name or 'Automated employment decision tool')}</h1>
<p class="note">Published by {_e(employer) if employer else BLANK} under NYC Admin. Code § 20-871 and 6 RCNY 5-303.</p>
<dl class="facts">
<dt>Date of the bias audit</dt><dd>{_e(audit_date)}</dd>
<dt>Independent auditor</dt><dd>{_e(auditor) if auditor else BLANK}</dd>
<dt>Distribution date of the tool</dt><dd>{_e(distribution_date) if distribution_date else BLANK}</dd>
<dt>Source of data</dt><dd>Historical data from the use of the tool: {_e(prov.get('filename') or 'decision log')} ({window}).</dd>
<dt>Explanation of the data</dt><dd>One row per applicant assessed. '{_e(m['decision_col'])}' is the tool's outcome{f"; '{_e(m['score_col'])}' is its score" if m.get('score_col') else ''}. Categories are as recorded by the employer.</dd>
<dt>Number of applicants assessed</dt><dd>{audit['n_decisions']:,}</dd>
<dt>Applicants in an unknown category</dt><dd>{unknown_total:,} (excluded from the rates and impact ratios below, and counted)</dd>
<dt>Rates reported</dt><dd>{_e(rate_text)}</dd>
</dl>"""]

    for t in rate_types:
        for attr, table in audit["ll144"][t]["attributes"].items():
            rows = [{"category": c["category"], "n": c.get("n"), "rate": c.get("rate"), "impact_ratio": c.get("impact_ratio")} for c in table["categories"]]
            out.append(f"<h2>{_e(attr)}: {labels[t].lower()}s</h2>")
            out.append(_table(rows, labels[t], min_n))
            if table.get("unknown_count"):
                out.append(f"<p class='small'>Unknown category: {int(table['unknown_count']):,} applicants.</p>")

    for name, block in audit["intersections"].items():
        out.append(f"<h2>Intersectional categories: {_e(name)}</h2>")
        out.append("<p class='note'>Selection rates; impact ratio against the category with the highest rate.</p>")
        out.append(_table(_intersection_rows(block), "Selection rate", min_n))

    out.append(f"""<h2>Notes</h2><ul class="note">
<li>Impact ratio = the category's rate divided by the rate of the most selected category. The law sets no pass mark.</li>
<li>Categories with fewer than {min_n} applicants are listed for completeness; their rates are unstable. 6 RCNY 5-301(d) allows
excluding a category under 2% of the data from the impact ratios, with a justification published here.</li>
<li>This summary was drafted with BIAS-0 from the file with SHA-256 <code>{_e(prov.get('sha256') or 'n/a')}</code>. It must be reviewed
and adopted by the independent auditor before it is posted. It is not legal advice.</li>
</ul></main></body></html>""")
    return "".join(out)
