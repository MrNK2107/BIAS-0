"""Statistical rigour for the fairness metrics.

Everything a regulator would ask about a single fairness number:

- **Confidence intervals**: a group-stratified percentile bootstrap for every gap
  (DPD, equal-opportunity gap, FPR/FNR gaps, equalized odds, disparate impact).
  Stratified means each resample keeps every group at its observed size, so a
  small group never vanishes from a resample and the gap stays defined.
- **Minimum group size**: groups smaller than ``min_group_size`` are listed in
  ``small_groups`` and marked ``reliable: False``; TPR/FNR (FPR) are also
  flagged when a group has too few actual positives (negatives).
- **Intersectional groups**: pairs of sensitive columns (e.g. sex x race) are
  analysed as one combined attribute. Their gaps are computed over the reliable
  groups only, because with many small cells the max-minus-min gap is driven by
  noise; the excluded cells are reported.
- **Calibration by group**: reliability bins, expected calibration error (ECE),
  maximum calibration error and Brier score per group, from predicted
  probabilities.

The gap definitions are the same as ``core.metrics.fairness_gaps`` (and
fairlearn's ``between_groups`` differences); tests cross-check against fairlearn.
Bootstrap size and seed are configurable (``BIAS_BOOTSTRAP_N``,
``BIAS_BOOTSTRAP_SEED``, ``BIAS_MIN_GROUP_SIZE``) and the bootstrap is O(n) per
resample (bincount), so 1000 resamples of 1000 rows take well under a second.
"""

from __future__ import annotations

import itertools
import math
import os
from typing import Any

import numpy as np
import pandas as pd

from .data import group_labels

GAP_KEYS = (
    "demographic_parity_difference",
    "equal_opportunity_difference",
    "fpr_gap",
    "fnr_gap",
    "equalized_odds_difference",
    "disparate_impact_ratio",
)

# A rate based on fewer than this many cases (e.g. TPR with 4 actual positives)
# is flagged even when the group itself is large enough.
MIN_RATE_DENOMINATOR = 10
CALIBRATION_BINS = 10
MAX_INTERSECTION_COLUMNS = 3  # pairs among the first 3 sensitive columns
# Per-group tables are capped (largest groups first) so a near-unique column such
# as a zip code does not produce a multi-megabyte response. Gaps and CIs still use
# every group; only the listing is truncated.
MAX_REPORTED_GROUPS = 50


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def default_config() -> dict[str, Any]:
    return {
        "n_boot": max(0, _env_int("BIAS_BOOTSTRAP_N", 1000)),
        "seed": _env_int("BIAS_BOOTSTRAP_SEED", 42),
        "ci_level": 0.95,
        "min_group_size": max(1, _env_int("BIAS_MIN_GROUP_SIZE", 30)),
        "min_rate_denominator": MIN_RATE_DENOMINATOR,
        "calibration_bins": CALIBRATION_BINS,
        "ci_method": "percentile bootstrap, stratified by group",
    }


# ── Encoding / counting ─────────────────────────────────────────────────────


def _encode(
    y_true: pd.Series | np.ndarray,
    y_pred: pd.Series | np.ndarray,
    group: pd.Series | np.ndarray,
    y_score: pd.Series | np.ndarray | None = None,
):
    """Positional arrays with NaN rows dropped and groups factorised (sorted)."""
    yt = pd.to_numeric(pd.Series(np.asarray(y_true)), errors="coerce").to_numpy(float)
    yp = pd.to_numeric(pd.Series(np.asarray(y_pred)), errors="coerce").to_numpy(float)
    g = group_labels(pd.Series(np.asarray(group, dtype=object))).to_numpy()
    valid = ~(np.isnan(yt) | np.isnan(yp))
    ys = None
    if y_score is not None:
        ys = pd.to_numeric(pd.Series(np.asarray(y_score)), errors="coerce").to_numpy(float)
    codes, labels = pd.factorize(g[valid], sort=True)
    return codes, [str(x) for x in labels], yt[valid], yp[valid], (
        ys[valid] if ys is not None else None
    )


def _counts(codes: np.ndarray, yt: np.ndarray, yp: np.ndarray, k: int) -> dict[str, np.ndarray]:
    def count(mask: np.ndarray) -> np.ndarray:
        return np.bincount(codes, weights=mask.astype(float), minlength=k)

    return {
        "n": np.bincount(codes, minlength=k).astype(float),
        "sel": np.bincount(codes, weights=yp, minlength=k),
        "tp": count((yt == 1) & (yp == 1)),
        "fn": count((yt == 1) & (yp == 0)),
        "fp": count((yt == 0) & (yp == 1)),
        "tn": count((yt == 0) & (yp == 0)),
    }


def _spread(values: np.ndarray) -> float:
    return float(values.max() - values.min()) if values.size else 0.0


def _gaps_from_counts(c: dict[str, np.ndarray], include: np.ndarray) -> dict[str, float]:
    """All gap metrics from per-group counts, using only groups in ``include``."""
    present = include & (c["n"] > 0)
    pos = present & (c["tp"] + c["fn"] > 0)
    neg = present & (c["fp"] + c["tn"] > 0)
    with np.errstate(divide="ignore", invalid="ignore"):
        sel = c["sel"][present] / c["n"][present]
        tpr = c["tp"][pos] / (c["tp"][pos] + c["fn"][pos])
        fnr = c["fn"][pos] / (c["tp"][pos] + c["fn"][pos])
        fpr = c["fp"][neg] / (c["fp"][neg] + c["tn"][neg])
    eod = _spread(tpr)
    fpr_gap = _spread(fpr)
    di = 1.0
    if sel.size and sel.max() > 0:
        di = float(sel.min() / sel.max())
    return {
        "demographic_parity_difference": _spread(sel),
        "equal_opportunity_difference": eod,
        "fpr_gap": fpr_gap,
        "fnr_gap": _spread(fnr),
        "equalized_odds_difference": max(eod, fpr_gap),
        "disparate_impact_ratio": di,
    }


# ── Bootstrap ───────────────────────────────────────────────────────────────


def _stratified_bootstrap(
    codes: np.ndarray,
    yt: np.ndarray,
    yp: np.ndarray,
    k: int,
    include: np.ndarray,
    n_boot: int,
    seed: int,
) -> dict[str, np.ndarray]:
    """Gap metrics on ``n_boot`` resamples; each group resampled at its own size."""
    order = np.argsort(codes, kind="stable")
    codes_s, yt_s, yp_s = codes[order], yt[order], yp[order]
    sizes = np.bincount(codes_s, minlength=k)
    starts = np.concatenate(([0], np.cumsum(sizes)[:-1]))
    row_start = starts[codes_s]
    row_size = sizes[codes_s]
    rng = np.random.default_rng(seed)
    out = {key: np.empty(n_boot) for key in GAP_KEYS}
    n = codes_s.size
    for b in range(n_boot):
        idx = row_start + np.floor(rng.random(n) * row_size).astype(np.int64)
        gaps = _gaps_from_counts(_counts(codes_s, yt_s[idx], yp_s[idx], k), include)
        for key in GAP_KEYS:
            out[key][b] = gaps[key]
    return out


def _ci(point: float, samples: np.ndarray | None, ci_level: float) -> dict[str, Any]:
    if samples is None or samples.size == 0:
        return {"point": round(point, 4), "ci_lower": None, "ci_upper": None, "se": None}
    alpha = (1.0 - ci_level) / 2.0
    lo, hi = np.quantile(samples, [alpha, 1.0 - alpha])
    return {
        "point": round(point, 4),
        "ci_lower": round(float(lo), 4),
        "ci_upper": round(float(hi), 4),
        "se": round(float(np.std(samples, ddof=1)) if samples.size > 1 else 0.0, 4),
    }


def wilson_interval(successes: float, n: float, ci_level: float = 0.95) -> tuple[float, float]:
    """Wilson score interval for a binomial proportion (well-behaved for small n)."""
    if n <= 0:
        return (0.0, 1.0)
    from scipy.stats import norm

    z = float(norm.ppf(1 - (1 - ci_level) / 2))
    p = successes / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, centre - half), min(1.0, centre + half))


def bootstrap_gap_cis(
    y_true,
    y_pred,
    group,
    config: dict[str, Any] | None = None,
) -> dict[str, dict[str, Any]]:
    """Gap metrics (all groups) with stratified bootstrap CIs.

    Same output shape as ``analyse_attribute(...)["gaps"]`` without the per-group
    tables or calibration, for callers that only need the intervals (stress test).
    CIs are ``None`` when fewer than two groups are present or ``n_boot`` is 0.
    """
    cfg = {**default_config(), **(config or {})}
    codes, labels, yt, yp, _ = _encode(y_true, y_pred, group)
    k = len(labels)
    include = np.ones(k, dtype=bool)
    observed = _gaps_from_counts(_counts(codes, yt, yp, k), include)
    samples = None
    if int(cfg["n_boot"]) > 0 and k >= 2:
        samples = _stratified_bootstrap(
            codes, yt, yp, k, include, int(cfg["n_boot"]), int(cfg["seed"])
        )
    return {
        key: _ci(observed[key], samples[key] if samples else None, float(cfg["ci_level"]))
        for key in GAP_KEYS
    }


# ── Calibration ─────────────────────────────────────────────────────────────


def calibration_summary(
    y_true: np.ndarray, y_score: np.ndarray, n_bins: int = CALIBRATION_BINS
) -> dict[str, Any]:
    """Reliability bins (uniform width), ECE, MCE and Brier score.

    Binning matches ``sklearn.calibration.calibration_curve(strategy="uniform")``.
    ECE = sum_b (n_b / n) * |observed_rate_b - mean_predicted_b|.
    """
    mask = ~np.isnan(y_score)
    raw = y_score[mask]
    # Scores outside [0, 1] (logits, margins) are clipped so binning works, but
    # ECE / Brier on clipped scores are not meaningful: count and warn.
    n_clipped = int(np.count_nonzero((raw < 0.0) | (raw > 1.0)))
    warning = (
        f"{n_clipped} score(s) outside [0, 1] were clipped; the scores do not look "
        f"like probabilities, so ECE and Brier are not meaningful."
        if n_clipped
        else None
    )
    yt, ys = y_true[mask], np.clip(raw, 0.0, 1.0)
    n = yt.size
    if n == 0:
        return {
            "n": 0, "ece": None, "mce": None, "brier": None, "bins": [],
            "n_clipped": 0, "warning": None,
        }
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    ids = np.searchsorted(edges[1:-1], ys)
    bin_n = np.bincount(ids, minlength=n_bins)
    bin_pred = np.bincount(ids, weights=ys, minlength=n_bins)
    bin_true = np.bincount(ids, weights=yt, minlength=n_bins)
    nz = bin_n > 0
    mean_pred = bin_pred[nz] / bin_n[nz]
    obs = bin_true[nz] / bin_n[nz]
    err = np.abs(obs - mean_pred)
    bins = [
        {
            "lower": round(float(edges[i]), 2),
            "upper": round(float(edges[i + 1]), 2),
            "count": int(bin_n[i]),
            "mean_predicted": round(float(mp), 4),
            "observed_rate": round(float(o), 4),
        }
        for i, mp, o in zip(np.flatnonzero(nz), mean_pred, obs)
    ]
    return {
        "n": int(n),
        "ece": round(float(np.sum(err * bin_n[nz]) / n), 4),
        "mce": round(float(err.max()), 4),
        "brier": round(float(np.mean((ys - yt) ** 2)), 4),
        "bins": bins,
        "n_clipped": n_clipped,
        "warning": warning,
    }


# ── Group analysis ──────────────────────────────────────────────────────────


def analyse_attribute(
    y_true,
    y_pred,
    group,
    y_score=None,
    *,
    reliable_only: bool = False,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Per-group table, gaps with bootstrap CIs, small-group warnings and calibration.

    ``reliable_only``: compute the gaps over groups with n >= min_group_size
    (used for intersectional cells). Otherwise all groups count, which keeps the
    headline gaps identical to ``fairness_gaps``.
    """
    cfg = {**default_config(), **(config or {})}
    min_n = int(cfg["min_group_size"])
    min_rate = int(cfg["min_rate_denominator"])
    ci_level = float(cfg["ci_level"])
    n_boot = int(cfg["n_boot"])

    codes, labels, yt, yp, ys = _encode(y_true, y_pred, group, y_score)
    k = len(labels)
    c = _counts(codes, yt, yp, k)
    reliable = c["n"] >= min_n
    include = reliable if reliable_only else np.ones(k, dtype=bool)

    groups: dict[str, dict[str, Any]] = {}
    small_groups: list[dict[str, Any]] = [
        {"group": labels[i], "count": int(c["n"][i])}
        for i in np.flatnonzero(~reliable)
    ]
    small_groups.sort(key=lambda s: (s["count"], s["group"]))
    # largest groups first, ties by label, capped
    shown = sorted(range(k), key=lambda i: (-c["n"][i], labels[i]))[:MAX_REPORTED_GROUPS]
    for i in sorted(shown):
        label = labels[i]
        n = c["n"][i]
        pos = c["tp"][i] + c["fn"][i]
        neg = c["fp"][i] + c["tn"][i]
        lo, hi = wilson_interval(c["sel"][i], n, ci_level)
        warnings: list[str] = []
        if n < min_n:
            warnings.append(
                f"Only {int(n)} rows (minimum {min_n}): all metrics for this group are unreliable."
            )
        if 0 < pos < min_rate:
            warnings.append(f"Only {int(pos)} actual positives: TPR/FNR are unreliable.")
        if 0 < neg < min_rate:
            warnings.append(f"Only {int(neg)} actual negatives: FPR is unreliable.")
        groups[label] = {
            "count": int(n),
            "positives": int(pos),
            "negatives": int(neg),
            "selection_rate": round(float(c["sel"][i] / n), 4) if n else None,
            "selection_rate_ci": [round(lo, 4), round(hi, 4)],
            "tpr": round(float(c["tp"][i] / pos), 4) if pos else None,
            "fpr": round(float(c["fp"][i] / neg), 4) if neg else None,
            "fnr": round(float(c["fn"][i] / pos), 4) if pos else None,
            "reliable": bool(n >= min_n),
            "warnings": warnings,
        }

    observed = _gaps_from_counts(c, include)
    n_included = int(np.sum(include & (c["n"] > 0)))
    samples = None
    if n_boot > 0 and n_included >= 2:
        samples = _stratified_bootstrap(
            codes, yt, yp, k, include, n_boot, int(cfg["seed"])
        )
    gaps = {
        key: _ci(observed[key], samples[key] if samples else None, ci_level)
        for key in GAP_KEYS
    }

    result: dict[str, Any] = {
        "n_rows": int(codes.size),
        "n_groups": k,
        "n_reliable_groups": int(reliable.sum()),
        "gaps_scope": "reliable_groups" if reliable_only else "all_groups",
        "gaps": gaps,
        "groups": groups,
        "groups_omitted": k - len(groups),
        "n_small_groups": len(small_groups),
        "small_groups": small_groups[:MAX_REPORTED_GROUPS],
        "unreliable": bool(n_included < 2 or (not reliable_only and not reliable.all())),
    }

    if ys is not None:
        by_group = {}
        eces: list[float] = []
        shown_set = set(shown)
        for i in sorted(shown_set | set(np.flatnonzero(reliable).tolist())):
            m = codes == i
            summary = calibration_summary(yt[m], ys[m], int(cfg["calibration_bins"]))
            summary["reliable"] = bool(reliable[i])
            if reliable[i] and summary["ece"] is not None:
                eces.append(summary["ece"])
            if i in shown_set:
                by_group[labels[i]] = summary
        result["calibration"] = {
            "overall": calibration_summary(yt, ys, int(cfg["calibration_bins"])),
            "by_group": by_group,
            "ece_gap": round(max(eces) - min(eces), 4) if len(eces) >= 2 else None,
        }
    return result


def intersectional_labels(frame: pd.DataFrame, cols: list[str]) -> pd.Series:
    """'female × obc' style labels for the combination of ``cols``."""
    out = group_labels(frame[cols[0]])
    for col in cols[1:]:
        out = out + " × " + group_labels(frame[col])
    return out


def analyse_statistical_rigour(
    frame: pd.DataFrame,
    sensitive_cols: list[str],
    y_true,
    y_pred,
    y_score=None,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Rigour block for the API: per sensitive column and per pair of columns.

    ``frame`` holds the sensitive columns for the same rows (same order) as
    ``y_true`` / ``y_pred`` / ``y_score``.
    """
    cfg = {**default_config(), **(config or {})}
    cols = [c for c in sensitive_cols if c in frame.columns]
    per_attribute = {
        col: analyse_attribute(y_true, y_pred, frame[col], y_score, config=cfg)
        for col in cols
    }
    intersectional: dict[str, Any] = {}
    for a, b in itertools.combinations(cols[:MAX_INTERSECTION_COLUMNS], 2):
        key = f"{a} × {b}"
        res = analyse_attribute(
            y_true,
            y_pred,
            intersectional_labels(frame, [a, b]),
            y_score,
            reliable_only=True,
            config=cfg,
        )
        res["columns"] = [a, b]
        intersectional[key] = res

    warnings: list[str] = []
    for name, res in {**per_attribute, **intersectional}.items():
        if res["small_groups"]:
            shown = ", ".join(f"{s['group']} (n={s['count']})" for s in res["small_groups"][:5])
            more = res["n_small_groups"] - 5
            warnings.append(
                f"{name}: {res['n_small_groups']} group(s) below {cfg['min_group_size']} rows"
                f" - {shown}{f' and {more} more' if more > 0 else ''}."
            )
    if y_score is not None:
        ys_all = np.asarray(y_score, dtype=float)
        clipped = int(np.count_nonzero((ys_all < 0.0) | (ys_all > 1.0)))
        if clipped:
            warnings.append(
                f"Calibration: {clipped} of {ys_all.size} score(s) were outside [0, 1] and "
                f"were clipped; the model's scores do not look like probabilities, so "
                f"ECE and Brier are not meaningful."
            )
    return {
        "config": cfg,
        "per_attribute": per_attribute,
        "intersectional": intersectional,
        "warnings": warnings,
    }
