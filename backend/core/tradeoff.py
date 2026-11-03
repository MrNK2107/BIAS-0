"""Mitigation trade-off from a decision log: accuracy versus disparity.

When the log has the model's score and a ground-truth outcome, BIAS-0 can show
what post-processing (group-specific thresholds) would buy and cost, without
the model.

Method (one protected attribute at a time):

1. Split the rows 50/50 at random (seeded), stratified by group: thresholds
   are fitted on the *fit* half and every number is measured on the *holdout*
   half, so the curve is not flattered by fitting and scoring on the same rows.
2. Baseline (strength 0): one global threshold that reproduces the observed
   overall selection rate.
3. Strength ``s`` in [0, 1]: each group's target selection rate moves from its
   baseline rate towards the overall rate, ``(1 - s) * r_g + s * r``. Its
   threshold is the matching quantile of that group's scores. At ``s = 1``
   every group is selected at the same rate (demographic parity), and the
   overall selection rate stays about the same throughout.
4. For each strength: holdout accuracy against the outcome, the minimum impact
   ratio over reliable groups, the equal-opportunity (TPR) gap and the overall
   selection rate.

The "smallest sufficient" point is the lowest strength whose holdout impact
ratio reaches the threshold; its accuracy cost is reported against strength 0.

Caveat, stated in every response: group-specific thresholds use the protected
attribute at decision time. That is disparate treatment and unlawful in many
settings (for example US credit and employment law). The curve shows the size
of the trade-off, which helps decide whether to fix the features or the model
instead; it is not a recommendation to deploy group thresholds.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .compliance import _is_unknown
from .data import group_labels

DEFAULT_STRENGTHS = tuple(round(x, 2) for x in np.linspace(0, 1, 11))
CAVEAT = (
    "Group-specific thresholds use the protected attribute at decision time (disparate treatment), "
    "which is unlawful in many jurisdictions. Use this curve to size the trade-off and to decide whether to "
    "change features or the model, not as a deployment recipe."
)


class TradeoffInputError(ValueError):
    pass


def _split(groups: np.ndarray, seed: int) -> np.ndarray:
    """Boolean mask of the fit half, stratified by group."""
    rng = np.random.default_rng(seed)
    fit = np.zeros(groups.size, dtype=bool)
    for g in np.unique(groups):
        idx = np.flatnonzero(groups == g)
        rng.shuffle(idx)
        fit[idx[: (idx.size + 1) // 2]] = True
    return fit


def _metrics(sel: np.ndarray, y: np.ndarray, groups: np.ndarray, reliable: set[str]) -> dict[str, Any]:
    rates, tprs = {}, {}
    for g in reliable:
        m = groups == g
        if not m.any():
            continue
        rates[g] = float(sel[m].mean())
        pos = m & (y == 1)
        if pos.sum() > 0:
            tprs[g] = float(sel[pos].mean())
    top = max(rates.values()) if rates else 0.0
    ir = (min(rates.values()) / top) if rates and top > 0 else None
    return {
        "accuracy": round(float((sel == y).mean()), 4),
        "selection_rate": round(float(sel.mean()), 4),
        "impact_ratio": None if ir is None else round(ir, 4),
        "tpr_gap": round(max(tprs.values()) - min(tprs.values()), 4) if len(tprs) >= 2 else None,
        "group_rates": {g: round(r, 4) for g, r in sorted(rates.items())},
    }


def threshold_tradeoff(
    df: pd.DataFrame,
    score_col: str,
    outcome: np.ndarray,
    group_col: str,
    *,
    threshold: float = 0.8,
    min_group_size: int = 30,
    strengths: tuple[float, ...] = DEFAULT_STRENGTHS,
    seed: int = 42,
    baseline_rate: float | None = None,
) -> dict[str, Any]:
    """Accuracy/disparity curve for group-specific thresholds on one attribute."""
    if score_col not in df.columns or group_col not in df.columns:
        raise TradeoffInputError("The score and group columns must be in the file.")
    scores = pd.to_numeric(df[score_col], errors="coerce").to_numpy(float)
    labels = group_labels(df[group_col].reset_index(drop=True))
    known = ~labels.map(_is_unknown).to_numpy()
    ok = known & ~np.isnan(scores) & ~np.isnan(outcome)
    if ok.sum() < 4 * min_group_size:
        raise TradeoffInputError(
            f"Too few rows with a score, an outcome and a known '{group_col}' ({int(ok.sum())})."
        )
    s, y, g = scores[ok], outcome[ok].astype(int), labels.to_numpy()[ok].astype(str)
    fit = _split(g, seed)
    hold = ~fit
    counts = pd.Series(g[hold]).value_counts()
    reliable = {str(k) for k, n in counts.items() if n >= min_group_size}
    if len(reliable) < 2:
        raise TradeoffInputError(
            f"Fewer than two '{group_col}' groups have {min_group_size}+ rows in the holdout half."
        )

    # Baseline: one global threshold that reproduces the observed overall
    # selection rate (the decisions' rate when given, else the outcome base rate).
    overall_rate = float(baseline_rate) if baseline_rate is not None else float(y.mean())
    overall_rate = min(max(overall_rate, 0.01), 0.99)
    return_points = []
    t0 = float(np.quantile(s[fit], 1 - overall_rate))
    base_rates = {grp: float((s[fit & (g == grp)] >= t0).mean()) for grp in np.unique(g)}
    for strength in strengths:
        thresholds = {}
        for grp, r_g in base_rates.items():
            target = (1 - strength) * r_g + strength * overall_rate
            group_scores = s[fit & (g == grp)]
            thresholds[grp] = float(np.quantile(group_scores, 1 - target)) if 0 < target < 1 else (
                -np.inf if target >= 1 else np.inf
            )
        sel = (s >= pd.Series(g).map(thresholds).to_numpy(float)).astype(int)
        point = {"strength": float(strength), **_metrics(sel[hold], y[hold], g[hold], reliable)}
        point["thresholds"] = {k: (None if not np.isfinite(v) else round(v, 4)) for k, v in sorted(thresholds.items()) if k in reliable}
        return_points.append(point)

    base = return_points[0]
    sufficient = next(
        (p for p in return_points if p["impact_ratio"] is not None and p["impact_ratio"] >= threshold),
        None,
    )
    recommendation = None
    if sufficient is not None:
        recommendation = {
            "strength": sufficient["strength"],
            "impact_ratio": sufficient["impact_ratio"],
            "accuracy": sufficient["accuracy"],
            "accuracy_cost": round(base["accuracy"] - sufficient["accuracy"], 4),
        }
    return {
        "attribute": group_col,
        "score_col": score_col,
        "n_fit": int(fit.sum()),
        "n_holdout": int(hold.sum()),
        "seed": seed,
        "threshold": threshold,
        "baseline_selection_rate": round(overall_rate, 4),
        "reliable_groups": sorted(reliable),
        "points": return_points,
        "smallest_sufficient": recommendation,
        "caveat": CAVEAT,
        "method": (
            "Thresholds fitted on a seeded, group-stratified 50% split; accuracy, impact ratio and TPR gap "
            "measured on the other 50%. Strength moves each group's selection rate linearly from the "
            "single-threshold rate to the overall rate. Strength 0 re-thresholds the score at the observed "
            "selection rate, so it can differ from the logged decisions when rules or human overrides were involved. "
            "Each point is one holdout estimate: with small groups it is noisy, so the curve need not be monotonic."
        ),
    }
