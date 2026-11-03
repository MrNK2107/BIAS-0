"""User-chosen positive class (positive_label) and text-label user models."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from core.data import (
    infer_positive_label,
    normalize_target_binary,
    resolve_target_positive,
)
from core.evidence import build_provenance
from core.model_bias import run_model_bias_analysis


def test_default_inference_is_unchanged():
    df = pd.DataFrame({"t": ["approve", "deny", "approve"]})
    normalize_target_binary(df, "t")
    assert df["t"].tolist() == [1, 0, 1]


def test_user_positive_label_overrides_inference():
    df = pd.DataFrame({"t": ["approve", "deny", "approve"]})
    normalize_target_binary(df, "t", positive_label="deny")
    assert df["t"].tolist() == [0, 1, 0]


def test_user_positive_label_matches_case_and_whitespace_insensitively():
    df = pd.DataFrame({"t": ["Yes", "No ", "Yes"]})
    normalize_target_binary(df, "t", positive_label="no")
    assert df["t"].tolist() == [0, 1, 0]


def test_numeric_positive_label_given_as_text():
    df = pd.DataFrame({"t": [1, 2, 2]})
    normalize_target_binary(df, "t", positive_label="1")
    assert df["t"].tolist() == [1, 0, 0]


def test_unknown_positive_label_is_rejected():
    df = pd.DataFrame({"t": ["approve", "deny"]})
    with pytest.raises(ValueError, match="positive label"):
        normalize_target_binary(df, "t", positive_label="maybe")


@pytest.mark.parametrize(
    "values, expected",
    [
        (["approve", "deny"], "approve"),
        (["yes", "no"], "yes"),
        ([0, 1], 1),
        ([1, 2], 2),
        (["b_label", "a_label"], "b_label"),
    ],
)
def test_infer_positive_label(values, expected):
    assert infer_positive_label(pd.Series(values)) == expected


def test_resolve_target_positive_records_source():
    s = pd.Series(["approve", "deny"])
    assert resolve_target_positive(s, None) == {"value": "approve", "source": "inferred"}
    assert resolve_target_positive(s, "deny") == {"value": "deny", "source": "user"}


class _TextModel:
    """A user model whose predict() returns the original string labels."""

    def __init__(self, positive: str, negative: str):
        self.positive, self.negative = positive, negative

    def predict(self, X):
        return np.where(X["score"].to_numpy() > 0.5, self.positive, self.negative)


def _hiring_df(n: int = 400) -> pd.DataFrame:
    rng = np.random.default_rng(0)
    score = rng.random(n)
    sex = rng.choice(["F", "M"], size=n)
    hired = np.where(score + rng.normal(0, 0.1, n) > 0.5, "hired", "rejected")
    return pd.DataFrame({"score": score, "sex": sex, "hired": hired})


def test_model_predicting_text_labels_is_mapped_with_inferred_label():
    df = _hiring_df()
    res = run_model_bias_analysis(
        df, ["sex"], "hired", model=_TextModel("hired", "rejected"),
        rigour_config={"n_boot": 0},
    )
    assert res["overall_accuracy"] > 0.8


def test_model_predicting_text_labels_follows_chosen_positive_label():
    df = _hiring_df()
    res = run_model_bias_analysis(
        df, ["sex"], "hired", model=_TextModel("hired", "rejected"),
        positive_label="rejected", rigour_config={"n_boot": 0},
    )
    # Target and predictions both encode "rejected" as 1, so accuracy holds.
    assert res["overall_accuracy"] > 0.8
    rates = res["group_performance"]["sex"]
    df_test_rejected = 1 - np.mean([r["approval_rate"] for r in rates.values()])
    assert 0 <= df_test_rejected <= 1


def test_text_prediction_outside_target_labels_raises_clear_error():
    df = _hiring_df()
    res = run_model_bias_analysis(
        df, ["sex"], "hired", model=_TextModel("yes_hire", "maybe"),
        rigour_config={"n_boot": 0},
    )
    assert "cannot be mapped" in res["all_models"]["shared"]["error"]


def test_provenance_records_positive_label():
    prov = build_provenance(
        df_bytes=b"a,t\n1,yes\n", filename="x.csv", n_rows=1, columns=["a", "t"],
        sensitive_cols=["a"], target_col="t", domain="other", metric_weights={},
        model_used="tuned_rf", positive_label={"value": "yes", "source": "user"},
    )
    assert prov["config"]["positive_label"] == {"value": "yes", "source": "user"}
