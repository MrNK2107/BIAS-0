from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score

from .common import build_classifier, fairness_gaps, fairness_score_from_gaps, prepare_split


def _minority_group(series: pd.Series) -> str:
    return str(series.value_counts().idxmin())


def run_stress_tests(df: pd.DataFrame, model, sensitive_cols: list[str], target_col: str) -> dict[str, Any]:
    prepared = prepare_split(df, target_col)
    pipeline = model or build_classifier(prepared.X_train, model_type="rf")
    pipeline.fit(prepared.X_train, prepared.y_train)
    baseline_pred = pd.Series(pipeline.predict(prepared.X_test), index=prepared.y_test.index)
    baseline_accuracy = float(accuracy_score(prepared.y_test, baseline_pred))
    baseline_gaps = fairness_gaps(baseline_pred, prepared.y_test, df.loc[prepared.y_test.index, sensitive_cols[0]]) if sensitive_cols else {"demographic_parity_difference": 0.0, "equal_opportunity_difference": 0.0, "fpr_gap": 0.0}
    baseline_score = fairness_score_from_gaps(baseline_gaps)

    scenarios: list[dict[str, Any]] = []
    minority_source = df[sensitive_cols[0]] if sensitive_cols else df[target_col]
    minority_value = _minority_group(minority_source)

    scenario_names = [
        ("Under-sampling minority group (70%)", "undersample"),
        ("Label noise on minority group (10%)", "label_noise"),
        ("Distribution shift on minority income (-20%)", "shift"),
    ]
    for name, scenario_type in scenario_names:
        modified_df = df.copy()
        if scenario_type == "undersample" and sensitive_cols:
            mask = modified_df[sensitive_cols[0]].astype(str) == minority_value
            drop_index = modified_df[mask].sample(frac=0.7, random_state=42).index
            modified_df = modified_df.drop(index=drop_index)
        elif scenario_type == "label_noise" and sensitive_cols:
            mask = modified_df[sensitive_cols[0]].astype(str) == minority_value
            sample_index = modified_df[mask].sample(frac=0.1, random_state=42).index
            modified_df.loc[sample_index, target_col] = 1 - modified_df.loc[sample_index, target_col]
        elif scenario_type == "shift":
            income_cols = [col for col in modified_df.columns if "income" in col.lower()]
            if income_cols and sensitive_cols:
                mask = modified_df[sensitive_cols[0]].astype(str) == minority_value
                modified_df.loc[mask, income_cols[0]] = modified_df.loc[mask, income_cols[0]] * 0.8

        scenario_split = prepare_split(modified_df, target_col)
        scenario_model = build_classifier(scenario_split.X_train, model_type="rf")
        scenario_model.fit(scenario_split.X_train, scenario_split.y_train)
        scenario_pred = pd.Series(scenario_model.predict(scenario_split.X_test), index=scenario_split.y_test.index)
        scenario_accuracy = float(accuracy_score(scenario_split.y_test, scenario_pred))
        scenario_gaps = fairness_gaps(scenario_pred, scenario_split.y_test, modified_df.loc[scenario_split.y_test.index, sensitive_cols[0]]) if sensitive_cols else {"demographic_parity_difference": 0.0, "equal_opportunity_difference": 0.0, "fpr_gap": 0.0}
        scenario_score = fairness_score_from_gaps(scenario_gaps)
        fairness_drop = round(baseline_score - scenario_score)
        scenarios.append(
            {
                "name": name,
                "fairness_score": round(scenario_score),
                "accuracy": round(scenario_accuracy, 4),
                "fairness_drop": fairness_drop,
                "fragile": fairness_drop > 20,
                "note": f"Fairness dropped {fairness_drop} points under {name.lower()}.",
                "baseline_fairness_score": round(baseline_score),
                "baseline_accuracy": round(baseline_accuracy, 4),
            }
        )

    overall_fragility = "High" if any(item["fragile"] for item in scenarios) else "Medium" if any(item["fairness_drop"] > 10 for item in scenarios) else "Low"
    return {"baseline": {"fairness_score": round(baseline_score), "accuracy": round(baseline_accuracy, 4)}, "scenarios": scenarios, "overall_fragility": overall_fragility}
