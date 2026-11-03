"""Paired-probe analysis (Mode B, offline): did the tool treat matched applicants differently?

A paired test (a correspondence or audit study) sends the tool pairs of
applications that are identical except for one signal, such as a name that
reads as female or male. With a vendor API or an LLM screener this is the only
way to test for disparate *treatment* when you cannot see the model.

You run the probes; BIAS-0 analyses the results. Input: one row per probe with
a pair id, the variant (the signal), the tool's decision and optionally its
score. Output:

- the 2x2 table of pair outcomes and the flip rate (pairs decided differently),
- the selection rate of each variant and their difference with a bootstrap CI
  over pairs,
- an exact McNemar test on the discordant pairs (does one variant win flips
  more often than chance?),
- the mean paired score difference with a bootstrap CI, when scores exist,
- a three-way verdict: *differential treatment evidenced* (McNemar p < 0.05),
  *no material difference* (the rate-difference CI lies within +/- the
  materiality margin), or *inconclusive*.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd
from scipy.stats import binomtest

from .outcome_audit import AuditInputError, binarise
from .rigour import default_config

MIN_PAIRS = 30
MARGIN = 0.05  # a rate difference within +/- 5 points is treated as immaterial


def _wilson(k: int, n: int, z: float = 1.959964) -> tuple[float, float]:
    if n == 0:
        return (math.nan, math.nan)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def _p(p: float) -> str:
    return "< 0.0001" if p < 0.0001 else f"= {p:.4f}" if p < 0.01 else f"= {p:.2f}"


def paired_probe(
    df: pd.DataFrame,
    pair_col: str,
    variant_col: str,
    decision_col: str,
    *,
    score_col: str | None = None,
    positive_decision: Any = None,
    reference: str | None = None,
    margin: float = MARGIN,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    cfg = {**default_config(), **(config or {})}
    for c in (pair_col, variant_col, decision_col, score_col):
        if c and c not in df.columns:
            raise AuditInputError(f"Column '{c}' is not in the file.")
    variants = sorted(map(str, df[variant_col].dropna().unique()))
    if len(variants) != 2:
        raise AuditInputError(
            f"'{variant_col}' must have exactly two values (the two versions of each probe); found {len(variants)}."
        )
    if reference is not None and str(reference) not in variants:
        raise AuditInputError(f"Reference '{reference}' is not a value of '{variant_col}'.")
    ref = str(reference) if reference is not None else variants[0]
    other = variants[1] if ref == variants[0] else variants[0]

    decision, decision_info = binarise(df, decision_col, positive_decision)
    frame = pd.DataFrame({
        "pair": df[pair_col].astype(str),
        "variant": df[variant_col].astype(str),
        "d": decision,
        "s": pd.to_numeric(df[score_col], errors="coerce") if score_col else np.nan,
    })
    sizes = frame.groupby("pair")["variant"].agg(["size", "nunique"])
    valid = sizes.index[(sizes["size"] == 2) & (sizes["nunique"] == 2)]
    dropped = int(len(sizes) - len(valid))
    frame = frame[frame["pair"].isin(valid)].dropna(subset=["d"])
    wide = frame.pivot(index="pair", columns="variant", values="d").dropna()
    if ref not in wide.columns or other not in wide.columns:
        raise AuditInputError("No complete pairs: each pair needs one row for each variant.")
    a = wide[ref].to_numpy(int)
    b = wide[other].to_numpy(int)
    n = len(a)
    n11 = int(np.sum((a == 1) & (b == 1)))
    n10 = int(np.sum((a == 1) & (b == 0)))  # reference selected, other not
    n01 = int(np.sum((a == 0) & (b == 1)))
    n00 = int(np.sum((a == 0) & (b == 0)))
    discordant = n10 + n01
    p_value = float(binomtest(n10, discordant, 0.5).pvalue) if discordant else 1.0

    rate_ref = float(a.mean()) if n else math.nan
    rate_other = float(b.mean()) if n else math.nan
    rng = np.random.default_rng(int(cfg["seed"]))
    n_boot = int(cfg["n_boot"])
    if n and n_boot:
        idx = rng.integers(0, n, size=(n_boot, n))
        diffs = a[idx].mean(axis=1) - b[idx].mean(axis=1)
        diff_ci = (float(np.quantile(diffs, 0.025)), float(np.quantile(diffs, 0.975)))
    else:
        diff_ci = (math.nan, math.nan)

    score = None
    if score_col:
        sw = frame.pivot(index="pair", columns="variant", values="s").reindex(wide.index).dropna()
        if len(sw):
            sd = (sw[ref] - sw[other]).to_numpy(float)
            boot = sd[rng.integers(0, len(sd), size=(max(n_boot, 1), len(sd)))].mean(axis=1)
            score = {
                "mean_difference": round(float(sd.mean()), 4),
                "ci": [round(float(np.quantile(boot, 0.025)), 4), round(float(np.quantile(boot, 0.975)), 4)],
                "n_pairs": int(len(sd)),
            }

    diff = rate_ref - rate_other
    favoured = ref if n10 > n01 else other if n01 > n10 else None
    if n < MIN_PAIRS:
        status, label = "inconclusive", "Inconclusive"
        reason = f"Only {n} complete pairs; at least {MIN_PAIRS} are needed to say anything."
    elif p_value < 0.05:
        status, label = "disparity", "Differential treatment evidenced"
        winner, loser = (ref, other) if favoured == ref else (other, ref)
        reason = (
            f"Of {discordant} pairs decided differently, {max(n10, n01)} favoured {winner} and {min(n10, n01)} favoured "
            f"{loser} (exact McNemar p {_p(p_value)}). Identical applications were treated differently by this signal."
        )
    elif diff_ci[0] >= -margin and diff_ci[1] <= margin:
        status, label = "no_material_disparity", "No material difference"
        reason = (
            f"Flips split {n10} to {n01} (p {_p(p_value)}) and the selection-rate difference is within "
            f"±{margin:.0%} (95% CI {diff_ci[0]:+.1%} to {diff_ci[1]:+.1%})."
        )
    else:
        status, label = "inconclusive", "Inconclusive"
        reason = (
            f"Flips split {n10} to {n01} (p {_p(p_value)}), but the difference could still be as large as "
            f"{max(abs(diff_ci[0]), abs(diff_ci[1])):.1%}. More pairs are needed."
        )
    flip_ci = _wilson(discordant, n)
    return {
        "schema": "bias0.paired-probe@1.0.0",
        "mapping": {"pair_col": pair_col, "variant_col": variant_col, "decision_col": decision_col, "score_col": score_col},
        "decision": decision_info,
        "reference": ref,
        "other": other,
        "n_pairs": n,
        "n_pairs_dropped": dropped,
        "table": {"both_selected": n11, "only_reference": n10, "only_other": n01, "neither": n00},
        "flip_rate": round(discordant / n, 4) if n else None,
        "flip_rate_ci": [round(flip_ci[0], 4), round(flip_ci[1], 4)] if n else None,
        "selection_rate": {ref: round(rate_ref, 4), other: round(rate_other, 4)},
        "rate_difference": round(diff, 4),
        "rate_difference_ci": [round(diff_ci[0], 4), round(diff_ci[1], 4)],
        "mcnemar_p": round(p_value, 6),
        "favoured": favoured,
        "score": score,
        "verdict": {"status": status, "label": label, "reason": reason},
        "config": {"n_boot": n_boot, "seed": int(cfg["seed"]), "margin": margin, "min_pairs": MIN_PAIRS},
        "warnings": ([f"{dropped} pair id(s) did not have exactly one row per variant and were left out."] if dropped else []),
    }
