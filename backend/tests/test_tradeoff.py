"""Mitigation trade-off: holdout split, parity at full strength, caveat."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from core.tradeoff import TradeoffInputError, _split, threshold_tradeoff


def _biased(n: int = 4000, seed: int = 0) -> tuple[pd.DataFrame, np.ndarray]:
    rng = np.random.default_rng(seed)
    g = rng.choice(["a", "b"], n)
    worth = rng.normal(0, 1, n)
    y = (rng.random(n) < 1 / (1 + np.exp(-1.5 * worth))).astype(float)
    score = 1 / (1 + np.exp(-(1.5 * worth - np.where(g == "b", 0.8, 0.0))))
    return pd.DataFrame({"g": g, "score": score}), y


def test_split_is_stratified_and_seeded():
    groups = np.array(["a"] * 101 + ["b"] * 50)
    fit = _split(groups, 1)
    assert fit[groups == "a"].sum() == 51 and fit[groups == "b"].sum() == 25
    assert (fit == _split(groups, 1)).all()


def test_full_strength_reaches_parity_and_raises_the_ratio():
    # Large n: holdout rates scatter around the fitted parity by sampling noise only.
    df, y = _biased(20000)
    r = threshold_tradeoff(df, "score", y, "g", baseline_rate=0.5)
    first, last = r["points"][0], r["points"][-1]
    assert first["strength"] == 0.0 and last["strength"] == 1.0
    assert first["impact_ratio"] < 0.8
    assert last["impact_ratio"] > 0.9
    # overall selection stays close to the baseline rate throughout
    assert all(abs(p["selection_rate"] - 0.5) < 0.05 for p in r["points"])
    assert r["n_fit"] + r["n_holdout"] == len(df)
    rec = r["smallest_sufficient"]
    assert rec is not None and 0 < rec["strength"] <= 1
    assert rec["accuracy_cost"] == pytest.approx(first["accuracy"] - rec["accuracy"], abs=1e-4)
    assert "disparate treatment" in r["caveat"]


def test_unknown_groups_and_missing_values_are_left_out():
    df, y = _biased(2000)
    df.loc[:99, "g"] = None
    df.loc[100:149, "score"] = np.nan
    r = threshold_tradeoff(df, "score", y, "g", baseline_rate=0.5)
    assert r["n_fit"] + r["n_holdout"] == 2000 - 150
    assert r["reliable_groups"] == ["a", "b"]


def test_too_little_data_is_an_error():
    df, y = _biased(60)
    with pytest.raises(TradeoffInputError):
        threshold_tradeoff(df, "score", y, "g")
