from __future__ import annotations

from typing import Any

import pandas as pd
from sklearn.metrics import accuracy_score

from .common import build_classifier, fairness_gaps, fairness_score_from_gaps, prepare_split, risk_from_score


def _apply_fix(df: pd.DataFrame, fix: dict[str, Any]) -> pd.DataFrame:
    modified = df.copy()
    fix_type = fix.get("fix_type")
    description = fix.get("description", "").lower()
    if fix_type == "feature_level" and "remove" in description:
        feature = fix.get("description", "").split("Remove ")[-1].split(" from")[0]
        if feature in modified.columns:
            modified = modified.drop(columns=[feature])
    if fix_type == "data_level" and "smote" in description:
        target = modified.columns[-1]
        minority = modified[target].value_counts().idxmin()
        minority_rows = modified[modified[target] == minority]
        if not minority_rows.empty:
            augmented = minority_rows.sample(frac=0.5, replace=True, random_state=42)
            modified = pd.concat([modified, augmented], ignore_index=True)
    return modified


def run_sandbox_simulation(df: pd.DataFrame, sensitive_cols: list[str], target_col: str, fixes_to_apply: list[dict[str, Any]]) -> dict[str, Any]:
    scenarios: list[dict[str, Any]] = []

    def score_frame(frame: pd.DataFrame, name: str, notes: str) -> dict[str, Any]:
        prepared = prepare_split(frame, target_col)
        model = build_classifier(prepared.X_train, model_type="rf")
        model.fit(prepared.X_train, prepared.y_train)
        y_pred = pd.Series(model.predict(prepared.X_test), index=prepared.y_test.index)
        accuracy = float(accuracy_score(prepared.y_test, y_pred))
        gaps = fairness_gaps(y_pred, prepared.y_test, frame.loc[prepared.y_test.index, sensitive_cols[0]]) if sensitive_cols else {"demographic_parity_difference": 0.0, "equal_opportunity_difference": 0.0, "fpr_gap": 0.0}
        fairness_score = fairness_score_from_gaps(gaps)
        return {
            "name": name,
            "accuracy": round(accuracy, 4),
            "fairness_score": round(fairness_score),
            "risk_level": risk_from_score(fairness_score),
            "notes": notes,
        }

    scenarios.append(score_frame(df, "Original", "Baseline"))
    for fix in fixes_to_apply:
        modified = _apply_fix(df, fix)
        scenarios.append(score_frame(modified, fix.get("description", fix.get("fix_id", "Scenario")), fix.get("estimated_impact", "Simulated fix")))

    best = max(scenarios, key=lambda item: item["fairness_score"])
    recommendation = f"{best['name']} offers the best fairness score among the simulated options."
    return {"scenarios": scenarios, "recommendation": recommendation}
