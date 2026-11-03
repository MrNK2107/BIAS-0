"""Self-contained HTML assurance report for an outcome audit.

One file, no scripts, inline CSS and SVG, printable to PDF from any browser.
Every user-supplied string (column names, categories, system name) is
HTML-escaped. The report holds aggregates only, never row-level data.
"""

from __future__ import annotations

import html
from datetime import UTC, datetime
from typing import Any

from .report_verify import fingerprint, meta_tag

STATUS_CLASS = {
    "disparity": "bad",
    "inconclusive": "warn",
    "no_material_disparity": "good",
    "breach": "bad",
    "watch": "warn",
    "ok": "good",
    "insufficient": "muted",
    "evidenced": "good",
    "partial": "warn",
    "not_evidenced": "muted",
}
STATUS_TEXT = {"evidenced": "Evidenced", "partial": "Partial", "not_evidenced": "Not evidenced by this audit"}

CSS = """
:root{--paper:#fbfaf7;--ink:#15171b;--ink-2:#4a4d55;--rule:#dcd7cc;--gold:#8a6236;--gold-soft:#f1e8db;
--good:#2f6b4f;--good-bg:#e6f0ea;--warn:#8a5a00;--warn-bg:#f7eed9;--bad:#a3352b;--bad-bg:#f6e3e0;--muted:#6b6e76;--muted-bg:#efede8}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.55 "IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:980px;margin:0 auto;padding:48px 32px 80px}
h1,h2,h3{font-family:Fraunces,Georgia,"Times New Roman",serif;font-weight:600;letter-spacing:-.01em;margin:0}
h1{font-size:34px;line-height:1.15}h2{font-size:22px;margin:44px 0 12px;padding-top:16px;border-top:1px solid var(--rule)}
h3{font-size:16px;margin:24px 0 8px}
.eyebrow{font:600 11px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--gold)}
.mono,code{font-family:"IBM Plex Mono",ui-monospace,Consolas,monospace;font-size:12px}
.cover{display:grid;grid-template-columns:1fr auto;gap:32px;align-items:start;padding-bottom:28px;border-bottom:2px solid var(--ink)}
.seal{width:150px;height:150px}
.meta{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin-top:20px;color:var(--ink-2)}
.meta dt{font-weight:600;color:var(--ink)}.meta dd{margin:0;word-break:break-all}
.verdict{display:flex;gap:20px;align-items:center;margin:24px 0;padding:18px 20px;border:1px solid var(--rule);border-left:6px solid var(--ink);background:#fff}
.verdict.bad{border-left-color:var(--bad)}.verdict.warn{border-left-color:var(--warn)}.verdict.good{border-left-color:var(--good)}
.grade{font:600 44px/1 Fraunces,Georgia,serif;width:64px;text-align:center}
table{width:100%;border-collapse:collapse;margin:8px 0 4px;background:#fff}
th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--rule);vertical-align:top}
th{font:600 11px/1.3 "IBM Plex Mono",monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2);background:var(--muted-bg)}
td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
.pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap}
.pill.good{color:var(--good);background:var(--good-bg)}.pill.warn{color:var(--warn);background:var(--warn-bg)}
.pill.bad{color:var(--bad);background:var(--bad-bg)}.pill.muted{color:var(--muted);background:var(--muted-bg)}
.range{position:relative;width:140px;height:12px;background:var(--muted-bg);border-radius:2px}
.range span{position:absolute;top:3px;height:6px;background:var(--gold);opacity:.55;border-radius:2px}
.range i{position:absolute;top:0;width:2px;height:12px;background:var(--ink)}
.range b{position:absolute;top:-2px;width:0;height:16px;border-left:1px dashed var(--bad)}
.note{color:var(--ink-2);font-size:13px}.small{font-size:12px;color:var(--muted)}
ol.actions{padding-left:0;list-style:none;counter-reset:a}ol.actions li{padding:10px 0 10px 14px;border-left:3px solid var(--rule);margin:8px 0}ol.actions li.act-now{border-left-color:#b4442f}ol.actions li.act-next{border-left-color:#b9852c}ol.actions li.act-record{border-left-color:#6d7f73}ol.actions p{margin:4px 0 0}.prio{font:600 11px 'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:.08em;margin-right:8px;color:var(--muted)}.owner{font-size:12px;color:var(--muted);margin-left:6px}ul.findings{padding-left:0;list-style:none}ul.findings li{padding:10px 0;border-bottom:1px solid var(--rule)}
.warnbox{background:var(--warn-bg);border:1px solid #e6d3a8;padding:12px 16px;margin:12px 0}
.warnbox li{margin:2px 0}
.sign{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:16px}
.sign div{border-top:1px solid var(--ink);padding-top:6px;min-height:72px;color:var(--ink-2);font-size:12px}
svg text{font-family:"IBM Plex Mono",monospace;font-size:10px;fill:var(--ink-2)}
@media print{main{padding:0}h2{break-after:avoid}table,.verdict,figure{break-inside:avoid}body{background:#fff}}
@page{size:A4;margin:16mm}
"""


def _e(value: Any) -> str:
    return html.escape("" if value is None else str(value), quote=True)


def _num(value: Any, digits: int = 2) -> str:
    return "n/a" if value is None else f"{float(value):.{digits}f}"


def _pct(value: Any) -> str:
    return "n/a" if value is None else f"{float(value) * 100:.1f}%"


def _pill(status: str, text: str | None = None) -> str:
    return f'<span class="pill {STATUS_CLASS.get(status, "muted")}">{_e(text or status.replace("_", " "))}</span>'


def _range(lo: Any, hi: Any, point: Any, threshold: float | None = None) -> str:
    if lo is None or hi is None or point is None:
        return '<span class="small">no interval</span>'
    marker = f'<b style="left:{threshold * 100:.1f}%"></b>' if threshold is not None else ""
    return (
        f'<div class="range" role="img" aria-label="95% interval {_num(lo)} to {_num(hi)}">'
        f'<span style="left:{float(lo) * 100:.1f}%;width:{max(0.6, (float(hi) - float(lo)) * 100):.1f}%"></span>'
        f'<i style="left:{float(point) * 100:.1f}%"></i>{marker}</div>'
    )


def seal_svg(grade: str, status: str) -> str:
    colour = {"bad": "#a3352b", "warn": "#8a5a00", "good": "#2f6b4f"}.get(STATUS_CLASS.get(status, ""), "#15171b")
    return f"""<svg class="seal" viewBox="0 0 160 160" role="img" aria-label="Grade {_e(grade)}">
<defs><path id="ring" d="M80,80 m-58,0 a58,58 0 1,1 116,0 a58,58 0 1,1 -116,0"/></defs>
<circle cx="80" cy="80" r="76" fill="none" stroke="#15171b" stroke-width="1.5"/>
<circle cx="80" cy="80" r="70" fill="none" stroke="#8a6236" stroke-width="0.8"/>
<circle cx="80" cy="80" r="44" fill="#fff" stroke="{colour}" stroke-width="2"/>
<text style="font:600 9px 'IBM Plex Mono',monospace;letter-spacing:2.6px;fill:#8a6236"><textPath href="#ring">BIAS-0 · OUTCOME AUDIT · FAIRNESS ASSURANCE ·</textPath></text>
<text x="80" y="96" text-anchor="middle" style="font:600 46px Fraunces,Georgia,serif;fill:{colour}">{_e(grade)}</text>
</svg>"""


def drift_svg(
    points: list[dict[str, Any]],
    threshold: float,
    width: int = 900,
    height: int = 190,
    marker: dict[str, str] | None = None,
) -> str:
    """Impact ratio per period with its 95% band, the threshold line and an optional change marker."""
    if not points:
        return ""
    left, right, top, bottom = 44, 12, 12, 30
    w, h = width - left - right, height - top - bottom
    ymin, ymax = 0.3, 1.1
    n = len(points)

    def x(i: int) -> float:
        return left + (w * (i + 0.5) / n)

    def y(v: float) -> float:
        v = min(max(v, ymin), ymax)
        return top + h * (1 - (v - ymin) / (ymax - ymin))

    parts = [f'<svg viewBox="0 0 {width} {height}" width="100%" role="img" aria-label="Impact ratio by period">']
    for tick in (0.4, 0.6, 0.8, 1.0):
        parts.append(f'<line x1="{left}" x2="{width - right}" y1="{y(tick):.1f}" y2="{y(tick):.1f}" stroke="#ebe7de"/>')
        parts.append(f'<text x="{left - 6}" y="{y(tick) + 3:.1f}" text-anchor="end">{tick:.1f}</text>')
    parts.append(
        f'<line x1="{left}" x2="{width - right}" y1="{y(threshold):.1f}" y2="{y(threshold):.1f}" '
        f'stroke="#a3352b" stroke-dasharray="4 3"/>'
        f'<text x="{width - right}" y="{y(threshold) - 4:.1f}" text-anchor="end" style="fill:#a3352b">threshold {threshold:.2f}</text>'
    )
    if marker:
        idx = next((i for i, p in enumerate(points) if p["period"] == marker.get("period")), None)
        if idx is not None:
            mx = x(idx) - w / n / 2  # the switch happens at the start of that period
            parts.append(
                f'<line x1="{mx:.1f}" x2="{mx:.1f}" y1="{top}" y2="{top + h}" stroke="#8a6236" stroke-width="1.2"/>'
                f'<text x="{mx + 4:.1f}" y="{top + 10}" style="fill:#8a6236">{_e(marker.get("label", ""))}</text>'
            )
    segs: list[list[int]] = [[]]
    for i, p in enumerate(points):
        if p["impact_ratio"] is None:
            segs.append([])
        else:
            segs[-1].append(i)
    for seg in segs:
        if not seg:
            continue
        upper = " ".join(f"{x(i):.1f},{y(points[i]['ci_upper']):.1f}" for i in seg)
        lower = " ".join(f"{x(i):.1f},{y(points[i]['ci_lower']):.1f}" for i in reversed(seg))
        parts.append(f'<polygon points="{upper} {lower}" fill="#8a6236" opacity="0.16"/>')
        line = " ".join(f"{x(i):.1f},{y(points[i]['impact_ratio']):.1f}" for i in seg)
        parts.append(f'<polyline points="{line}" fill="none" stroke="#15171b" stroke-width="1.6"/>')
    colours = {"breach": "#a3352b", "watch": "#8a5a00", "ok": "#2f6b4f"}
    step = max(1, n // 12)
    for i, p in enumerate(points):
        if p["impact_ratio"] is not None:
            parts.append(
                f'<circle cx="{x(i):.1f}" cy="{y(p["impact_ratio"]):.1f}" r="3.6" fill="{colours.get(p["status"], "#6b6e76")}">'
                f'<title>{_e(p["period"])}: {p["impact_ratio"]:.2f} ({_e(p["status"])})</title></circle>'
            )
        else:
            parts.append(f'<text x="{x(i):.1f}" y="{top + h - 4:.1f}" text-anchor="middle">·</text>')
        if i % step == 0:
            parts.append(f'<text x="{x(i):.1f}" y="{height - 10}" text-anchor="middle">{_e(p["period"])}</text>')
    parts.append("</svg>")
    return "".join(parts)


def _marker_for(audit: dict[str, Any], attr: str) -> dict[str, str] | None:
    for lk in (audit.get("change_points") or {}).get("links", []):
        if lk["attribute"] == attr:
            return {"period": lk["period"], "label": f"{lk['column']} → {lk['to']}"}
    return None


def _impact_table(block: dict[str, Any], threshold: float, rate_label: str) -> str:
    rows = []
    for r in block["categories"]:
        reliable = r.get("reliable", True)
        ci = r.get("rate_ci")
        flag = "" if reliable else ' <span class="pill muted">small group</span>'
        rows.append(
            f"<tr><td>{_e(r['category'])}{flag}</td><td class='num'>{r.get('n', '')}</td>"
            f"<td class='num'>{_pct(r['rate'])}</td>"
            f"<td class='num'>{'' if not ci else f'{_pct(ci[0])} – {_pct(ci[1])}'}</td>"
            f"<td>{_range(ci[0], ci[1], r['rate']) if ci else ''}</td>"
            f"<td class='num'>{_num(r['impact_ratio'])}</td></tr>"
        )
    foot = []
    if block.get("most_selected"):
        foot.append(f"Most selected: {_e(block['most_selected'])}.")
    if block.get("unknown_count"):
        foot.append(f"Unknown category: {block['unknown_count']} excluded and counted (5-301(b)(5)).")
    foot.append("Impact ratios are reported without a pass mark; LL144 sets none.")
    return (
        f"<table><thead><tr><th>Category</th><th>n</th><th>{_e(rate_label)}</th><th>95% CI (Wilson)</th>"
        f"<th>Interval</th><th>Impact ratio</th></tr></thead><tbody>{''.join(rows)}</tbody></table>"
        f"<p class='small'>{' '.join(foot)}</p>"
    )


def render_report(
    audit: dict[str, Any],
    *,
    provenance: dict[str, Any] | None = None,
    system_name: str | None = None,
    organisation: str | None = None,
    generated_at: str | None = None,
) -> str:
    prov = provenance or {}
    v = audit["verdict"]
    threshold = float(audit["threshold"])
    cfg = audit["config"]
    m = audit["mapping"]
    generated_at = generated_at or datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
    system = system_name or "Automated decision system"
    drift = audit.get("drift")
    window = ""
    if drift and drift.get("periods"):
        window = f"{drift['periods'][0]['period']} to {drift['periods'][-1]['period']} ({len(drift['periods'])} {drift['period_label']}s)"

    out: list[str] = []
    out.append(f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fairness assurance report: {_e(system)}</title>
{meta_tag(fingerprint(audit, prov))}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body><main>""")

    out.append(f"""<section class="cover"><div>
<div class="eyebrow">Fairness assurance report · outcome audit</div>
<h1>{_e(system)}</h1>
<p class="note">{_e(organisation) + " · " if organisation else ""}Generated {_e(generated_at)} by BIAS-0 ({_e(audit['schema'])})</p>
<dl class="meta">
<dt>Input</dt><dd>{_e(prov.get('filename') or 'uploaded decision log')}</dd>
<dt>SHA-256</dt><dd class="mono">{_e(prov.get('sha256') or 'n/a')}</dd>
<dt>Decisions</dt><dd>{audit['n_decisions']:,} of {audit['n_rows']:,} rows · overall selection rate {_pct(audit['overall_selection_rate'])}</dd>
<dt>Data window</dt><dd>{_e(window or 'no time column supplied')}</dd>
<dt>Attributes</dt><dd>{_e(', '.join(m['group_cols']))}</dd>
</dl></div>{seal_svg(v['grade'], v['status'])}</section>""")

    out.append(f"""<div class="verdict {STATUS_CLASS[v['status']]}"><div class="grade">{_e(v['grade'])}</div>
<div><div class="eyebrow">Verdict</div><h3 style="margin:4px 0">{_e(v['label'])}</h3>
<div class="note">{_e(v['rule'])}</div></div></div>""")

    plan = audit.get("action_plan") or []
    if plan:
        labels = {"now": "Act now", "next": "Next", "record": "Record"}
        out.append("<h2 id='actions'>What to do next</h2><p class='note'>Plain-language follow-ups derived from the "
                   "findings below. Owners are roles; each action names the evidence it rests on.</p><ol class='actions'>")
        for a in plan:
            out.append(
                f"<li class='act-{_e(a['priority'])}'><div><span class='prio'>{_e(labels.get(a['priority'], a['priority']))}</span>"
                f"<strong>{_e(a['title'])}</strong> <span class='owner'>{_e(a['owner'])}</span></div>"
                f"<p class='note'>{_e(a['detail'])}</p></li>"
            )
        out.append("</ol>")

    out.append("<h2>1. Key findings</h2><ul class='findings'>")
    for f in audit["findings"]:
        out.append(f"<li>{_pill(f['status'], f['label'])} <strong>{_e(f['name'])}</strong><br>{_e(f['text'])}</li>")
    out.append("</ul>")
    if audit["warnings"]:
        out.append("<div class='warnbox'><strong>Data and reliability warnings</strong><ul>")
        out.extend(f"<li>{_e(w)}</li>" for w in audit["warnings"])
        out.append("</ul></div>")

    out.append(f"""<h2>2. Scope and method</h2>
<table><tbody>
<tr><th>Decision</th><td>'{_e(m['decision_col'])}': favourable value <code>{_e(audit['decision']['positive']['value'])}</code> ({_e(audit['decision']['positive']['source'])})</td></tr>
<tr><th>Outcome</th><td>{_e(m['outcome_col'] or 'not supplied: error-rate metrics not assessed')}{'' if audit.get('outcome_coverage') is None else f" (known for {_pct(audit['outcome_coverage'])} of decisions)"}</td></tr>
<tr><th>Score</th><td>{_e(m['score_col'] or 'not supplied')}</td></tr>
<tr><th>Time</th><td>{_e(m['time_col'] or 'not supplied')}</td></tr>
<tr><th>Materiality threshold</th><td>Impact ratio {threshold:.2f} (EEOC four-fifths heuristic; a convention, not a legal pass mark)</td></tr>
<tr><th>Uncertainty</th><td>Wilson 95% intervals for rates; {cfg['n_boot']} stratified bootstrap resamples (seed {cfg['seed']}) for gaps and impact ratios</td></tr>
<tr><th>Small groups</th><td>Groups under {cfg['min_group_size']} decisions are shown but excluded from gaps and verdicts</td></tr>
</tbody></table>""")

    out.append("<h2>3. Selection rates and impact ratios (NYC LL144 5-301(b))</h2>")
    for attr, block in audit["ll144"]["selection"]["attributes"].items():
        a = audit["attributes"][attr]
        gi = a["gaps"]["disparate_impact_ratio"]
        out.append(
            f"<h3>{_e(attr)} {_pill(a['verdict']['status'], a['verdict']['label'])}</h3>"
            f"<p class='note'>Impact ratio over reliable groups {_num(gi['point'])} "
            f"(95% CI {_num(gi['ci_lower'])}–{_num(gi['ci_upper'])}); selection-rate gap "
            f"{_pct(a['gaps']['demographic_parity_difference']['point'])}.</p>"
        )
        out.append(_impact_table(block, threshold, "Selection rate"))
    if "scoring" in audit["ll144"]:
        out.append("<h3>Scoring rates (5-301(c))</h3><p class='note'>Share of each category scoring above the full-sample median score.</p>")
        for attr, block in audit["ll144"]["scoring"]["attributes"].items():
            out.append(f"<h3 class='small'>{_e(attr)}</h3>")
            out.append(_impact_table(block, threshold, "Scoring rate"))

    if audit["intersections"]:
        out.append("<h2>4. Intersectional analysis</h2><p class='note'>Pairs of attributes analysed as one. Cells under "
                   f"{cfg['min_group_size']} decisions are listed as suppressed rather than ranked.</p>")
        out.append("<table><thead><tr><th>Intersection</th><th>Reliable cells</th><th>Suppressed</th><th>Impact ratio (95% CI)</th><th>Verdict</th></tr></thead><tbody>")
        for name, b in audit["intersections"].items():
            gi = b["gaps"]["disparate_impact_ratio"]
            out.append(
                f"<tr><td>{_e(name)}</td><td class='num'>{b['n_reliable_groups']}</td><td class='num'>{b['n_small_groups']}</td>"
                f"<td class='num'>{_num(gi['point'])} ({_num(gi['ci_lower'])}–{_num(gi['ci_upper'])})</td>"
                f"<td>{_pill(b['verdict']['status'], b['verdict']['label'])}</td></tr>"
            )
        out.append("</tbody></table>")

    first_attr = next(iter(audit["attributes"].values()))
    if "error_rates" in first_attr:
        out.append(f"<h2>5. Error rates against the outcome ('{_e(m['outcome_col'])}')</h2>")
        out.append("<table><thead><tr><th>Attribute</th><th>Equal-opportunity gap (TPR)</th><th>FPR gap</th><th>Equalized odds</th></tr></thead><tbody>")
        for attr, a in audit["attributes"].items():
            g = a["error_rates"]["gaps"]

            def cell(k: str, g: dict[str, Any] = g) -> str:
                return f"{_num(g[k]['point'])} ({_num(g[k]['ci_lower'])}–{_num(g[k]['ci_upper'])})"

            out.append(f"<tr><td>{_e(attr)}</td><td class='num'>{cell('equal_opportunity_difference')}</td>"
                       f"<td class='num'>{cell('fpr_gap')}</td><td class='num'>{cell('equalized_odds_difference')}</td></tr>")
        out.append("</tbody></table><p class='small'>Over reliable groups and rows with a known outcome. 95% bootstrap intervals.</p>")

    if drift and drift.get("series"):
        out.append(f"<h2>6. Fairness drift by {_e(drift['period_label'])}</h2>")
        out.append(f"<p class='note'>Impact ratio per period with its 95% band ({drift['n_boot']} resamples). "
                   "Breach: the whole band is below the threshold. Watch: the point is below but the band crosses it. "
                   "Gaps in the line mark periods with fewer than two reliable groups.</p>")
        for attr, s in drift["series"].items():
            trend = s["trend_per_period"]
            trend_txt = "n/a" if trend is None else f"{trend:+.3f} per {drift['period_label']}"
            out.append(f"<figure style='margin:16px 0'><h3>{_e(attr)}</h3>{drift_svg(s['points'], threshold, marker=_marker_for(audit, attr))}"
                       f"<figcaption class='small'>Breaching periods: {s['breach_periods']} · insufficient: "
                       f"{s['insufficient_periods']} · weighted trend {trend_txt}</figcaption></figure>")
        if drift["alerts"]:
            out.append("<div class='warnbox'><strong>Monitoring alerts</strong><ul>")
            out.extend(f"<li>{_e(a['message'])}</li>" for a in drift["alerts"])
            out.append("</ul></div>")
        cp = audit.get("change_points") or {}
        if cp.get("changes"):
            out.append("<h3>What changed in the log</h3><p class='note'>" + _e(cp.get("note", "")) + "</p><table><thead><tr>"
                       "<th>Column</th><th>Period</th><th>From</th><th>To</th><th>Drift that starts there</th></tr></thead><tbody>")
            for ch in cp["changes"]:
                linked = [lk for lk in cp.get("links", []) if lk["column"] == ch["column"] and lk["period"] == ch["period"]]
                what = "; ".join(
                    f"{lk['attribute']}: impact ratio {_num(lk['impact_ratio_before'])} → {_num(lk['impact_ratio_after'])}" for lk in linked
                ) or "none"
                out.append(f"<tr><td>{_e(ch['column'])}</td><td>{_e(ch['period'])}</td><td>{_e(ch['from'])}</td>"
                           f"<td>{_e(ch['to'])}</td><td>{_e(what)}</td></tr>")
            out.append("</tbody></table>")

    fw = audit.get("frameworks")
    if fw:
        out.append("<h2>7. Regulatory mapping</h2><p class='note'>" + _e(fw["disclaimer"]) + "</p>")
        current = None
        for c in fw["controls"]:
            if c["framework"] != current:
                if current is not None:
                    out.append("</tbody></table>")
                current = c["framework"]
                meta = fw["catalogue"][current]
                out.append(f"<h3>{_e(meta['name'])}</h3><p class='small'>{_e(meta['scope'])} {_e(meta['status_note'])}</p>")
                out.append("<table><thead><tr><th style='width:110px'>Ref</th><th>Requirement</th><th style='width:130px'>Status</th><th>Evidence in this report</th></tr></thead><tbody>")
            out.append(f"<tr><td class='mono'>{_e(c['ref'])}</td><td>{_e(c['requirement'])}</td>"
                       f"<td>{_pill(c['status'], STATUS_TEXT[c['status']])}</td><td>{_e(c['evidence'])}</td></tr>")
        out.append("</tbody></table>")

    out.append("""<h2>8. Limitations</h2><ul class="note">
<li>An outcome audit measures disparities in decisions. It does not establish their cause, and it does not test whether a gap is justified by legitimate factors (for example income or bureau score).</li>
<li>Results hold only for this data window and these attributes. Groups that were not recorded cannot be assessed; proxies (pincode, surname, institution) need a separate proxy analysis.</li>
<li>The materiality threshold is a convention. A ratio above it is not proof of fairness, and one below it is not proof of unlawful discrimination.</li>
<li>Error-rate metrics depend on the quality of the outcome label. If outcomes are observed only for approved cases, those metrics are biased.</li>
<li>Bootstrap intervals assume decisions are independent. Repeated applicants or batch effects make them too narrow.</li>
<li>This report is a reporting aid, not legal advice. BIAS-0 never certifies a system as "unbiased".</li>
</ul>""")

    out.append(f"""<h2>9. Sign-off</h2><p class="note">Required before the report is relied on. Under NYC LL144 the auditor must be independent of the employer and the tool vendor.</p>
<div class="sign"><div>Prepared by (analyst), date</div><div>Independent auditor, date</div><div>Approved by (model risk / compliance), date</div></div>
<p class="small" style="margin-top:32px">Reproduce: same input file (SHA-256 above), same mapping, bootstrap seed {cfg['seed']}, BIAS-0 {_e(prov.get('bias0_version', ''))}. This file carries a machine-readable fingerprint of those settings: upload it with the decision log under <em>Reproduce a report</em> in BIAS-0 (or <code>POST /api/assurance/verify-report</code>) to check the hash and re-run every number.</p>
</main></body></html>""")
    return "".join(out)
