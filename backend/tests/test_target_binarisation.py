"""data.py median split (review 2026-11-02): multi-class targets are never
binarised silently.

The audit measures binary decisions, so the encoding must be one of:
two classes (inferred or chosen positive), one-vs-rest on the user's positive
label, or a median threshold on an ordered numeric target. A median split of
alphabetical codes of string labels has no meaning and is rejected.
"""

from __future__ import annotations

import pandas as pd
import pytest

from core.data import describe_target_binarisation, normalize_target_binary
from core.data_audit import run_data_audit
from core.evidence import build_provenance


def test_multiclass_string_target_without_positive_label_is_rejected():
    df = pd.DataFrame({"y": ["low", "mid", "high", "mid"]})
    with pytest.raises(ValueError, match="positive"):
        normalize_target_binary(df, "y")


def test_multiclass_string_target_with_positive_label_is_one_vs_rest():
    df = pd.DataFrame({"y": ["low", "mid", "high", "mid"]})
    normalize_target_binary(df, "y", positive_label="mid")
    assert df["y"].tolist() == [0, 1, 0, 1]
    info = describe_target_binarisation(pd.Series(["low", "mid", "high", "mid"]), "mid")
    assert info["method"] == "one_vs_rest"
    assert info["n_classes"] == 3
    assert info["positive"] == "mid"


def test_numeric_multivalue_target_keeps_median_threshold_and_describes_it():
    s = pd.Series([1, 2, 3, 4, 5])
    df = pd.DataFrame({"y": s})
    normalize_target_binary(df, "y")
    assert df["y"].tolist() == [0, 0, 0, 1, 1]
    info = describe_target_binarisation(s)
    assert info["method"] == "median_threshold"
    assert info["threshold"] == 3.0
    assert "median" in info["note"]


def test_two_class_target_is_described_as_two_class():
    info = describe_target_binarisation(pd.Series(["yes", "no", "yes"]))
    assert info["method"] == "two_class"
    assert info["note"] is None


def test_data_audit_surfaces_the_binarisation():
    df = pd.DataFrame(
        {"g": ["a", "b"] * 20, "y": list(range(40))}  # 40 distinct numeric values
    )
    res = run_data_audit(df, ["g"], "y")
    assert res["target_binarisation"]["method"] == "median_threshold"
    assert any("median" in w.lower() for w in res["warnings"])


def test_provenance_records_the_binarisation():
    prov = build_provenance(
        df_bytes=b"x", filename="f.csv", n_rows=1, columns=["y"], sensitive_cols=[],
        target_col="y", domain="other", metric_weights={}, model_used="rf",
        target_binarisation={"method": "two_class", "n_classes": 2},
    )
    assert prov["config"]["target_binarisation"]["method"] == "two_class"
    assert prov["schema_version"] == "1.4.0"
