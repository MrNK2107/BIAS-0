"""What changed, and what to do next: plain-language follow-ups for an outcome audit.

Two pieces, both deterministic and computed from the audit result plus the log:

- ``detect_changes``: columns that switch from one dominant value to another
  between periods (a model or policy version, a rule set, a vendor), and
  ``link_changes``: a drift run that starts within one period of such a switch
  is linked to it, with the impact ratio before and after the switch. This is
  a coincidence in time, worded as a lead to investigate, never as a cause.
- ``build_action_plan``: an ordered list of next steps a non-specialist
  reviewer can act on (investigate, collect more data, document, sign off),
  each with the evidence it rests on.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

DOMINANT_SHARE = 0.8   # a period "runs on" a value when it covers at least this share of rows
MAX_SWITCHES = 3       # more switches than this is noise, not a release
MAX_LEVELS = 12
VERSION_HINTS = ("version", "model", "release", "policy", "rule", "screener", "vendor", "engine", "build")


def _periods(df: pd.DataFrame, time_col: str, period: str) -> pd.Series:
    dates = pd.to_datetime(df[time_col], errors="coerce", format="mixed")
    return dates.dt.to_period(period).astype(str).where(dates.notna())


def detect_changes(df: pd.DataFrame, time_col: str, period: str, exclude: list[str]) -> list[dict[str, Any]]:
    """Columns whose dominant value switches between consecutive periods."""
    per = _periods(df, time_col, period)
    order = sorted(per.dropna().unique())
    out: list[dict[str, Any]] = []
    for col in df.columns:
        if col in exclude or col == time_col:
            continue
        s = df[col]
        if pd.api.types.is_float_dtype(s):
            continue
        n_levels = s.nunique(dropna=True)
        if not 2 <= n_levels <= MAX_LEVELS:
            continue
        modes: list[tuple[str, str | None]] = []
        for p in order:
            vals = s[per == p].dropna().astype(str)
            if vals.empty:
                modes.append((p, None))
                continue
            top = vals.value_counts(normalize=True)
            modes.append((p, str(top.index[0]) if top.iloc[0] >= DOMINANT_SHARE else None))
        switches = []
        for (p0, v0), (p1, v1) in zip(modes, modes[1:]):
            if v0 is not None and v1 is not None and v0 != v1:
                switches.append({"column": str(col), "period": p1, "from": v0, "to": v1})
        if 0 < len(switches) <= MAX_SWITCHES:
            hinted = any(h in str(col).lower() for h in VERSION_HINTS)
            for sw in switches:
                out.append({**sw, "version_like": hinted})
    out.sort(key=lambda c: (not c["version_like"], c["period"], c["column"]))
    return out


def _onset(points: list[dict[str, Any]]) -> str | None:
    """Start of the latest run of non-ok periods that contains a breach."""
    onset, has_breach, best = None, False, None
    for p in points:
        if p.get("status") in ("breach", "watch"):
            if onset is None:
                onset, has_breach = p["period"], False
            has_breach = has_breach or p["status"] == "breach"
        else:
            if onset is not None and has_breach:
                best = onset
            onset = None
    if onset is not None and has_breach:
        best = onset
    return best


def _impact_ratio(decision: np.ndarray, labels: pd.Series, mask: np.ndarray, min_n: int) -> tuple[float | None, str | None]:
    rates: dict[str, float] = {}
    lab = labels[mask]
    dec = decision[mask]
    for g in lab.dropna().unique():
        m = (lab == g).to_numpy() & ~np.isnan(dec)
        if m.sum() >= min_n:
            rates[str(g)] = float(np.mean(dec[m]))
    if len(rates) < 2 or max(rates.values()) == 0:
        return None, None
    lo = min(rates, key=rates.get)
    return round(rates[lo] / max(rates.values()), 4), lo


def link_changes(
    df: pd.DataFrame,
    decision: np.ndarray,
    labels: pd.DataFrame,
    drift: dict[str, Any],
    changes: list[dict[str, Any]],
    min_n: int,
) -> list[dict[str, Any]]:
    """Drift runs that begin within one period of a detected switch."""
    if not changes:
        return []
    from .compliance import _is_unknown

    labels = labels.apply(lambda col: col.where(~col.map(_is_unknown)))
    order = [p["period"] for p in drift.get("periods", [])]
    idx = {p: i for i, p in enumerate(order)}
    links: list[dict[str, Any]] = []
    for attr, series in drift.get("series", {}).items():
        onset = _onset(series.get("points", []))
        if onset is None or onset not in idx:
            continue
        for ch in changes:
            if ch["period"] not in idx or abs(idx[ch["period"]] - idx[onset]) > 1:
                continue
            col = df[ch["column"]].astype(str)
            before, low_before = _impact_ratio(decision, labels[attr], (col == ch["from"]).to_numpy(), min_n)
            after, low_after = _impact_ratio(decision, labels[attr], (col == ch["to"]).to_numpy(), min_n)
            links.append({
                "attribute": attr,
                "onset": onset,
                **{k: ch[k] for k in ("column", "period", "from", "to", "version_like")},
                "impact_ratio_before": before,
                "impact_ratio_after": after,
                "lowest_group_after": low_after or low_before,
                "text": (
                    f"The {attr} drift starts in {onset}, the same time {ch['column']} changed from "
                    f"{ch['from']} to {ch['to']} ({ch['period']})."
                    + (
                        f" Impact ratio {before:.2f} on {ch['from']} versus {after:.2f} on {ch['to']}."
                        if before is not None and after is not None else ""
                    )
                    + " A coincidence in time, not proof of cause: start the investigation there."
                ),
            })
            break
    return links


def _more_data(ir: dict[str, Any], n: int, threshold: float) -> int | None:
    """Rough number of extra decisions for the interval to clear the threshold.

    Interval half-width shrinks like 1/sqrt(n), so with the point unchanged the
    sample has to grow by (current half-width / needed half-width)^2.
    """
    point, lo, hi = ir.get("point"), ir.get("ci_lower"), ir.get("ci_upper")
    if None in (point, lo, hi) or any(isinstance(v, float) and math.isnan(v) for v in (point, lo, hi)):
        return None
    if point < threshold:
        have, need = hi - point, threshold - point
    else:
        have, need = point - lo, point - threshold
    if need <= 0.005 or have <= 0:
        return None
    factor = round((have / need) ** 2, 6)
    if factor <= 1:
        return None
    return int(math.ceil(n * (factor - 1) / 100.0) * 100)


def build_action_plan(result: dict[str, Any]) -> list[dict[str, Any]]:
    """Ordered next steps with the evidence each rests on.

    Priority: ``now`` (a disparity or breach to investigate), ``next`` (the
    evidence is not decisive yet), ``record`` (documentation the frameworks
    expect). Owners are roles, not people.
    """
    thr = result["threshold"]
    plan: list[dict[str, Any]] = []
    links = {lk["attribute"]: lk for lk in (result.get("change_points") or {}).get("links", [])}

    by_change: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    for lk in links.values():
        by_change.setdefault((lk["column"], lk["from"], lk["to"]), []).append(lk)
    for (column, frm, to), group in by_change.items():
        attrs = " and ".join(lk["attribute"] for lk in group)
        ratios = "; ".join(
            f"{lk['attribute']} {lk['impact_ratio_before']:.2f} on {frm} versus {lk['impact_ratio_after']:.2f} on {to}"
            for lk in group if lk["impact_ratio_before"] is not None and lk["impact_ratio_after"] is not None
        )
        lead = (
            f"The {attrs} drift starts in {group[0]['onset']}, when {column} changed from {frm} to {to}."
            + (f" Impact ratio: {ratios}." if ratios else "")
            + " A coincidence in time, not proof of cause, but the first place to look."
        )
        if group[0]["version_like"]:
            title = f"Review the {column} change to {to}"
            detail = lead + f" Compare the features and thresholds of {frm} and {to}, then decide whether to roll back or fix forward."
        else:
            title = f"Find out why {attrs} drifted from {group[0]['onset']}"
            detail = lead
        plan.append({"priority": "now", "owner": "Model owner", "title": title, "detail": detail,
                     "evidence": ",".join(f"drift:{lk['attribute']}" for lk in group)})

    drift = result.get("drift") or {}
    for alert in drift.get("alerts", []):
        if alert["level"] == "breach" and alert["attribute"] not in links:
            plan.append({
                "priority": "now",
                "owner": "Model owner",
                "title": f"Find what changed for {alert['attribute']}",
                "detail": alert["message"] + " No version or policy column switched at that time; check releases, data sources and applicant mix for that period.",
                "evidence": f"drift:{alert['attribute']}",
            })

    worst = sorted(
        ((name, b) for name, b in result["intersections"].items() if b["verdict"]["status"] == "disparity"),
        key=lambda nb: nb[1]["gaps"]["disparate_impact_ratio"]["point"],
    )
    if worst:  # the most severe one is enough here; the rest are in the findings
        name, block = worst[0]
        ir = block["gaps"]["disparate_impact_ratio"]
        reliable = {g: d for g, d in block["groups"].items() if d.get("reliable") and d.get("selection_rate") is not None}
        who = f" ({min(reliable, key=lambda g: reliable[g]['selection_rate'])} is selected least)" if reliable else ""
        plan.append({
            "priority": "now",
            "owner": "Model owner",
            "title": f"Investigate {name}",
            "detail": (
                f"This intersection has an impact ratio of {ir['point']:.2f} (95% CI {ir['ci_lower']:.2f}-{ir['ci_upper']:.2f}){who}, "
                "entirely below the threshold, even where each attribute alone looks closer to it. "
                "Check which inputs act as proxies for this combination of groups."
            ),
            "evidence": f"intersection:{name}",
        })

    for attr, block in result["attributes"].items():
        v = block["verdict"]["status"]
        ir = block["gaps"]["disparate_impact_ratio"]
        if v == "disparity":
            plan.append({
                "priority": "now",
                "owner": "Model owner",
                "title": f"Investigate the {attr} gap",
                "detail": block["verdict"]["reason"] + " Review the features most correlated with this attribute and the decision threshold.",
                "evidence": f"attribute:{attr}",
            })
        elif v == "inconclusive":
            extra = _more_data(ir, block["n_rows"], thr)
            if attr in links:
                lk = links[attr]
                more = (f"The pooled figure mixes {lk['from']} and {lk['to']}; judge {lk['to']} on its own "
                        f"(impact ratio {lk['impact_ratio_after']:.2f}) rather than waiting for more data.")
            elif extra and extra <= 10 * block["n_rows"]:
                more = f"Roughly {extra:,} more decisions at today's rates would settle it."
            else:
                more = ("The estimate sits almost on the threshold, so more data alone is unlikely to settle it; "
                        "look at the drift and intersections instead.")
            plan.append({
                "priority": "next",
                "owner": "Compliance",
                "title": f"Settle the {attr} verdict",
                "detail": f"{block['verdict']['reason']} {more} Until then, report it as inconclusive, not as fair.",
                "evidence": f"attribute:{attr}",
            })

    small = [(attr, g) for attr, b in result["attributes"].items() for g in b.get("small_groups", [])]
    if small:
        names = ", ".join(f"{g['group']} ({attr}, n={g['count']})" for attr, g in small[:4])
        plan.append({
            "priority": "next",
            "owner": "Compliance",
            "title": "Do not rank the small groups",
            "detail": f"{names}: below {result['config']['min_group_size']} decisions. Report their counts, not their rates, or pool periods until they are large enough.",
            "evidence": "small_groups",
        })

    if result.get("outcome") is None:
        plan.append({
            "priority": "next",
            "owner": "Data",
            "title": "Add an outcome column",
            "detail": "Without a later outcome (repaid, hired and retained, claim valid) error-rate gaps cannot be measured; this audit covers selection only.",
            "evidence": "mapping:outcome_col",
        })

    unknown = sum(b.get("unknown_count", 0) for b in result["attributes"].values())
    if unknown:
        plan.append({
            "priority": "record",
            "owner": "Compliance",
            "title": "Record the unknown-category counts",
            "detail": f"{unknown:,} decisions had no category for at least one attribute. They are excluded from the ratios; NYC LL144 (6 RCNY 5-301(b)(5)) requires the count to be published.",
            "evidence": "ll144:unknown",
        })

    plan.append({
        "priority": "record",
        "owner": "Independent reviewer",
        "title": "Sign off the report",
        "detail": "Download the report, check the input SHA-256 against your file, and complete the sign-off block. Under LL144 the auditor must be independent of the employer and the vendor.",
        "evidence": "report:sign-off",
    })
    order = {"now": 0, "next": 1, "record": 2}
    plan.sort(key=lambda a: order[a["priority"]])
    return plan
