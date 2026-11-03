"""Outcome audit (Mode A): fairness evidence from a decision log.

The input is what a lender or employer already has: one row per decision with
the decision itself and the group columns, plus an optional ground-truth
outcome, model score and timestamp. No model is trained and no model access is
needed, so the numbers describe the system that actually made the decisions.

What comes out:

- **Per attribute.** Selection rate per group with a Wilson CI, the NYC LL144
  impact-ratio table (unknown categories excluded and counted), and
  demographic-parity / impact-ratio gaps with a stratified bootstrap CI. The
  gaps are computed over *reliable* groups (n >= ``min_group_size``) so one
  tiny group cannot drive the headline; small groups stay visible, flagged.
- **Error rates** (when an outcome column is given): equal-opportunity and FPR
  gaps on rows with a known outcome, with coverage and a selective-labels
  warning.
- **Intersectional cells** for pairs of attributes, with the same guards.
- **A verdict per attribute** from the CI, not the point estimate:
  ``disparity`` (CI upper bound of the impact ratio below the materiality
  threshold), ``no_material_disparity`` (CI lower bound at or above it) or
  ``inconclusive`` (CI spans it, or fewer than two reliable groups). The
  threshold defaults to 0.8, the EEOC four-fifths heuristic; it is a
  materiality convention, not a legal pass mark (LL144 has none).
- **An A-E grade** with a published rule (``GRADE_RULES``) that is capped when
  the evidence is inconclusive.
- **Fairness drift** (when a time column is given): see ``fairness_drift``.

All bootstraps are seeded, so the same file and settings give the same report.
"""

from __future__ import annotations

import itertools
import math
from typing import Any

import numpy as np
import pandas as pd

from .action_plan import build_action_plan, detect_changes, link_changes
from .compliance import _is_unknown, impact_ratios, ll144_rates
from .data import (
    describe_target_binarisation,
    group_labels,
    normalize_target_binary,
    resolve_target_positive,
)
from .rigour import analyse_attribute, default_config, intersectional_labels

AUDIT_SCHEMA_VERSION = "1.0.0"
DEFAULT_THRESHOLD = 0.8
MAX_GROUP_COLUMNS = 8
MAX_INTERSECTION_COLUMNS = 4  # pairs among the first 4 group columns
MAX_PERIODS = 60
DRIFT_BOOT = 400  # per period and attribute; enough for a 95% band, keeps it fast

VERDICT_LABELS = {
    "disparity": "Disparity evidenced",
    "no_material_disparity": "No material disparity",
    "inconclusive": "Inconclusive",
}

GRADE_RULES = [
    {"grade": "A", "rule": "Every attribute: no material disparity, and every impact-ratio CI lower bound is at least 0.90."},
    {"grade": "B", "rule": "Every attribute: no material disparity (CI lower bound at least the threshold)."},
    {"grade": "C", "rule": "No disparity evidenced, but at least one attribute is inconclusive. Capped at C: the data cannot rule a disparity out."},
    {"grade": "D", "rule": "Disparity evidenced; the worst impact ratio is at least 0.65."},
    {"grade": "E", "rule": "Disparity evidenced; the worst impact ratio is below 0.65."},
]

SELECTION_GAPS = ("demographic_parity_difference", "disparate_impact_ratio")
ERROR_GAPS = ("equal_opportunity_difference", "fpr_gap", "fnr_gap", "equalized_odds_difference")


class AuditInputError(ValueError):
    """The decision log or the column mapping cannot be audited."""


# ── Inputs ──────────────────────────────────────────────────────────────────


def binarise(df: pd.DataFrame, col: str, positive: Any = None) -> tuple[np.ndarray, dict[str, Any]]:
    """0/1 (NaN for missing) from a decision/outcome column, plus how it was read."""
    if col not in df.columns:
        raise AuditInputError(f"Column '{col}' is not in the file.")
    values = df[col]
    known = values.dropna()
    if known.empty:
        raise AuditInputError(f"Column '{col}' has no values.")
    no_choice = positive is None or str(positive).strip() == ""
    if known.nunique() > 2 and no_choice and not pd.api.types.is_numeric_dtype(known):
        labels = ", ".join(sorted(map(str, known.unique()[:6])))
        raise AuditInputError(
            f"Column '{col}' has more than two values ({labels}...). Choose which value "
            f"counts as the favourable outcome."
        )
    tmp = pd.DataFrame({col: values.copy()})
    try:
        normalize_target_binary(tmp, col, positive)
    except ValueError as exc:
        raise AuditInputError(str(exc)) from exc
    info = {
        "column": col,
        "positive": resolve_target_positive(known, positive),
        "encoding": describe_target_binarisation(known, positive),
        "n_missing": int(values.isna().sum()),
    }
    if hasattr(info["positive"]["value"], "item"):
        info["positive"]["value"] = info["positive"]["value"].item()
    return pd.to_numeric(tmp[col], errors="coerce").to_numpy(float), info


def suggest_roles(df: pd.DataFrame) -> dict[str, Any]:
    """Guess which columns are the decision, outcome, score, time and groups."""
    names = {c: str(c).lower() for c in df.columns}

    def two_valued(c: str) -> bool:
        return df[c].dropna().nunique() == 2

    def pick(keywords: tuple[str, ...], pred) -> str | None:
        # A column named exactly like a keyword beats one that only contains it
        # ("decision" over "decision_date").
        for exact in (True, False):
            for kw in keywords:
                for c, low in names.items():
                    if (low == kw if exact else kw in low) and pred(c):
                        return c
        return None

    decision = pick(("decision", "approved", "selected", "hired", "outcome", "status", "shortlist"), two_valued)
    outcome = pick(("repaid", "default", "actual", "ground_truth", "label", "performance", "retained", "outcome"), lambda c: two_valued(c) and c != decision)
    score = pick(("score", "prob", "risk"), lambda c: pd.api.types.is_float_dtype(df[c]) and c not in (decision, outcome))
    time_col = None
    for c, low in names.items():
        if any(k in low for k in ("date", "time", "month", "period", "created")):
            parsed = pd.to_datetime(df[c].head(200), errors="coerce", format="mixed")
            if parsed.notna().mean() > 0.9:
                time_col = c
                break
    sensitive_kw = ("gender", "sex", "caste", "religion", "race", "ethnic", "region", "age", "disab", "language", "marital", "tribe", "community")
    groups = [
        c for c, low in names.items()
        if any(k in low for k in sensitive_kw)
        and c not in (decision, outcome, score, time_col)
        and 2 <= df[c].dropna().nunique() <= 50
    ][:MAX_GROUP_COLUMNS]
    columns = [
        {
            "name": str(c),
            "dtype": str(df[c].dtype),
            "n_unique": int(df[c].nunique(dropna=True)),
            "n_missing": int(df[c].isna().sum()),
            "examples": [str(v) for v in df[c].dropna().unique()[:4]],
        }
        for c in df.columns
    ]
    return {
        "n_rows": len(df),
        "columns": columns,
        "suggested": {
            "decision_col": decision,
            "outcome_col": outcome,
            "score_col": score,
            "time_col": time_col,
            "group_cols": groups,
        },
    }


# ── Verdicts ────────────────────────────────────────────────────────────────


def attribute_verdict(gaps: dict[str, Any], n_reliable: int, threshold: float, min_n: int) -> dict[str, Any]:
    """Three-way call from the impact-ratio CI over reliable groups."""
    di = gaps["disparate_impact_ratio"]
    lo, hi, point = di.get("ci_lower"), di.get("ci_upper"), di.get("point")
    if n_reliable < 2 or lo is None or hi is None:
        return {
            "status": "inconclusive",
            "reason": f"Fewer than two groups have at least {min_n} decisions, so no comparison is reliable.",
        }
    span = f"impact ratio {point:.2f} (95% CI {lo:.2f}-{hi:.2f})"
    if hi < threshold:
        return {"status": "disparity", "reason": f"The whole interval is below {threshold:.2f}: {span}."}
    if lo >= threshold:
        return {"status": "no_material_disparity", "reason": f"The whole interval is at or above {threshold:.2f}: {span}."}
    return {
        "status": "inconclusive",
        "reason": f"The interval crosses {threshold:.2f}: {span}. More data is needed to decide.",
    }


def grade(verdicts: list[dict[str, Any]], threshold: float) -> dict[str, Any]:
    """A-E grade from single-attribute verdicts (see ``GRADE_RULES``)."""
    statuses = [v["status"] for v in verdicts]
    points = [v["impact_ratio"]["point"] for v in verdicts if v["impact_ratio"]["point"] is not None]
    lows = [v["impact_ratio"]["ci_lower"] for v in verdicts]
    if not verdicts:
        letter = "C"
    elif "disparity" in statuses:
        worst = min(
            v["impact_ratio"]["point"] for v in verdicts
            if v["status"] == "disparity" and v["impact_ratio"]["point"] is not None
        )
        letter = "D" if worst >= 0.65 else "E"
    elif "inconclusive" in statuses:
        letter = "C"
    elif all(lo is not None and lo >= 0.9 for lo in lows):
        letter = "A"
    else:
        letter = "B"
    rule = next(r["rule"] for r in GRADE_RULES if r["grade"] == letter)
    return {
        "grade": letter,
        "rule": rule.replace("the threshold", f"{threshold:.2f}"),
        "worst_impact_ratio": min(points) if points else None,
    }


# ── Core analysis ───────────────────────────────────────────────────────────


def _strip_error_metrics(groups: dict[str, Any]) -> dict[str, Any]:
    out = {}
    for label, g in groups.items():
        out[label] = {
            "count": g["count"],
            "selection_rate": g["selection_rate"],
            "selection_rate_ci": g["selection_rate_ci"],
            "reliable": g["reliable"],
            "warnings": [w for w in g["warnings"] if "TPR" not in w and "FPR" not in w],
        }
    return out


def _selection_block(decision: np.ndarray, labels: pd.Series, cfg: dict[str, Any]) -> dict[str, Any]:
    """Selection-rate analysis for one attribute (known categories only)."""
    known = ~labels.map(_is_unknown).to_numpy() & ~np.isnan(decision)
    res = analyse_attribute(
        decision[known], decision[known], labels[known].to_numpy(),
        reliable_only=True, config=cfg,
    )
    return {
        "n_rows": res["n_rows"],
        "n_groups": res["n_groups"],
        "n_reliable_groups": res["n_reliable_groups"],
        "gaps": {k: res["gaps"][k] for k in SELECTION_GAPS},
        "groups": _strip_error_metrics(res["groups"]),
        "groups_omitted": res["groups_omitted"],
        "small_groups": res["small_groups"],
        "n_small_groups": res["n_small_groups"],
    }


def _error_block(decision: np.ndarray, outcome: np.ndarray, labels: pd.Series, cfg: dict[str, Any]) -> dict[str, Any]:
    known = ~labels.map(_is_unknown).to_numpy() & ~np.isnan(decision) & ~np.isnan(outcome)
    res = analyse_attribute(
        outcome[known], decision[known], labels[known].to_numpy(),
        reliable_only=True, config=cfg,
    )
    return {
        "n_rows": res["n_rows"],
        "gaps": {k: res["gaps"][k] for k in ERROR_GAPS},
        "groups": {
            label: {k: g[k] for k in ("count", "positives", "negatives", "tpr", "fpr", "fnr", "reliable", "warnings")}
            for label, g in res["groups"].items()
        },
    }


def _ll144_table(frame: pd.DataFrame, values: np.ndarray, rate_type: str, selection: dict[str, Any]) -> dict[str, Any]:
    ok = ~np.isnan(values)
    rates = ll144_rates(frame[ok].reset_index(drop=True), pd.Series(values[ok]), rate_type)
    table = impact_ratios(rates["rates"], rates["counts"])
    for attr, block in table.items():
        groups = selection.get(attr, {}).get("groups", {})
        for row in block["categories"]:
            g = groups.get(row["category"])
            if g:
                row["rate_ci"] = g["selection_rate_ci"] if rate_type == "selection" else None
                row["reliable"] = g["reliable"]
    return {"rate_type": rate_type, "attributes": table}


def run_outcome_audit(
    df: pd.DataFrame,
    decision_col: str,
    group_cols: list[str],
    *,
    outcome_col: str | None = None,
    score_col: str | None = None,
    time_col: str | None = None,
    positive_decision: Any = None,
    positive_outcome: Any = None,
    period: str = "auto",
    threshold: float = DEFAULT_THRESHOLD,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Full outcome audit of a decision log. See the module docstring."""
    cfg = {**default_config(), **(config or {})}
    min_n = int(cfg["min_group_size"])
    group_cols = [c for c in dict.fromkeys(group_cols) if c]
    if not group_cols:
        raise AuditInputError("Choose at least one group column (for example gender or caste).")
    if len(group_cols) > MAX_GROUP_COLUMNS:
        raise AuditInputError(f"At most {MAX_GROUP_COLUMNS} group columns per audit.")
    missing = [c for c in [decision_col, *group_cols, outcome_col, score_col, time_col] if c and c not in df.columns]
    if missing:
        raise AuditInputError(f"Not in the file: {', '.join(map(str, missing))}.")
    if decision_col in group_cols:
        raise AuditInputError("The decision column cannot also be a group column.")
    if not 0.5 <= threshold <= 1.0:
        raise AuditInputError("The materiality threshold must be between 0.5 and 1.0.")

    df = df.reset_index(drop=True)
    decision, decision_info = binarise(df, decision_col, positive_decision)
    outcome = outcome_info = None
    if outcome_col:
        outcome, outcome_info = binarise(df, outcome_col, positive_outcome)
    labels = pd.DataFrame({c: group_labels(df[c]) for c in group_cols})

    warnings: list[str] = []
    for info in (decision_info, outcome_info):
        if info and info["encoding"].get("method") == "median_threshold":
            warnings.append(
                f"'{info['column']}' has more than two numeric values and was split at its median "
                f"({info['encoding'].get('note') or 'above the median = 1'}). Map a 0/1 decision column if one exists."
            )
    attributes: dict[str, Any] = {}
    verdicts: list[dict[str, Any]] = []
    for col in group_cols:
        block = _selection_block(decision, labels[col], cfg)
        unknown = int(labels[col].map(_is_unknown).sum())
        block["unknown_count"] = unknown
        v = attribute_verdict(block["gaps"], block["n_reliable_groups"], threshold, min_n)
        block["verdict"] = {**v, "label": VERDICT_LABELS[v["status"]]}
        if outcome is not None:
            block["error_rates"] = _error_block(decision, outcome, labels[col], cfg)
        attributes[col] = block
        verdicts.append({"attribute": col, "status": v["status"], "impact_ratio": block["gaps"]["disparate_impact_ratio"]})
        if block["n_small_groups"]:
            names = ", ".join(f"{s['group']} (n={s['count']})" for s in block["small_groups"][:4])
            warnings.append(
                f"{col}: {block['n_small_groups']} group(s) below {min_n} decisions ({names}). "
                f"They are shown with wide intervals but are not used for the gap or the verdict."
            )
        if unknown:
            warnings.append(
                f"{col}: {unknown} decision(s) with an unknown category are excluded from the "
                f"rates and impact ratios, and counted (6 RCNY 5-301(b)(5))."
            )

    intersections: dict[str, Any] = {}
    for a, b in itertools.combinations(group_cols[:MAX_INTERSECTION_COLUMNS], 2):
        combo = intersectional_labels(df, [a, b])
        unknown_mask = labels[a].map(_is_unknown) | labels[b].map(_is_unknown)
        combo = combo.where(~unknown_mask, "(missing)")
        block = _selection_block(decision, combo, cfg)
        v = attribute_verdict(block["gaps"], block["n_reliable_groups"], threshold, min_n)
        block["verdict"] = {**v, "label": VERDICT_LABELS[v["status"]]}
        block["columns"] = [a, b]
        block["unknown_count"] = int(unknown_mask.sum())
        intersections[f"{a} × {b}"] = block

    ll144 = {"selection": _ll144_table(labels, decision, "selection", attributes)}
    if score_col:
        scores = pd.to_numeric(df[score_col], errors="coerce").to_numpy(float)
        if np.isnan(scores).all():
            warnings.append(f"Score column '{score_col}' has no numeric values; scoring rates skipped.")
        else:
            ll144["scoring"] = _ll144_table(labels, scores, "scoring", attributes)

    if outcome is not None:
        coverage = float(np.mean(~np.isnan(outcome)))
        if coverage < 1.0:
            warnings.append(
                f"Outcomes are known for {coverage:.0%} of decisions. Error-rate gaps describe only those "
                f"rows; if outcomes are observed only for approved cases (selective labels), error rates are biased."
            )
    else:
        coverage = None

    # Intersections can only escalate (an inconclusive cell does not downgrade).
    for name, block in intersections.items():
        if block["verdict"]["status"] == "disparity":
            verdicts.append({"attribute": name, "status": "disparity", "impact_ratio": block["gaps"]["disparate_impact_ratio"]})
    statuses = [v["status"] for v in verdicts]
    overall_status = "no_material_disparity"
    if "disparity" in statuses:
        overall_status = "disparity"
    elif "inconclusive" in statuses:
        overall_status = "inconclusive"

    drift = None
    if time_col:
        drift = fairness_drift(df, decision, labels, time_col, period=period, threshold=threshold, config=cfg)
        warnings.extend(drift.pop("warnings", []))

    change_points = None
    if drift is not None:
        exclude = [c for c in (decision_col, outcome_col, score_col, *group_cols) if c]
        changes = detect_changes(df, time_col, drift["period"], exclude)
        change_points = {
            "changes": changes,
            "links": link_changes(df, decision, labels, drift, changes, min_n),
            "note": "A switch is a column whose dominant value (at least 80% of a period's rows) changes between periods. A link is a coincidence in time, not proof of cause.",
        }

    result = {
        "schema": f"bias0.outcome-audit@{AUDIT_SCHEMA_VERSION}",
        "mode": "outcome_audit",
        "n_rows": len(df),
        "n_decisions": int(np.sum(~np.isnan(decision))),
        "overall_selection_rate": round(float(np.nanmean(decision)), 4),
        "mapping": {
            "decision_col": decision_col,
            "group_cols": group_cols,
            "outcome_col": outcome_col,
            "score_col": score_col,
            "time_col": time_col,
        },
        "decision": decision_info,
        "outcome": outcome_info,
        "outcome_coverage": None if coverage is None else round(coverage, 4),
        "threshold": threshold,
        "config": cfg,
        "attributes": attributes,
        "intersections": intersections,
        "ll144": ll144,
        "drift": drift,
        "change_points": change_points,
        "warnings": warnings,
    }
    result["verdict"] = {
        "status": overall_status,
        "label": VERDICT_LABELS[overall_status],
        **grade(verdicts, threshold),
        "grade_rules": GRADE_RULES,
    }
    result["findings"] = build_findings(result)
    result["action_plan"] = build_action_plan(result)
    attach_frameworks(result)
    return result


# ── Drift ───────────────────────────────────────────────────────────────────


def _choose_period(dates: pd.Series, period: str) -> str:
    if period in ("W", "M", "Q"):
        return period
    span_days = (dates.max() - dates.min()).days if len(dates) else 0
    if span_days <= 120:
        return "W"
    if span_days <= 3 * 365:
        return "M"
    return "Q"


def _trend(points: list[tuple[int, float, int]]) -> float | None:
    """Weighted least-squares slope of the impact ratio per period."""
    if len(points) < 3:
        return None
    x = np.array([p[0] for p in points], float)
    y = np.array([p[1] for p in points], float)
    w = np.array([p[2] for p in points], float)
    xm = np.sum(w * x) / w.sum()
    ym = np.sum(w * y) / w.sum()
    denom = np.sum(w * (x - xm) ** 2)
    if denom == 0:
        return None
    return round(float(np.sum(w * (x - xm) * (y - ym)) / denom), 4)


def fairness_drift(
    df: pd.DataFrame,
    decision: np.ndarray,
    labels: pd.DataFrame,
    time_col: str,
    *,
    period: str = "auto",
    threshold: float = DEFAULT_THRESHOLD,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Impact ratio per period and attribute, with a bootstrap band and status.

    Period status: ``breach`` (CI upper bound below the threshold), ``watch``
    (point below, CI spans it), ``ok`` or ``insufficient`` (fewer than two
    groups with ``min_group_size`` decisions in that period). An alert is
    raised when the latest period breaches, or two consecutive periods do.
    """
    cfg = {**default_config(), **(config or {})}
    cfg["n_boot"] = min(int(cfg["n_boot"]), DRIFT_BOOT)
    dates = pd.to_datetime(df[time_col], errors="coerce", format="mixed")
    warnings: list[str] = []
    bad = int(dates.isna().sum())
    if bad:
        warnings.append(f"{bad} row(s) have an unreadable '{time_col}' and are left out of the drift view.")
    valid = dates.notna().to_numpy() & ~np.isnan(decision)
    if valid.sum() == 0:
        return {"period": None, "periods": [], "series": {}, "alerts": [], "warnings": warnings + [f"'{time_col}' has no readable dates."]}
    freq = _choose_period(dates[valid], period)
    pkey = dates.dt.to_period(freq)
    periods = sorted(pkey[valid].unique())
    if len(periods) > MAX_PERIODS:
        warnings.append(f"Only the latest {MAX_PERIODS} periods are shown.")
        periods = periods[-MAX_PERIODS:]

    period_rows = []
    for p in periods:
        m = valid & (pkey == p).to_numpy()
        period_rows.append({
            "period": str(p),
            "start": p.start_time.strftime("%Y-%m-%d"),
            "n": int(m.sum()),
            "selection_rate": round(float(decision[m].mean()), 4),
        })

    series: dict[str, Any] = {}
    alerts: list[dict[str, Any]] = []
    for col in labels.columns:
        rows = []
        trend_pts = []
        for i, p in enumerate(periods):
            m = valid & (pkey == p).to_numpy() & ~labels[col].map(_is_unknown).to_numpy()
            res = analyse_attribute(
                decision[m], decision[m], labels[col][m].to_numpy(),
                reliable_only=True, config=cfg,
            )
            di = res["gaps"]["disparate_impact_ratio"]
            if res["n_reliable_groups"] < 2 or di["ci_lower"] is None:
                status = "insufficient"
            elif di["ci_upper"] < threshold:
                status = "breach"
            elif di["point"] < threshold:
                status = "watch"
            else:
                status = "ok"
            reliable_rates = {g: v["selection_rate"] for g, v in res["groups"].items() if v["reliable"]}
            lowest = min(reliable_rates, key=reliable_rates.get) if reliable_rates else None
            rows.append({
                "period": str(p),
                "n": res["n_rows"],
                "impact_ratio": di["point"] if status != "insufficient" else None,
                "ci_lower": di["ci_lower"] if status != "insufficient" else None,
                "ci_upper": di["ci_upper"] if status != "insufficient" else None,
                "lowest_group": lowest,
                "rates": reliable_rates,
                "status": status,
            })
            if status != "insufficient":
                trend_pts.append((i, di["point"], res["n_rows"]))
        statuses = [r["status"] for r in rows]
        breach_start = None
        for idx in range(len(rows) - 1):
            if rows[idx]["status"] == "breach" and rows[idx + 1]["status"] == "breach":
                breach_start = rows[idx]["period"]
                break
        latest = rows[-1] if rows else None
        if latest and latest["status"] == "breach":
            alerts.append({
                "attribute": col, "level": "breach", "period": latest["period"],
                "message": (
                    f"{col}: the latest period ({latest['period']}) breaches: impact ratio "
                    f"{latest['impact_ratio']:.2f} (95% CI {latest['ci_lower']:.2f}-{latest['ci_upper']:.2f}), "
                    f"lowest group {latest['lowest_group']}."
                ),
            })
        elif breach_start:
            alerts.append({
                "attribute": col, "level": "breach", "period": breach_start,
                "message": f"{col}: two consecutive breaching periods starting {breach_start}.",
            })
        elif latest and latest["status"] == "watch":
            alerts.append({
                "attribute": col, "level": "watch", "period": latest["period"],
                "message": f"{col}: the latest period's impact ratio is below {threshold:.2f} but its interval crosses it.",
            })
        series[col] = {
            "points": rows,
            "trend_per_period": _trend(trend_pts),
            "breach_periods": statuses.count("breach"),
            "insufficient_periods": statuses.count("insufficient"),
            "breach_start": breach_start,
        }
    return {
        "period": freq,
        "period_label": {"W": "week", "M": "month", "Q": "quarter"}[freq],
        "periods": period_rows,
        "series": series,
        "alerts": alerts,
        "threshold": threshold,
        "n_boot": int(cfg["n_boot"]),
        "warnings": warnings,
    }


# ── Plain-language findings ─────────────────────────────────────────────────


def _pct(x: float | None) -> str:
    return "n/a" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x:.0%}"


def build_findings(result: dict[str, Any]) -> list[dict[str, Any]]:
    """Ordered findings, most severe first, each with a plain-language sentence."""
    severity = {"disparity": 0, "inconclusive": 1, "no_material_disparity": 2}
    out: list[dict[str, Any]] = []
    for scope, blocks in (("attribute", result["attributes"]), ("intersection", result["intersections"])):
        for name, block in blocks.items():
            v = block["verdict"]
            if scope == "intersection" and v["status"] != "disparity":
                continue
            reliable = {g: d for g, d in block["groups"].items() if d["reliable"] and d["selection_rate"] is not None}
            text = v["reason"]
            if len(reliable) >= 2:
                lo = min(reliable, key=lambda g: reliable[g]["selection_rate"])
                hi = max(reliable, key=lambda g: reliable[g]["selection_rate"])
                text = (
                    f"{lo} applicants were selected at {_pct(reliable[lo]['selection_rate'])} versus "
                    f"{_pct(reliable[hi]['selection_rate'])} for {hi}. {v['reason']}"
                )
            out.append({
                "scope": scope,
                "name": name,
                "status": v["status"],
                "label": v["label"],
                "impact_ratio": block["gaps"]["disparate_impact_ratio"],
                "text": text,
            })
    drift = result.get("drift")
    if drift:
        for alert in drift["alerts"]:
            out.append({
                "scope": "drift",
                "name": alert["attribute"],
                "status": "disparity" if alert["level"] == "breach" else "inconclusive",
                "label": "Drift: breach" if alert["level"] == "breach" else "Drift: watch",
                "impact_ratio": None,
                "text": alert["message"],
            })
    def _ratio(f: dict[str, Any]) -> float:
        ir = f.get("impact_ratio") or {}
        point = ir.get("point")
        return math.inf if point is None or (isinstance(point, float) and math.isnan(point)) else float(point)

    # Most severe first: status, then scope, then the lower impact ratio.
    out.sort(key=lambda f: (severity[f["status"]], {"attribute": 0, "intersection": 1, "drift": 2}[f["scope"]], _ratio(f)))
    return out


def attach_frameworks(result: dict[str, Any]) -> dict[str, Any]:
    """Add the regulatory control mapping (``core.frameworks``) to a result."""
    from .frameworks import FRAMEWORKS, control_summary, map_controls

    controls = map_controls(result)
    result["frameworks"] = {
        "catalogue": FRAMEWORKS,
        "controls": controls,
        "summary": control_summary(controls),
        "disclaimer": "A reporting aid that shows which controls this audit evidences. It is not legal advice.",
    }
    return result
