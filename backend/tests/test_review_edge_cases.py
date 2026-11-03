"""Adversarial edge cases found in the 2026-11-02 review, hand-computed.

Missing protected attribute: rows whose sensitive value is NaN/None form one
visible group, "(missing)". They must not crash the metrics (pandas 3 keeps NaN
through ``astype(str)``, so ``factorize`` returned -1 codes and ``bincount``
raised) and must not be silently dropped from per-group tables.

  group a        y_true=[1,0] y_pred=[1,0]  sel 0.5  TPR 1  FPR 0
  group b        y_true=[1,0] y_pred=[1,1]  sel 1.0  TPR 1  FPR 1
  group missing  y_true=[1,0] y_pred=[0,0]  sel 0.0  TPR 0  FPR 0
  DPD = 1.0, EOD = 1.0, FPR gap = 1.0, DI = 0/1 = 0.0
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from core.metrics import disparate_impact_ratio, fairness_gaps, group_metrics
from core.rigour import analyse_attribute, analyse_statistical_rigour

MISSING = "(missing)"


@pytest.fixture
def missing_group():
    g = pd.Series(["a", "a", "b", "b", None, np.nan], dtype=object)
    yt = pd.Series([1, 0, 1, 0, 1, 0])
    yp = pd.Series([1, 0, 1, 1, 0, 0])
    return yt, yp, g


def test_fairness_gaps_counts_missing_group(missing_group):
    yt, yp, g = missing_group
    gaps = fairness_gaps(yp, yt, g)
    assert gaps["demographic_parity_difference"] == pytest.approx(1.0)
    assert gaps["equal_opportunity_difference"] == pytest.approx(1.0)
    assert gaps["fpr_gap"] == pytest.approx(1.0)


def test_fairness_gaps_fallback_path_counts_missing_group(missing_group):
    yt, yp, g = missing_group
    yp = yp.iloc[::-1]  # same labels, different order -> label-aligned fallback path
    gaps = fairness_gaps(yp, yt, g)
    assert gaps["demographic_parity_difference"] == pytest.approx(1.0)


def test_disparate_impact_includes_missing_group(missing_group):
    _, yp, g = missing_group
    assert disparate_impact_ratio(yp, g) == pytest.approx(0.0)


def test_group_metrics_reports_missing_group(missing_group):
    yt, yp, g = missing_group
    out = group_metrics(yt, yp, g)
    assert set(out) == {"a", "b", MISSING}
    assert out[MISSING]["approval_rate"] == pytest.approx(0.0)


def test_rigour_handles_missing_group(missing_group):
    yt, yp, g = missing_group
    res = analyse_attribute(yt, yp, g, config={"n_boot": 20, "min_group_size": 1})
    assert set(res["groups"]) == {"a", "b", MISSING}
    assert res["groups"][MISSING]["count"] == 2
    assert res["gaps"]["demographic_parity_difference"]["point"] == pytest.approx(1.0)
    assert res["gaps"]["disparate_impact_ratio"]["point"] == pytest.approx(0.0)


def test_intersectional_handles_missing(missing_group):
    yt, yp, g = missing_group
    frame = pd.DataFrame({"s": g, "r": ["x"] * 6})
    res = analyse_statistical_rigour(
        frame, ["s", "r"], yt, yp, config={"n_boot": 0, "min_group_size": 1}
    )
    cells = res["intersectional"]["s × r"]["groups"]
    assert f"{MISSING} × x" in cells


# ── Label encoding (core.data.normalize_target_binary) ─────────────────────

from core.data import normalize_target_binary, prepare_split  # noqa: E402


def _norm(values):
    df = pd.DataFrame({"t": values, "x": range(len(values))})
    normalize_target_binary(df, "t")
    return df


def test_yes_no_with_missing_label_keeps_positive_class():
    # Before: the NaN made a third category, the median-code split ran, and
    # "yes" became 0 / "no" became 1 (positive class inverted).
    df = _norm(["yes", "no", "yes", None])
    assert df["t"].tolist()[:3] == [1, 0, 1]
    assert np.isnan(df["t"].iloc[3])  # unlabeled row stays unlabeled, not guessed
    prepared = prepare_split(pd.concat([df] * 4, ignore_index=True), "t")
    assert len(prepared.y_train) + len(prepared.y_test) == 12
    assert set(prepared.y_train) | set(prepared.y_test) <= {0, 1}


def test_numeric_01_with_missing_label_does_not_crash():
    df = _norm([0, 1, np.nan, 1])
    assert df["t"].tolist()[:2] == [0, 1] and df["t"].iloc[3] == 1
    assert np.isnan(df["t"].iloc[2])


@pytest.mark.parametrize(
    "values, expected",
    [([1, 2, 2, 1], [0, 1, 1, 0]), ([-1, 1, 1], [0, 1, 1])],
)
def test_two_valued_numeric_labels_map_to_0_1(values, expected):
    # Before: {1, 2} and {-1, 1} were left as is, so y == 0 / y == 1 matched
    # only part of the rows and TPR/FPR were computed on the wrong subset.
    assert _norm(values)["t"].tolist() == expected


def test_two_category_string_mapping_does_not_depend_on_row_order():
    a = _norm(["good", "bad", "good"])["t"].tolist()
    b = _norm(["bad", "good", "good"])["t"].tolist()
    assert a == [1, 0, 1]
    assert b == [0, 1, 1]


def test_two_category_string_uses_favourable_wording():
    assert _norm(["approve", "deny", "deny"])["t"].tolist() == [1, 0, 0]
    assert _norm(["deny", "approve"])["t"].tolist() == [0, 1]


# ── Division by zero: a group with no actual positives / negatives ─────────


def test_group_metrics_undefined_rates_are_none_not_zero():
    # group a: y_true=[0,0] -> TPR undefined; group b: y_true=[1,1] -> FPR undefined.
    # Before: max(denominator, 1) reported TPR 0.0 / FPR 0.0, i.e. "this group
    # never gets a true positive", which the data cannot say.
    yt = pd.Series([0, 0, 1, 1])
    yp = pd.Series([1, 0, 1, 0])
    g = pd.Series(list("aabb"))
    out = group_metrics(yt, yp, g)
    assert out["a"]["tpr"] is None
    assert out["a"]["fpr"] == pytest.approx(0.5)
    assert out["b"]["tpr"] == pytest.approx(0.5)
    assert out["b"]["fpr"] is None


# ── Monitoring log: disparate impact was always null ───────────────────────


def test_monitoring_disparate_impact_comes_from_rigour_block():
    # model_bias["metrics"] holds only the four gaps, so the monitoring log's
    # keyMetrics.disparate_impact read a key that never exists (always None).
    from routers.pipeline import _worst_disparate_impact

    model_bias = {
        "metrics": {"demographic_parity_difference": 0.3},
        "statistical_rigour": {
            "per_attribute": {
                "sex": {"gaps": {"disparate_impact_ratio": {"point": 0.62}}},
                "race": {"gaps": {"disparate_impact_ratio": {"point": 0.91}}},
            }
        },
    }
    assert _worst_disparate_impact(model_bias) == pytest.approx(0.62)
    assert _worst_disparate_impact({"metrics": {}}) is None


# ── Data audit: missing protected values were skipped ──────────────────────


def test_data_audit_reports_missing_protected_group():
    from core.data_audit import run_data_audit

    # a: approval 1/2, b: 1/2, missing: 0/2 -> max gap 0.5 (was 0 with the
    # missing rows hidden).
    df = pd.DataFrame(
        {
            "sex": ["a", "a", "b", "b", None, None],
            "y": [1, 0, 1, 0, 0, 0],
        }
    )
    res = run_data_audit(df, ["sex"], "y")
    stats = res["group_stats"]["sex"]
    assert MISSING in stats
    assert stats[MISSING]["count"] == 2
    assert stats[MISSING]["positive_rate"] == pytest.approx(0.0)
    assert res["max_gap"] == pytest.approx(0.5)


def test_fairlearn_by_group_undefined_rate_is_none_not_zero():
    # fairlearn returns NaN TPR for a group with no actual positives; the
    # conversion used to turn it into 0.0.
    from core.model_bias import _to_native

    assert _to_native({"a": float("nan"), "b": 0.5, "c": float("inf")}) == {
        "a": None,
        "b": 0.5,
        "c": None,
    }
