"""Unit tests for fairness metrics with hand-computed expected values.

Reference dataset (10 rows, two groups):

  group A  y_true = [1, 1, 1, 0, 0]   y_pred = [1, 1, 0, 1, 0]
           TP=2 FN=1 FP=1 TN=1
           approval = 3/5 = 0.6   TPR = 2/3   FPR = 1/2   FNR = 1/3   acc = 3/5

  group B  y_true = [1, 1, 0, 0, 0]   y_pred = [1, 0, 0, 0, 0]
           TP=1 FN=1 FP=0 TN=3
           approval = 1/5 = 0.2   TPR = 1/2   FPR = 0     FNR = 1/2   acc = 4/5

  demographic parity difference = 0.6 - 0.2 = 0.4
  equal opportunity difference  = 2/3 - 1/2 = 1/6
  FPR gap                       = 1/2 - 0   = 1/2
  FNR gap                       = 1/2 - 1/3 = 1/6
  equalized odds difference     = max(1/6, 1/2) = 1/2
  disparate impact ratio        = 0.2 / 0.6 = 1/3
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from core.metrics import (
    ZERO_GAPS,
    disparate_impact_ratio,
    equalized_odds_difference,
    fairness_gaps,
    fairness_score_from_gaps,
    get_metric_weights,
    group_metrics,
)
from core.monitoring import _jensen_shannon, _psi
from core.statistics import bootstrap_fairness_gaps, permutation_fairness_pvalue
from core.thresholds import risk_from_gap, risk_from_score

APPROX = {"abs": 1e-9}


def _reference() -> tuple[pd.Series, pd.Series, pd.Series]:
    y_true = pd.Series([1, 1, 1, 0, 0, 1, 1, 0, 0, 0])
    y_pred = pd.Series([1, 1, 0, 1, 0, 1, 0, 0, 0, 0])
    group = pd.Series(["A"] * 5 + ["B"] * 5)
    return y_true, y_pred, group


# ── fairness_gaps ───────────────────────────────────────────────────────────


def test_demographic_parity_difference_hand_computed():
    y_true, y_pred, group = _reference()
    gaps = fairness_gaps(y_pred, y_true, group)
    assert gaps["demographic_parity_difference"] == pytest.approx(0.4, **APPROX)


def test_equal_opportunity_difference_hand_computed():
    y_true, y_pred, group = _reference()
    gaps = fairness_gaps(y_pred, y_true, group)
    assert gaps["equal_opportunity_difference"] == pytest.approx(1 / 6, **APPROX)


def test_fpr_and_fnr_gaps_hand_computed():
    y_true, y_pred, group = _reference()
    gaps = fairness_gaps(y_pred, y_true, group)
    assert gaps["fpr_gap"] == pytest.approx(0.5, **APPROX)
    assert gaps["fnr_gap"] == pytest.approx(1 / 6, **APPROX)


def test_equalized_odds_difference_hand_computed():
    y_true, y_pred, group = _reference()
    assert equalized_odds_difference(y_pred, y_true, group) == pytest.approx(
        0.5, **APPROX
    )


def test_disparate_impact_ratio_hand_computed():
    _, y_pred, group = _reference()
    assert disparate_impact_ratio(y_pred, group) == pytest.approx(1 / 3, **APPROX)


def test_disparate_impact_ratio_edge_cases():
    group = pd.Series(["A", "A", "B", "B"])
    assert disparate_impact_ratio(pd.Series([1, 1, 1, 1]), group) == 1.0
    # No approvals anywhere -> nothing to compare
    assert disparate_impact_ratio(pd.Series([0, 0, 0, 0]), group) == 1.0
    # One group never approved -> ratio 0
    assert disparate_impact_ratio(pd.Series([1, 0, 0, 0]), group) == 0.0


def test_metrics_agree_with_fairlearn():
    fl = pytest.importorskip("fairlearn.metrics")
    y_true, y_pred, group = _reference()
    gaps = fairness_gaps(y_pred, y_true, group)
    assert gaps["demographic_parity_difference"] == pytest.approx(
        fl.demographic_parity_difference(y_true, y_pred, sensitive_features=group)
    )
    assert equalized_odds_difference(y_pred, y_true, group) == pytest.approx(
        fl.equalized_odds_difference(y_true, y_pred, sensitive_features=group)
    )
    assert disparate_impact_ratio(y_pred, group) == pytest.approx(
        fl.demographic_parity_ratio(y_true, y_pred, sensitive_features=group)
    )


def test_three_groups_use_max_minus_min():
    # Add group C: y_true=[1,0], y_pred=[1,1] -> approval 1, TPR 1, FPR 1, FNR 0
    y_true, y_pred, group = _reference()
    y_true = pd.concat([y_true, pd.Series([1, 0])], ignore_index=True)
    y_pred = pd.concat([y_pred, pd.Series([1, 1])], ignore_index=True)
    group = pd.concat([group, pd.Series(["C", "C"])], ignore_index=True)
    gaps = fairness_gaps(y_pred, y_true, group)
    assert gaps["demographic_parity_difference"] == pytest.approx(0.8, **APPROX)
    assert gaps["equal_opportunity_difference"] == pytest.approx(0.5, **APPROX)
    assert gaps["fpr_gap"] == pytest.approx(1.0, **APPROX)
    assert gaps["fnr_gap"] == pytest.approx(0.5, **APPROX)


def test_perfect_classifier_still_shows_demographic_parity_gap():
    # Base rates differ (A: 3/5, B: 2/5) so even a perfect model has DPD = 0.2,
    # while all error-rate gaps are zero.
    y_true, _, group = _reference()
    gaps = fairness_gaps(y_true.copy(), y_true, group)
    assert gaps["demographic_parity_difference"] == pytest.approx(0.2, **APPROX)
    assert gaps["equal_opportunity_difference"] == 0.0
    assert gaps["fpr_gap"] == 0.0
    assert gaps["fnr_gap"] == 0.0


def test_identical_groups_have_zero_gaps():
    y_true = pd.Series([1, 0, 1, 0])
    y_pred = pd.Series([1, 0, 1, 0])
    group = pd.Series(["A", "A", "B", "B"])
    assert fairness_gaps(y_pred, y_true, group) == ZERO_GAPS


def test_single_group_has_zero_gaps():
    y_true, y_pred, _ = _reference()
    gaps = fairness_gaps(y_pred, y_true, pd.Series(["only"] * 10))
    assert gaps == ZERO_GAPS


def test_group_without_positives_does_not_fabricate_tpr_gap():
    # Group B has no actual positives, so its TPR/FNR are undefined and must not
    # be counted as 0 (which would give a spurious TPR gap of 1.0).
    y_true = pd.Series([1, 1, 0, 0, 0])
    y_pred = pd.Series([1, 1, 0, 0, 1])
    group = pd.Series(["A", "A", "B", "B", "B"])
    gaps = fairness_gaps(y_pred, y_true, group)
    assert gaps["equal_opportunity_difference"] == 0.0
    assert gaps["fnr_gap"] == 0.0
    # FPR: A has no negatives (undefined), B = 1/3 -> single value -> no gap
    assert gaps["fpr_gap"] == 0.0
    # Approval: A = 1.0, B = 1/3
    assert gaps["demographic_parity_difference"] == pytest.approx(2 / 3, **APPROX)


def test_nan_rows_are_ignored():
    y_true, y_pred, group = _reference()
    y_true_nan = pd.concat([y_true, pd.Series([np.nan, 1.0])], ignore_index=True)
    y_pred_nan = pd.concat([y_pred, pd.Series([1, np.nan])], ignore_index=True)
    group_nan = pd.concat([group, pd.Series(["A", "B"])], ignore_index=True)
    assert fairness_gaps(y_pred_nan, y_true_nan, group_nan) == pytest.approx(
        fairness_gaps(y_pred, y_true, group)
    )


def test_numeric_group_labels_are_supported():
    y_true, y_pred, _ = _reference()
    group = pd.Series([0] * 5 + [1] * 5)
    gaps = fairness_gaps(y_pred, y_true, group)
    assert gaps["demographic_parity_difference"] == pytest.approx(0.4, **APPROX)


# ── group_metrics ───────────────────────────────────────────────────────────


def test_group_metrics_hand_computed():
    y_true, y_pred, group = _reference()
    gm = group_metrics(y_true, y_pred, group)
    assert gm["A"] == pytest.approx(
        {"approval_rate": 0.6, "tpr": 2 / 3, "fpr": 0.5, "accuracy": 0.6}
    )
    assert gm["B"] == pytest.approx(
        {"approval_rate": 0.2, "tpr": 0.5, "fpr": 0.0, "accuracy": 0.8}
    )


# ── fairness score ──────────────────────────────────────────────────────────


def test_fairness_score_balanced_weights_hand_computed():
    y_true, y_pred, group = _reference()
    gaps = fairness_gaps(y_pred, y_true, group)
    # 100 - (30*0.4 + 25*(1/6) + 20*0.5 + 15*(1/6)) = 100 - 28.6667
    assert fairness_score_from_gaps(gaps) == pytest.approx(100 - 86 / 3, **APPROX)


@pytest.mark.parametrize(
    ("priority", "expected"),
    [
        # 100 - (45*0.4 + 15/6 + 15*0.5 + 15/6) = 100 - 30.5
        ("demographic_parity_first", 69.5),
        # 100 - (15*0.4 + 45/6 + 15*0.5 + 15/6) = 100 - 23.5
        ("equal_opportunity_first", 76.5),
        ("balanced", 100 - 86 / 3),
        ("unknown_priority_falls_back", 100 - 86 / 3),
    ],
)
def test_fairness_score_with_metric_priorities(priority, expected):
    y_true, y_pred, group = _reference()
    gaps = fairness_gaps(y_pred, y_true, group)
    score = fairness_score_from_gaps(gaps, get_metric_weights(priority))
    assert score == pytest.approx(expected, **APPROX)


def test_fairness_score_is_clamped():
    worst = {k: 1.0 for k in ZERO_GAPS}
    assert fairness_score_from_gaps(worst) == pytest.approx(10.0)  # 100 - 90
    heavy = {k: 100.0 for k in ZERO_GAPS}
    assert fairness_score_from_gaps(worst, heavy) == 0.0
    assert fairness_score_from_gaps(ZERO_GAPS) == 100.0


def test_get_metric_weights_returns_copy():
    w = get_metric_weights("balanced")
    w["fpr_gap"] = 999
    assert get_metric_weights("balanced")["fpr_gap"] == 20


# ── risk thresholds ─────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("gap", "expected"),
    [(0.0, "Green"), (0.25, "Green"), (0.26, "Yellow"), (0.5, "Yellow"), (0.51, "Red")],
)
def test_risk_from_gap_default_domain_boundaries(gap, expected):
    # "other" domain: green_min=75, yellow_min=50 -> gap cutoffs 0.25 / 0.50
    assert risk_from_gap(gap) == expected


def test_risk_thresholds_are_stricter_for_criminal_justice():
    # Same gap of 0.22: Green for marketing (cutoff 0.40), Yellow for CJ (0.20)
    assert risk_from_gap(0.22, "marketing") == "Green"
    assert risk_from_gap(0.22, "criminal_justice") == "Yellow"


@pytest.mark.parametrize(
    ("score", "domain", "expected"),
    [
        (75, "other", "Green"),
        (74.9, "other", "Yellow"),
        (50, "other", "Yellow"),
        (49.9, "other", "Red"),
        (79, "criminal_justice", "Yellow"),
        (36, "marketing", "Yellow"),
        (34, "marketing", "Red"),
    ],
)
def test_risk_from_score_boundaries(score, domain, expected):
    assert risk_from_score(score, domain) == expected


# ── statistical tests ───────────────────────────────────────────────────────


def test_bootstrap_ci_has_zero_width_when_no_bias():
    # Everyone is a true positive and approved: approval 1, TPR 1, FNR 0 and FPR
    # undefined in every group, so every resample has all-zero gaps.
    y = pd.Series([1] * 40)
    group = pd.Series(["A", "B"] * 20)
    ci = bootstrap_fairness_gaps(y, y, group, n_boot=50)
    for metric in ZERO_GAPS:
        assert ci[metric] == {"point": 0.0, "ci_lower": 0.0, "ci_upper": 0.0}


def test_bootstrap_ci_brackets_point_estimate():
    y_true, y_pred, group = _reference()
    ci = bootstrap_fairness_gaps(y_pred, y_true, group, n_boot=200, seed=1)
    for metric in ZERO_GAPS:
        assert ci[metric]["ci_lower"] <= ci[metric]["point"] <= ci[metric]["ci_upper"]


def test_permutation_pvalue_for_perfectly_separated_groups():
    # Group A always approved, B never: observed DPD = 1.0. A random relabelling
    # essentially never reproduces a gap of 1.0, so the raw p-value is
    # 1/(n_perm+1) and the Bonferroni-corrected one is 4/(n_perm+1).
    n_perm = 200
    y_pred = pd.Series([1] * 30 + [0] * 30)
    group = pd.Series(["A"] * 30 + ["B"] * 30)
    pvals = permutation_fairness_pvalue(y_pred, y_pred, group, n_perm=n_perm)
    assert pvals["demographic_parity_difference"] == round(4 / (n_perm + 1), 4)
    assert all(0.0 <= p <= 1.0 for p in pvals.values())


# ── drift statistics ────────────────────────────────────────────────────────


def test_psi_is_zero_for_identical_distributions():
    x = np.arange(100, dtype=float)
    assert _psi(x, x) == 0.0


def test_psi_grows_with_shift():
    rng = np.random.default_rng(0)
    base = rng.normal(0, 1, 2000)
    small = _psi(base, base + 0.1)
    large = _psi(base, base + 2.0)
    # conventional PSI bands: < 0.1 stable, > 0.25 significant shift
    assert 0.0 <= small < 0.1
    assert large > 0.25


def test_jensen_shannon_hand_computed():
    assert _jensen_shannon(np.array([0.5, 0.5]), np.array([0.5, 0.5])) == pytest.approx(
        0.0, abs=1e-9
    )
    # Disjoint distributions -> ln(2) (natural log)
    assert _jensen_shannon(np.array([1.0, 0.0]), np.array([0.0, 1.0])) == pytest.approx(
        math.log(2), abs=1e-6
    )


def test_vectorized_fairness_gaps_match_per_group_loop():
    """fairness_gaps' bincount fast path matches the metric definitions with
    many small groups, NaN labels and groups lacking positives or negatives."""
    import numpy as np
    import pandas as pd

    from core.metrics import fairness_gaps

    rng = np.random.default_rng(1)
    n = 3000
    y_true = pd.Series(rng.integers(0, 2, n).astype(float))
    y_pred = pd.Series(rng.integers(0, 2, n).astype(float))
    y_true.iloc[:20] = np.nan
    group = pd.Series(rng.integers(0, 800, n))  # ~800 small groups
    fast = fairness_gaps(y_pred, y_true, group)
    # Reference straight from the definitions via groupby.
    df = pd.DataFrame({"t": y_true, "p": y_pred, "g": group.astype(str)}).dropna()
    rates, tprs, fprs, fnrs = [], [], [], []
    for _, d in df.groupby("g"):
        rates.append(d.p.mean())
        pos, neg = d[d.t == 1], d[d.t == 0]
        if len(pos):
            tprs.append((pos.p == 1).mean())
            fnrs.append((pos.p == 0).mean())
        if len(neg):
            fprs.append((neg.p == 1).mean())
    expected = {
        "demographic_parity_difference": max(rates) - min(rates),
        "equal_opportunity_difference": max(tprs) - min(tprs),
        "fpr_gap": max(fprs) - min(fprs),
        "fnr_gap": max(fnrs) - min(fnrs),
    }
    for key, value in expected.items():
        assert abs(fast[key] - value) < 1e-12, key


def test_bootstrap_point_is_the_sample_estimate_not_the_bootstrap_mean():
    y_true, y_pred, group = _reference()
    observed = fairness_gaps(y_pred, y_true, group)
    ci = bootstrap_fairness_gaps(y_pred, y_true, group, n_boot=200, seed=1)
    for metric in ZERO_GAPS:
        assert ci[metric]["point"] == pytest.approx(observed[metric])
