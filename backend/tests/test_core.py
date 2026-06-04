from __future__ import annotations

import pandas as pd

from core.common import (
    build_classifier,
    fairness_gaps,
    fairness_score_from_gaps,
    group_metrics,
    prepare_split,
    risk_from_gap,
    risk_from_score,
    encode_sensitive_series,
    infer_numeric_and_categorical,
)
from core.counterfactual import run_counterfactual_test
from core.data_audit import run_data_audit
from core.explainability import explain_flagged_decisions, generate_narrative_summary
from core.feature_intelligence import detect_proxy_features
from core.model_bias import run_model_bias_analysis
from core.stress_test import run_stress_tests
from core.auto_fix import generate_fix_recommendations
from core.sandbox import run_sandbox_simulation
from core.monitoring import detect_data_drift, check_alert_condition
from utils.synthetic_data import generate_loan_dataset


# ── Fixtures ────────────────────────────────────────────────────────────────


def _small_loan_df() -> pd.DataFrame:
    return generate_loan_dataset(rows=200)


def _build_model(df: pd.DataFrame, target_col: str = "approved"):
    prep = prepare_split(df, target_col)
    model = build_classifier(prep.X_train, model_type="rf")
    model.fit(prep.X_train, prep.y_train)
    return model, prep


# ── Common Utilities ────────────────────────────────────────────────────────


def test_risk_from_gap():
    assert risk_from_gap(0.5) == "Red"
    assert risk_from_gap(0.3) == "Yellow"
    assert risk_from_gap(0.1) == "Green"
    assert risk_from_gap(0.0) == "Green"


def test_risk_from_score():
    assert risk_from_score(80) == "Green"
    assert risk_from_score(75) == "Green"
    assert risk_from_score(60) == "Yellow"
    assert risk_from_score(30) == "Red"


def test_encode_sensitive_series():
    s = pd.Series(["a", "b", "a", "c"])
    encoded = encode_sensitive_series(s)
    assert encoded.dtype == float
    assert encoded.iloc[0] == encoded.iloc[2]
    assert encoded.iloc[1] != encoded.iloc[3]


def test_infer_numeric_and_categorical():
    df = pd.DataFrame({"num": [1, 2], "cat": ["x", "y"], "target": [0, 1]})
    num, cat = infer_numeric_and_categorical(df, [], "target")
    assert "num" in num
    assert "cat" in cat
    assert "target" not in num
    assert "target" not in cat


def test_fairness_gaps():
    y_true = pd.Series([1, 0, 1, 0, 1])
    y_pred = pd.Series([1, 0, 0, 0, 1])
    group = pd.Series(["a", "a", "b", "b", "b"])
    gaps = fairness_gaps(y_pred, y_true, group)
    assert "demographic_parity_difference" in gaps
    assert "equal_opportunity_difference" in gaps
    assert "fpr_gap" in gaps
    assert "fnr_gap" in gaps
    assert all(0.0 <= v <= 1.0 for v in gaps.values())


def test_fairness_score_from_gaps():
    gaps_high = {"demographic_parity_difference": 0.9, "equal_opportunity_difference": 0.9, "fpr_gap": 0.9, "fnr_gap": 0.9}
    assert fairness_score_from_gaps(gaps_high) < 50
    gaps_low = {"demographic_parity_difference": 0.0, "equal_opportunity_difference": 0.0, "fpr_gap": 0.0, "fnr_gap": 0.0}
    assert fairness_score_from_gaps(gaps_low) == 100.0


def test_group_metrics():
    y_true = pd.Series([1, 0, 1, 0, 1])
    y_pred = pd.Series([1, 0, 1, 0, 1])
    group = pd.Series(["a", "a", "b", "b", "b"])
    metrics = group_metrics(y_true, y_pred, group)
    assert "a" in metrics
    assert "b" in metrics
    assert "approval_rate" in metrics["a"]
    assert "tpr" in metrics["a"]


# ── Data Audit ──────────────────────────────────────────────────────────────


def test_run_data_audit_returns_expected_structure():
    df = _small_loan_df()
    result = run_data_audit(df, ["gender", "caste"], "approved")
    assert result["risk_level"] in ("Green", "Yellow", "Red")
    assert result["group_stats"]["gender"]
    assert len(result["group_stats"]) == 2
    assert "max_gap" in result
    assert result["max_gap"] >= 0.0


def test_run_data_audit_missing_target():
    df = _small_loan_df()
    result = run_data_audit(df, ["gender"], "nonexistent_col")
    assert result["risk_level"] == "Green"


def test_run_data_audit_empty_sensitive():
    df = _small_loan_df()
    result = run_data_audit(df, [], "approved")
    assert result["risk_level"] in ("Green", "Yellow", "Red")
    assert result["group_stats"] == {}


# ── Proxy Detection ─────────────────────────────────────────────────────────


def test_detect_proxy_features_returns_proxies():
    df = _small_loan_df()
    result = detect_proxy_features(df, ["gender", "caste"])
    assert "proxy_features" in result
    assert "safe_features" in result
    assert "proxy_score" in result
    assert len(result["proxy_features"]) > 0


def test_detect_proxy_features_no_sensitive():
    df = _small_loan_df()
    result = detect_proxy_features(df, [])
    assert result["proxy_score"] == 0.0


# ── Model Bias ──────────────────────────────────────────────────────────────


def test_model_bias_returns_all_metrics():
    df = generate_loan_dataset(rows=500)
    result = run_model_bias_analysis(df, ["gender", "caste"], "approved")
    assert result["fairness_score"] < 50
    assert result["overall_accuracy"] > 0.3
    assert "demographic_parity_difference" in result["metrics"]
    assert "group_performance" in result
    assert "hidden_bias" in result


def test_model_bias_with_prebuilt_model():
    df = generate_loan_dataset(rows=500)
    model, _ = _build_model(df)
    result = run_model_bias_analysis(df, ["gender", "caste"], "approved", model=model)
    assert result["fairness_score"] is not None


# ── Counterfactual ──────────────────────────────────────────────────────────


def test_counterfactual_returns_flip_rate():
    df = _small_loan_df()
    result = run_counterfactual_test(df, None, "gender", "approved")
    assert "flip_rate" in result
    assert "counterfactual_fairness_score" in result
    assert "flip_breakdown" in result
    assert 0 <= result["flip_rate"] <= 1


def test_counterfactual_with_prebuilt_model():
    df = _small_loan_df()
    model, _ = _build_model(df)
    result = run_counterfactual_test(df, model, "gender", "approved")
    assert result["flip_rate"] is not None


# ── Stress Test ─────────────────────────────────────────────────────────────


def test_stress_test_returns_scenarios():
    df = _small_loan_df()
    result = run_stress_tests(df, None, ["gender"], "approved")
    assert "scenarios" in result
    assert "overall_fragility" in result
    assert len(result["scenarios"]) >= 3


def test_stress_test_with_custom_scenario():
    df = _small_loan_df()
    custom = [{"type": "undersample_minority", "target_group": "female", "magnitude": 0.3, "name": "Custom Test"}]
    result = run_stress_tests(df, None, ["gender"], "approved", custom_scenarios=custom)
    assert len(result["scenarios"]) >= 1


# ── Explainability ──────────────────────────────────────────────────────────


def test_explain_flagged_decisions_returns_explanations():
    df = _small_loan_df()
    model, _ = _build_model(df)
    explanations = explain_flagged_decisions(df, model, ["gender", "caste"], "approved", n_samples=3)
    assert len(explanations) <= 3
    if explanations:
        exp = explanations[0]
        assert "record_id" in exp
        assert "decision" in exp
        assert "top_reasons" in exp
        assert "human_explanation" in exp


def test_explain_without_model_builds_one():
    df = _small_loan_df()
    explanations = explain_flagged_decisions(df, None, ["gender"], "approved", n_samples=2)
    assert len(explanations) <= 2


def test_generate_narrative_summary():
    flagged = [
        {"record_id": 1, "top_reasons": [{"feature": "zip_code", "is_proxy_risk": True}]},
        {"record_id": 2, "top_reasons": [{"feature": "income", "is_proxy_risk": False}]},
    ]
    summary = generate_narrative_summary(flagged, ["gender"], "loan")
    assert "proxy" in summary.lower() or "bias" in summary.lower() or "flagged" in summary.lower()


def test_generate_narrative_summary_no_flags():
    summary = generate_narrative_summary([], ["gender"], "loan")
    assert "No flagged" in summary


# ── Auto Fix ────────────────────────────────────────────────────────────────


def test_generate_fix_recommendations_high_bias():
    audit = {"under_represented_groups": ["female"]}
    proxy = {"proxy_features": [{"feature": "zip_code", "proxy_score": 0.8}]}
    bias = {"fairness_score": 35}
    fixes = generate_fix_recommendations(audit, proxy, bias, counterfactual_score=40, stress_test_score=45, proxy_risk_score=30)
    assert len(fixes) > 0
    assert fixes[0]["fix_id"] is not None
    assert fixes[0]["type"] is not None


def test_generate_fix_recommendations_clean():
    audit = {}
    proxy = {}
    bias = {"fairness_score": 95}
    fixes = generate_fix_recommendations(audit, proxy, bias)
    assert len(fixes) > 0
    assert fixes[0]["fix_id"] is not None


# ── Sandbox ─────────────────────────────────────────────────────────────────


def test_run_sandbox_simulation_returns_scenarios():
    df = _small_loan_df().dropna()  # SMOTE requires no NaN
    fixes = generate_fix_recommendations(
        {"under_represented_groups": ["female"]},
        {"proxy_features": [{"feature": "zip_code", "proxy_score": 0.8}]},
        {"fairness_score": 35},
        proxy_risk_score=30,
    )
    result = run_sandbox_simulation(df, ["gender"], "approved", fixes[:2])
    assert "scenarios" in result
    assert len(result["scenarios"]) > 0
    assert "recommendation" in result


def test_run_sandbox_simulation_with_threshold_tune():
    df = _small_loan_df().dropna()
    fixes = [{"fix_id": "threshold_tune", "fix_type": "policy_level", "description": "Threshold tuning"}]
    result = run_sandbox_simulation(df, ["gender"], "approved", fixes)
    assert any(s["name"] == "Threshold Tuning" for s in result["scenarios"])


# ── Monitoring ──────────────────────────────────────────────────────────────


def test_detect_data_drift_same_data():
    df = _small_loan_df()
    result = detect_data_drift(df, df.copy(), ["gender"], "approved")
    assert "drift_alert" in result
    assert "root_cause" in result
    assert isinstance(result["drift_alert"], bool)


def test_detect_data_drift_different_data():
    baseline = _small_loan_df()
    current = _small_loan_df()
    current["income"] = current["income"] * 3
    result = detect_data_drift(baseline, current, ["gender"], "approved")
    assert result["drift_alert"] is True  # income shifted significantly


def test_check_alert_condition():
    result = check_alert_condition(50, 80)
    assert result["alert"] is True
    result2 = check_alert_condition(75, 80)
    assert result2["alert"] is False


# ── Full Pipeline Integration ───────────────────────────────────────────────


def test_audit_and_proxy_and_bias():
    df = generate_loan_dataset(rows=1000)
    audit = run_data_audit(df, ["gender", "caste"], "approved")
    assert audit["risk_level"] == "Red"
    assert audit["group_stats"]["gender"]
    proxy = detect_proxy_features(df, ["gender", "caste"])
    assert proxy["proxy_features"]
    bias = run_model_bias_analysis(df, ["gender", "caste"], "approved")
    assert bias["fairness_score"] < 50
