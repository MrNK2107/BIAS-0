from __future__ import annotations

from pathlib import Path

import pandas as pd

from core.data_audit import run_data_audit
from core.feature_intelligence import detect_proxy_features
from core.model_bias import run_model_bias_analysis
from utils.synthetic_data import generate_loan_dataset


def test_audit_and_proxy_and_bias():
    df = generate_loan_dataset(rows=1000)
    audit = run_data_audit(df, ["gender", "caste"], "approved")
    assert audit["risk_level"] == "Red"
    assert audit["group_stats"]["gender"]
    proxy = detect_proxy_features(df, ["gender", "caste"])
    assert proxy["proxy_features"]
    bias = run_model_bias_analysis(df, ["gender", "caste"], "approved")
    assert bias["fairness_score"] < 50
