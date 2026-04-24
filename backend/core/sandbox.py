from __future__ import annotations

from typing import Any

import pandas as pd
from sklearn.metrics import accuracy_score

from .common import build_classifier, fairness_gaps, fairness_score_from_gaps, prepare_split, risk_from_score


def _apply_fix(df: pd.DataFrame, fix: dict[str, Any], sensitive_cols: list[str], target_col: str) -> tuple[pd.DataFrame, Any]:
    modified = df.copy()
    model_override = None
    fix_type = fix.get("fix_type")
    description = fix.get("description", "").lower()
    
    if fix_type == "feature_level" and "remove" in description:
        # Use fix_id which has format "remove_{feature_name}"
        fix_id = fix.get("fix_id", "")
        if fix_id.startswith("remove_"):
            feature_pattern = fix_id.replace("remove_", "").replace("_", " ")
            # Find the actual column name by case-insensitive match
            feature = next(
                (col for col in modified.columns 
                 if col.lower().replace(" ","_") == feature_pattern.lower().replace(" ","_")),
                None
            )
            if feature and feature in modified.columns:
                modified = modified.drop(columns=[feature])
    elif fix_type == "data_level" and "smote" in description:
        from imblearn.over_sampling import SMOTE
        from sklearn.preprocessing import LabelEncoder
        
        target = modified.columns[-1]
        X_mod = modified.drop(columns=[target])
        y_mod = modified[target]
        
        # Encode categoricals for SMOTE
        encoders = {}
        for col in X_mod.select_dtypes(include="object").columns:
            le = LabelEncoder()
            X_mod[col] = le.fit_transform(X_mod[col].astype(str))
            encoders[col] = le
        
        smote = SMOTE(random_state=42)
        X_resampled, y_resampled = smote.fit_resample(X_mod, y_mod)
        modified = pd.DataFrame(X_resampled, columns=X_mod.columns)
        modified[target] = y_resampled
        
        # Decode categoricals back
        for col, le in encoders.items():
            modified[col] = le.inverse_transform(modified[col].astype(int))
    elif fix_type == "model_level" and "constrained" in description:
        from fairlearn.reductions import ExponentiatedGradient, DemographicParity
        from sklearn.tree import DecisionTreeClassifier
        
        constraint = DemographicParity()
        base_estimator = DecisionTreeClassifier(max_depth=4)
        mitigator = ExponentiatedGradient(base_estimator, constraint)
        
        prepared = prepare_split(modified, target_col)
        sensitive_feature = modified.loc[prepared.X_train.index, sensitive_cols[0]]
        mitigator.fit(prepared.X_train, prepared.y_train, sensitive_features=sensitive_feature)
        model_override = mitigator
        
    return modified, model_override


def _apply_threshold_tuning(df: pd.DataFrame, sensitive_cols: list[str], target_col: str, 
                             prepared: Any, pipeline: Any) -> tuple[pd.Series, dict[str, float]]:
    from sklearn.metrics import roc_curve
    
    thresholds = {}
    for group_val in df[sensitive_cols[0]].astype(str).unique():
        mask = df.loc[prepared.X_test.index, sensitive_cols[0]].astype(str) == group_val
        group_X = prepared.X_test[mask]
        group_y = prepared.y_test[mask]
        if group_X.empty:
            thresholds[group_val] = 0.5
            continue
        probs = pipeline.predict_proba(group_X)[:, 1]
        fpr, tpr, thresh = roc_curve(group_y, probs)
        # Pick threshold that maximises TPR - FPR (Youden's J)
        j_scores = tpr - fpr
        best_idx = j_scores.argmax()
        thresholds[group_val] = float(thresh[best_idx])
    
    # Re-predict using per-group thresholds
    all_probs = pipeline.predict_proba(prepared.X_test)[:, 1]
    y_pred_adjusted = pd.Series(index=prepared.y_test.index, dtype=int)
    for group_val, threshold in thresholds.items():
        mask = df.loc[prepared.y_test.index, sensitive_cols[0]].astype(str) == group_val
        y_pred_adjusted[mask] = (all_probs[mask.values] >= threshold).astype(int)
    return y_pred_adjusted, thresholds


def run_sandbox_simulation(
    df: pd.DataFrame,
    sensitive_cols: list[str],
    target_col: str,
    fixes_to_apply: list[dict[str, Any]],
    metric_weights: dict[str, float] | None = None,
) -> dict[str, Any]:
    scenarios: list[dict[str, Any]] = []

    def score_frame(frame: pd.DataFrame, name: str, notes: str, model_override: Any = None) -> dict[str, Any]:
        prepared = prepare_split(frame, target_col)
        if model_override:
            y_pred = pd.Series(model_override.predict(prepared.X_test), index=prepared.y_test.index)
        else:
            model = build_classifier(prepared.X_train, model_type="rf")
            model.fit(prepared.X_train, prepared.y_train)
            y_pred = pd.Series(model.predict(prepared.X_test), index=prepared.y_test.index)
            
        accuracy = float(accuracy_score(prepared.y_test, y_pred))
        gaps = fairness_gaps(y_pred, prepared.y_test, frame.loc[prepared.y_test.index, sensitive_cols[0]]) if sensitive_cols else {"demographic_parity_difference": 0.0, "equal_opportunity_difference": 0.0, "fpr_gap": 0.0}
        fairness_score = fairness_score_from_gaps(gaps, metric_weights=metric_weights)
        return {
            "name": name,
            "accuracy": round(accuracy, 4),
            "fairness_score": round(fairness_score),
            "risk_level": risk_from_score(fairness_score),
            "notes": notes,
        }

    scenarios.append(score_frame(df, "Original", "Baseline"))
    for fix in fixes_to_apply:
        if fix.get("fix_id") == "threshold_tune":
            continue
        modified, model_override = _apply_fix(df, fix, sensitive_cols, target_col)
        scenarios.append(score_frame(modified, fix.get("description", fix.get("fix_id", "Scenario")), fix.get("estimated_impact", "Simulated fix"), model_override=model_override))

    # Add threshold tuning scenario if requested
    if any(f.get("fix_id") == "threshold_tune" for f in fixes_to_apply):
        prepared = prepare_split(df, target_col)
        model = build_classifier(prepared.X_train, model_type="rf")
        model.fit(prepared.X_train, prepared.y_train)
        y_pred_tuned, _ = _apply_threshold_tuning(df, sensitive_cols, target_col, prepared, model)
        
        accuracy = float(accuracy_score(prepared.y_test, y_pred_tuned))
        gaps = fairness_gaps(y_pred_tuned, prepared.y_test, df.loc[prepared.y_test.index, sensitive_cols[0]]) if sensitive_cols else {"demographic_parity_difference": 0.0, "equal_opportunity_difference": 0.0, "fpr_gap": 0.0}
        fairness_score = fairness_score_from_gaps(gaps, metric_weights=metric_weights)
        scenarios.append({
            "name": "Threshold Tuning",
            "accuracy": round(accuracy, 4),
            "fairness_score": round(fairness_score),
            "risk_level": risk_from_score(fairness_score),
            "notes": "Post-processing optimization for per-group parity.",
        })

    best = max(scenarios, key=lambda item: item["fairness_score"])
    recommendation = f"{best['name']} offers the best fairness score among the simulated options."
    return {"scenarios": scenarios, "recommendation": recommendation}
