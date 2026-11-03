"""Statistical-rigour layer: CIs, small-group flags, intersectional groups, calibration.

Point estimates are cross-checked against fairlearn / sklearn on a fixed,
seeded dataset (tolerance 1e-4, the API rounds to 4 decimals).
"""

from __future__ import annotations

import time
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from core.metrics import disparate_impact_ratio, fairness_gaps
from core.rigour import (
    analyse_attribute,
    analyse_statistical_rigour,
    bootstrap_gap_cis,
    calibration_summary,
    intersectional_labels,
    wilson_interval,
)

TOL = 1e-4
DATA = Path(__file__).resolve().parents[2] / "data" / "demo_loan.csv"


def _fixed_dataset(n: int = 3000, seed: int = 7) -> pd.DataFrame:
    """Seeded synthetic credit data with a biased, miscalibrated score."""
    rng = np.random.default_rng(seed)
    sex = rng.choice(["F", "M"], size=n, p=[0.4, 0.6])
    race = rng.choice(["A", "B", "C", "D"], size=n, p=[0.55, 0.3, 0.13, 0.02])
    base = rng.normal(0, 1, size=n)
    y_true = (base + rng.normal(0, 0.8, size=n) > 0).astype(int)
    shift = np.where(sex == "M", 0.4, -0.2) + np.where(race == "B", -0.5, 0.0)
    logit = 1.5 * base + shift
    score = 1 / (1 + np.exp(-logit))
    # group C gets an over-confident score: same ranking, worse calibration
    score = np.where(race == "C", np.clip(score * 1.3, 0, 1), score)
    y_pred = (score >= 0.5).astype(int)
    return pd.DataFrame(
        {"sex": sex, "race": race, "y_true": y_true, "y_pred": y_pred, "score": score}
    )


@pytest.fixture(scope="module")
def ds() -> pd.DataFrame:
    return _fixed_dataset()


# ── point estimates vs fairlearn ────────────────────────────────────────────


@pytest.mark.parametrize("cols", [["sex"], ["race"], ["sex", "race"]])
def test_gaps_match_fairlearn(ds, cols):
    fl = pytest.importorskip("fairlearn.metrics")
    sf = ds[cols] if len(cols) > 1 else ds[cols[0]]
    group = intersectional_labels(ds, cols)
    res = analyse_attribute(ds.y_true, ds.y_pred, group, config={"n_boot": 0})
    g = res["gaps"]
    kw = dict(y_true=ds.y_true, y_pred=ds.y_pred, sensitive_features=sf)
    assert g["demographic_parity_difference"]["point"] == pytest.approx(
        fl.demographic_parity_difference(**kw), abs=TOL
    )
    assert g["disparate_impact_ratio"]["point"] == pytest.approx(
        fl.demographic_parity_ratio(**kw), abs=TOL
    )
    assert g["equalized_odds_difference"]["point"] == pytest.approx(
        fl.equalized_odds_difference(**kw), abs=TOL
    )
    mf = fl.MetricFrame(
        metrics={
            "tpr": fl.true_positive_rate,
            "fpr": fl.false_positive_rate,
            "fnr": fl.false_negative_rate,
            "sel": fl.selection_rate,
        },
        **kw,
    )
    diff = mf.difference()
    assert g["equal_opportunity_difference"]["point"] == pytest.approx(diff["tpr"], abs=TOL)
    assert g["fpr_gap"]["point"] == pytest.approx(diff["fpr"], abs=TOL)
    assert g["fnr_gap"]["point"] == pytest.approx(diff["fnr"], abs=TOL)
    # per-group rates and counts
    by_group = mf.by_group
    counts = group.value_counts()
    for label, row in res["groups"].items():
        key = tuple(label.split(" × ")) if len(cols) > 1 else label
        assert row["selection_rate"] == pytest.approx(by_group.loc[key, "sel"], abs=TOL)
        assert row["tpr"] == pytest.approx(by_group.loc[key, "tpr"], abs=TOL)
        assert row["fpr"] == pytest.approx(by_group.loc[key, "fpr"], abs=TOL)
        assert row["count"] == counts[label]


def test_all_groups_gaps_match_core_fairness_gaps(ds):
    res = analyse_attribute(ds.y_true, ds.y_pred, ds.race, config={"n_boot": 0})
    core = fairness_gaps(ds.y_pred, ds.y_true, ds.race)
    for key, value in core.items():
        assert res["gaps"][key]["point"] == pytest.approx(value, abs=TOL)
    assert res["gaps"]["disparate_impact_ratio"]["point"] == pytest.approx(
        disparate_impact_ratio(ds.y_pred, ds.race), abs=TOL
    )


@pytest.mark.skipif(not DATA.exists(), reason="demo dataset missing")
def test_demo_loan_intersection_matches_fairlearn():
    fl = pytest.importorskip("fairlearn.metrics")
    df = pd.read_csv(DATA).head(2000)
    # fixed, model-free decision rule so the test does not depend on training
    y_pred = (df["credit_score"].fillna(df["credit_score"].median()) >= 650).astype(int)
    y_true = df["approved"].astype(int)
    group = intersectional_labels(df, ["gender", "caste"])
    res = analyse_attribute(y_true, y_pred, group, config={"n_boot": 0})
    kw = dict(y_true=y_true, y_pred=y_pred, sensitive_features=df[["gender", "caste"]])
    assert res["gaps"]["demographic_parity_difference"]["point"] == pytest.approx(
        fl.demographic_parity_difference(**kw), abs=TOL
    )
    assert res["gaps"]["equalized_odds_difference"]["point"] == pytest.approx(
        fl.equalized_odds_difference(**kw), abs=TOL
    )


# ── bootstrap confidence intervals ──────────────────────────────────────────


def test_bootstrap_is_seeded_and_brackets_point(ds):
    cfg = {"n_boot": 300, "seed": 11}
    a = analyse_attribute(ds.y_true, ds.y_pred, ds.sex, config=cfg)
    b = analyse_attribute(ds.y_true, ds.y_pred, ds.sex, config=cfg)
    assert a["gaps"] == b["gaps"]
    c = analyse_attribute(ds.y_true, ds.y_pred, ds.sex, config={**cfg, "seed": 12})
    assert c["gaps"] != a["gaps"]
    for key, gap in a["gaps"].items():
        assert gap["ci_lower"] <= gap["ci_upper"], key
        assert gap["se"] >= 0
    # sex has 2 large groups: the spread statistic is ~unbiased, CI covers it
    dpd = a["gaps"]["demographic_parity_difference"]
    assert dpd["ci_lower"] < dpd["point"] < dpd["ci_upper"]


def test_ci_width_shrinks_with_more_data():
    small = _fixed_dataset(n=400, seed=3)
    large = _fixed_dataset(n=6000, seed=3)
    cfg = {"n_boot": 300}

    def width(d):
        g = analyse_attribute(d.y_true, d.y_pred, d.sex, config=cfg)["gaps"]
        return g["demographic_parity_difference"]["ci_upper"] - g["demographic_parity_difference"]["ci_lower"]

    assert width(large) < width(small) / 2


def test_bootstrap_ci_has_nominal_coverage_roughly():
    """Simulate: two groups with a true selection-rate gap of 0.2; the 95% CI
    should cover 0.2 in most repetitions (loose bound, 40 reps)."""
    rng = np.random.default_rng(0)
    covered = 0
    reps = 40
    for r in range(reps):
        n = 600
        grp = np.array(["X"] * (n // 2) + ["Y"] * (n // 2))
        p = np.where(grp == "X", 0.6, 0.4)
        y_pred = (rng.random(n) < p).astype(int)
        res = analyse_attribute(y_pred, y_pred, grp, config={"n_boot": 200, "seed": r})
        gap = res["gaps"]["demographic_parity_difference"]
        covered += gap["ci_lower"] <= 0.2 <= gap["ci_upper"]
    assert covered / reps >= 0.85


def test_no_bootstrap_when_disabled_or_single_group(ds):
    res = analyse_attribute(ds.y_true, ds.y_pred, ds.sex, config={"n_boot": 0})
    assert res["gaps"]["demographic_parity_difference"]["ci_lower"] is None
    one = analyse_attribute(ds.y_true, ds.y_pred, ["A"] * len(ds), config={"n_boot": 50})
    assert one["gaps"]["demographic_parity_difference"] == {
        "point": 0.0, "ci_lower": None, "ci_upper": None, "se": None
    }
    assert one["unreliable"]


def test_bootstrap_is_fast_enough(ds):
    big = pd.concat([ds] * 3, ignore_index=True)  # 9000 rows, 8 intersectional cells
    t0 = time.perf_counter()
    analyse_statistical_rigour(
        big, ["sex", "race"], big.y_true, big.y_pred, big.score, config={"n_boot": 1000}
    )
    # 3 analyses x 1000 resamples; ~1 s on an idle laptop, generous for shared CI boxes
    assert time.perf_counter() - t0 < 20


# ── minimum group size ──────────────────────────────────────────────────────


def test_small_groups_are_flagged(ds):
    res = analyse_attribute(ds.y_true, ds.y_pred, ds.race, config={"n_boot": 0, "min_group_size": 100})
    d = res["groups"]["D"]  # ~2% of 3000 = ~60 rows
    assert d["count"] < 100 and d["reliable"] is False
    assert any("unreliable" in w for w in d["warnings"])
    assert [s["group"] for s in res["small_groups"]] == ["D"]
    assert res["unreliable"] is True
    assert res["groups"]["A"]["reliable"] is True and res["groups"]["A"]["warnings"] == []
    lo, hi = d["selection_rate_ci"]
    assert lo <= d["selection_rate"] <= hi


def test_few_positives_flag_tpr():
    y_true = [1, 1, 0, 0, 0, 0] * 10 + [1] * 3 + [0] * 57
    y_pred = [1, 0, 0, 1, 0, 0] * 10 + [1] * 3 + [0] * 57
    group = ["A"] * 60 + ["B"] * 60
    res = analyse_attribute(y_true, y_pred, group, config={"n_boot": 0})
    assert res["groups"]["B"]["reliable"] is True
    assert any("actual positives" in w for w in res["groups"]["B"]["warnings"])


def test_intersectional_gaps_use_reliable_cells_only(ds):
    out = analyse_statistical_rigour(
        ds, ["sex", "race"], ds.y_true, ds.y_pred, config={"n_boot": 100, "min_group_size": 100}
    )
    inter = out["intersectional"]["sex × race"]
    assert inter["gaps_scope"] == "reliable_groups"
    assert inter["columns"] == ["sex", "race"]
    reliable = [g for g, r in inter["groups"].items() if r["reliable"]]
    small = {s["group"] for s in inter["small_groups"]}
    assert small and small.isdisjoint(reliable)
    sub = ds[intersectional_labels(ds, ["sex", "race"]).isin(reliable)]
    expected = fairness_gaps(sub.y_pred, sub.y_true, intersectional_labels(sub, ["sex", "race"]))
    assert inter["gaps"]["demographic_parity_difference"]["point"] == pytest.approx(
        expected["demographic_parity_difference"], abs=TOL
    )
    assert any(w.startswith("sex × race:") for w in out["warnings"])
    assert set(out["per_attribute"]) == {"sex", "race"}


# ── calibration ─────────────────────────────────────────────────────────────


def test_calibration_matches_sklearn(ds):
    from sklearn.calibration import calibration_curve
    from sklearn.metrics import brier_score_loss

    yt, ys = ds.y_true.to_numpy(float), ds.score.to_numpy(float)
    summary = calibration_summary(yt, ys, n_bins=10)
    prob_true, prob_pred = calibration_curve(yt, ys, n_bins=10, strategy="uniform")
    assert [b["observed_rate"] for b in summary["bins"]] == pytest.approx(prob_true, abs=TOL)
    assert [b["mean_predicted"] for b in summary["bins"]] == pytest.approx(prob_pred, abs=TOL)
    assert summary["brier"] == pytest.approx(brier_score_loss(yt, ys), abs=TOL)
    counts = np.array([b["count"] for b in summary["bins"]])
    manual_ece = np.sum(counts * np.abs(prob_true - prob_pred)) / counts.sum()
    assert summary["ece"] == pytest.approx(manual_ece, abs=TOL)
    assert summary["mce"] == pytest.approx(np.max(np.abs(prob_true - prob_pred)), abs=TOL)


def test_perfectly_calibrated_scores_have_small_ece():
    rng = np.random.default_rng(1)
    s = rng.random(20000)
    y = (rng.random(20000) < s).astype(float)
    assert calibration_summary(y, s)["ece"] < 0.02


def test_per_group_calibration_flags_the_miscalibrated_group(ds):
    res = analyse_attribute(ds.y_true, ds.y_pred, ds.race, ds.score, config={"n_boot": 0})
    cal = res["calibration"]
    assert set(cal["by_group"]) == {"A", "B", "C", "D"}
    assert cal["by_group"]["C"]["ece"] > cal["by_group"]["A"]["ece"]
    assert cal["by_group"]["D"]["reliable"] is (res["groups"]["D"]["count"] >= 30)
    assert cal["ece_gap"] is not None and cal["ece_gap"] > 0


def test_wilson_interval():
    lo, hi = wilson_interval(0, 10)
    assert lo == 0.0 and 0.25 < hi < 0.35  # 0/10 -> [0, 0.278]
    lo, hi = wilson_interval(50, 100)
    assert lo == pytest.approx(0.4038, abs=1e-3) and hi == pytest.approx(0.5962, abs=1e-3)


def test_high_cardinality_listing_is_capped_but_gaps_use_all_groups():
    from core.rigour import MAX_REPORTED_GROUPS

    rng = np.random.default_rng(5)
    n = 4000
    grp = rng.integers(0, 400, size=n).astype(str)  # ~10 rows per "zip code"
    y = rng.integers(0, 2, size=n)
    p = rng.integers(0, 2, size=n)
    res = analyse_attribute(y, p, grp, rng.random(n), config={"n_boot": 20})
    assert len(res["groups"]) == MAX_REPORTED_GROUPS
    assert res["groups_omitted"] == res["n_groups"] - MAX_REPORTED_GROUPS
    assert res["n_small_groups"] == res["n_groups"]  # all below 30 rows
    assert len(res["small_groups"]) == MAX_REPORTED_GROUPS
    assert res["gaps"]["demographic_parity_difference"]["point"] == pytest.approx(
        fairness_gaps(pd.Series(p), pd.Series(y), pd.Series(grp))["demographic_parity_difference"],
        abs=TOL,
    )
    assert len(res["calibration"]["by_group"]) == MAX_REPORTED_GROUPS


# ── bootstrap_gap_cis (used by the stress test) ─────────────────────────────


def test_bootstrap_gap_cis_matches_analyse_attribute(ds):
    cfg = {"n_boot": 200, "seed": 3}
    full = analyse_attribute(ds.y_true, ds.y_pred, ds.race, config=cfg)["gaps"]
    only = bootstrap_gap_cis(ds.y_true, ds.y_pred, ds.race, config=cfg)
    assert only == full
    dpd = only["demographic_parity_difference"]
    assert dpd["ci_lower"] <= dpd["point"] <= dpd["ci_upper"]


def test_bootstrap_gap_cis_single_group_has_no_ci():
    y = pd.Series([0, 1, 1, 0])
    res = bootstrap_gap_cis(y, y, pd.Series(["a"] * 4), config={"n_boot": 50})
    assert res["demographic_parity_difference"]["ci_lower"] is None


def test_stress_test_uses_stratified_bootstrap(monkeypatch):
    from core import stress_test

    monkeypatch.setenv("BIAS_BOOTSTRAP_N", "100")
    calls: list[int] = []
    real = stress_test.bootstrap_gap_cis

    def spy(*args, **kwargs):
        calls.append(1)
        return real(*args, **kwargs)

    monkeypatch.setattr(stress_test, "bootstrap_gap_cis", spy)
    df = pd.read_csv(DATA).head(1500)
    out = stress_test.run_stress_tests(df, None, ["gender"], "approved")
    assert calls, "stress test should use core.rigour.bootstrap_gap_cis"
    group_scenarios = [s for s in out["scenarios"] if s["dpd_ci"] is not None]
    assert group_scenarios
    for s in group_scenarios:
        assert isinstance(s["statistically_significant"], bool)
        for ci in (s["dpd_ci"], s["baseline_dpd_ci"]):
            assert ci["ci_lower"] <= ci["point"] <= ci["ci_upper"]
    # baseline CI is computed once per column, not once per scenario
    assert len(calls) == len(group_scenarios) + 1


def test_calibration_counts_and_warns_about_clipped_scores():
    # Logits outside [0, 1] used to be clipped silently, making ECE meaningless.
    y = np.array([0, 1, 1, 0, 1], dtype=float)
    s = np.array([-2.0, 0.7, 3.5, 0.2, 1.0])
    summary = calibration_summary(y, s)
    assert summary["n_clipped"] == 2
    assert "outside [0, 1]" in summary["warning"]


def test_calibration_has_no_warning_for_valid_probabilities():
    summary = calibration_summary(np.array([0.0, 1.0]), np.array([0.1, 0.9]))
    assert summary["n_clipped"] == 0
    assert summary["warning"] is None


def test_rigour_report_warns_when_scores_are_clipped():
    frame = pd.DataFrame({"sex": ["F", "M"] * 50})
    y_true = np.array([0, 1] * 50)
    y_pred = np.array([0, 1] * 50)
    score = np.where(y_pred == 1, 2.0, -1.0)  # logits, not probabilities
    res = analyse_statistical_rigour(
        frame, ["sex"], y_true, y_pred, score, config={"n_boot": 0}
    )
    assert any("outside [0, 1]" in w and "100" in w for w in res["warnings"])
