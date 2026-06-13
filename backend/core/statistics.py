from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from .metrics import fairness_gaps

logger = logging.getLogger(__name__)


def bootstrap_fairness_gaps(
    y_pred: pd.Series,
    y_true: pd.Series,
    group: pd.Series,
    n_boot: int = 1000,
    ci_level: float = 0.95,
    seed: int = 42,
) -> dict[str, dict[str, float]]:
    """Bootstrap fairness gaps to get confidence intervals.

    Returns a dict like:
      {
        "demographic_parity_difference": {"point": 0.12, "ci_lower": 0.08, "ci_upper": 0.17},
        "equal_opportunity_difference": {"point": ..., ...},
        ...
      }
    """
    rng = np.random.default_rng(seed)
    n = len(y_pred)
    alpha = 1.0 - ci_level
    lower_q = alpha / 2.0 * 100
    upper_q = (1.0 - alpha / 2.0) * 100

    boot_dpd: list[float] = []
    boot_eod: list[float] = []
    boot_fpr: list[float] = []
    boot_fnr: list[float] = []

    for _ in range(n_boot):
        idx = rng.integers(0, n, size=n)
        yp_boot = y_pred.iloc[idx]
        yt_boot = y_true.iloc[idx]
        g_boot = group.iloc[idx]
        try:
            gaps = fairness_gaps(yp_boot, yt_boot, g_boot)
            boot_dpd.append(gaps["demographic_parity_difference"])
            boot_eod.append(gaps["equal_opportunity_difference"])
            boot_fpr.append(gaps["fpr_gap"])
            boot_fnr.append(gaps["fnr_gap"])
        except Exception as exc:
            logger.debug("Bootstrap iteration failed: %s", exc)
            continue

    def _ci(values: list[float]) -> dict[str, float]:
        if not values:
            return {"point": 0.0, "ci_lower": 0.0, "ci_upper": 0.0}
        return {
            "point": float(np.mean(values)),
            "ci_lower": float(np.percentile(values, lower_q)),
            "ci_upper": float(np.percentile(values, upper_q)),
        }

    return {
        "demographic_parity_difference": _ci(boot_dpd),
        "equal_opportunity_difference": _ci(boot_eod),
        "fpr_gap": _ci(boot_fpr),
        "fnr_gap": _ci(boot_fnr),
    }


def permutation_fairness_pvalue(
    y_pred: pd.Series,
    y_true: pd.Series,
    group: pd.Series,
    n_perm: int = 2000,
    seed: int = 42,
) -> dict[str, float]:
    """Permutation test for statistical significance of each fairness gap.

    Returns Bonferroni-corrected p-values per metric.
    A corrected p-value < 0.05 means the observed gap is unlikely to occur
    by random chance — suggesting real bias.
    """
    rng = np.random.default_rng(seed)
    observed = fairness_gaps(y_pred, y_true, group)
    n = len(y_pred)

    n_tests = 4  # 4 fairness metrics

    pvalues: dict[str, float] = {}
    for metric_key in [
        "demographic_parity_difference",
        "equal_opportunity_difference",
        "fpr_gap",
        "fnr_gap",
    ]:
        obs_val = observed.get(metric_key, 0.0)
        extreme_count = 0
        for _ in range(n_perm):
            shuffled = group.sample(
                frac=1.0, random_state=rng.integers(0, 2**31)
            ).reset_index(drop=True)
            shuffled.index = group.index
            perm_gaps = fairness_gaps(y_pred, y_true, shuffled)
            if perm_gaps.get(metric_key, 0.0) >= obs_val:
                extreme_count += 1
        # Raw p-value
        raw_p = (extreme_count + 1) / (n_perm + 1)
        # Bonferroni correction: multiply by number of tests, cap at 1.0
        corrected_p = min(raw_p * n_tests, 1.0)
        pvalues[metric_key] = round(corrected_p, 4)
    return pvalues
