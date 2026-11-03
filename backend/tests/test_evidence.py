"""Provenance block for the evidence pack (core/evidence.py)."""

from __future__ import annotations

import json

from core.evidence import (
    METRIC_VERSIONS,
    UNIFIED_SCORE_WEIGHTS,
    build_provenance,
    display_name,
    original_name_from_stored,
    sha256_hex,
)
from core.rigour import default_config
from routers.pipeline import unified_score

# FIPS 180-2 test vectors.
SHA256_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
SHA256_EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"


def test_sha256_known_vectors() -> None:
    assert sha256_hex(b"abc") == SHA256_ABC
    assert sha256_hex(b"") == SHA256_EMPTY


def test_unified_score_weights_sum_to_one_and_match_known_value() -> None:
    assert abs(sum(UNIFIED_SCORE_WEIGHTS.values()) - 1.0) < 1e-12
    scores = {
        "model_bias_score": 80,
        "counterfactual_score": 60,
        "stress_test_score": 70,
        "data_bias_score": 90,
        "proxy_risk_score": 40,
    }
    # 0.25*80 + 0.2*60 + 0.2*70 + 0.2*90 + 0.15*40 = 20 + 12 + 14 + 18 + 6 = 70
    assert unified_score(scores) == 70
    assert unified_score({k: 100 for k in scores}) == 100


def test_build_provenance_fields() -> None:
    csv = b"gender,approved\nf,1\nm,0\n"
    model = b"pickled-model-bytes"
    prov = build_provenance(
        df_bytes=csv,
        filename="loans.csv",
        n_rows=2,
        columns=["gender", "approved"],
        sensitive_cols=["gender"],
        target_col="approved",
        domain="loan",
        metric_weights={"dpd": 0.5, "eod": 0.5},
        model_used="user_provided",
        model_bytes=model,
        rigour_config=default_config(),
        generated_at="2026-11-01T00:00:00Z",
    )
    assert prov["input"]["sha256"] == sha256_hex(csv)
    assert prov["input"]["size_bytes"] == len(csv)
    assert prov["input"]["n_rows"] == 2 and prov["input"]["n_columns"] == 2
    assert prov["model"] == {"used": "user_provided", "sha256": sha256_hex(model)}
    assert prov["config"]["statistical_rigour"]["seed"] == default_config()["seed"]
    assert prov["config"]["unified_score_weights"] == UNIFIED_SCORE_WEIGHTS
    assert prov["versions"]["metrics"] == METRIC_VERSIONS
    assert prov["versions"]["libraries"]["numpy"]
    assert prov["generated_at"] == "2026-11-01T00:00:00Z"
    json.dumps(prov)  # serialisable


def test_trained_model_has_no_model_hash() -> None:
    prov = build_provenance(
        df_bytes=b"x\n1\n",
        filename="a.csv",
        n_rows=1,
        columns=["x"],
        sensitive_cols=[],
        target_col="x",
        domain="general",
        metric_weights={},
        model_used="tuned_logreg",
    )
    assert prov["model"]["sha256"] is None


def test_original_name_from_stored() -> None:
    hexid = "0123456789abcdef0123456789abcdef"
    assert original_name_from_stored(f"local://users/u/datasets/{hexid}_demo_loan.csv") == "demo_loan.csv"
    assert original_name_from_stored(f"gs://b/users/u/datasets/{hexid}_a_b.csv") == "a_b.csv"
    # No uuid prefix (or not 32 hex chars): returned unchanged.
    assert original_name_from_stored("demo_loan.csv") == "demo_loan.csv"
    assert original_name_from_stored("abc_demo_loan.csv") == "abc_demo_loan.csv"
    assert original_name_from_stored(f"{hexid.upper()}_x.csv") == f"{hexid.upper()}_x.csv"


def test_display_name_strips_client_paths() -> None:
    assert display_name("C:\\Users\\me\\loans.csv") == "loans.csv"
    assert display_name("../../etc/loans.csv") == "loans.csv"
    assert display_name(None) == "upload.csv"
    assert display_name("") == "upload.csv"


def test_provenance_records_original_and_stored_names() -> None:
    prov = build_provenance(
        df_bytes=b"x\n1\n",
        filename="loans.csv",
        stored_name="0123456789abcdef0123456789abcdef_loans.csv",
        n_rows=1,
        columns=["x"],
        sensitive_cols=[],
        target_col="x",
        domain="general",
        metric_weights={},
        model_used="tuned_logreg",
    )
    assert prov["input"]["filename"] == "loans.csv"
    assert prov["input"]["stored_name"].endswith("_loans.csv")
    assert prov["schema_version"] == "1.4.0"
