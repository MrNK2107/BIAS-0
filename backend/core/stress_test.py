from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score

from .common import (
    bootstrap_fairness_gaps,
    build_and_fit_default,
    fairness_gaps,
    fairness_score_from_gaps,
    normalize_target_binary,
    prepare_split,
)
from .metrics import ZERO_GAPS


def _minority_group(series: pd.Series) -> str:
    return str(series.value_counts().idxmin())


def _pick_first_numeric_col(
    df: pd.DataFrame, hints: tuple[str, ...] = ("income", "score", "amount", "salary")
) -> str | None:
    for hint in hints:
        for col in df.columns:
            if hint in col.lower() and pd.api.types.is_numeric_dtype(df[col]):
                return col
    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col]) and col not in df.select_dtypes(
            exclude=[np.number]
        ):
            return col
    return None


def run_stress_tests(
    df: pd.DataFrame,
    model,
    sensitive_cols: list[str],
    target_col: str,
    custom_scenarios: list[dict] | None = None,
) -> dict[str, Any]:
    normalize_target_binary(df, target_col)
    prepared = prepare_split(df, target_col)
    if model is None:
        pipeline = build_and_fit_default(prepared)
    else:
        pipeline = model

    baseline_pred = pd.Series(
        pipeline.predict(prepared.X_test), index=prepared.y_test.index
    )
    baseline_accuracy = float(accuracy_score(prepared.y_test, baseline_pred))
    baseline_gaps = (
        fairness_gaps(
            baseline_pred,
            prepared.y_test,
            df.loc[prepared.y_test.index, sensitive_cols[0]],
        )
        if sensitive_cols
        else dict(ZERO_GAPS)
    )
    baseline_score = fairness_score_from_gaps(baseline_gaps)

    # Bootstrap baseline CI for comparison
    baseline_ci = {}
    if sensitive_cols and sensitive_cols[0] in df.columns:
        baseline_ci = bootstrap_fairness_gaps(
            baseline_pred,
            prepared.y_test,
            df.loc[prepared.y_test.index, sensitive_cols[0]],
        )

    scenarios: list[dict[str, Any]] = []

    if custom_scenarios:
        scenario_configs = custom_scenarios
    else:
        minority_source = df[sensitive_cols[0]] if sensitive_cols else df[target_col]
        minority_value = _minority_group(minority_source)
        shift_col = _pick_first_numeric_col(df)
        shift_label = shift_col.capitalize() if shift_col else "feature"
        scenario_configs = [
            {
                "name": "Under-sampling minority group (70%)",
                "type": "undersample",
                "target_group": minority_value,
                "sensitive_col": sensitive_cols[0] if sensitive_cols else None,
                "magnitude": 0.7,
            },
            {
                "name": "Label noise on minority group (10%)",
                "type": "label_noise",
                "target_group": minority_value,
                "sensitive_col": sensitive_cols[0] if sensitive_cols else None,
                "magnitude": 0.1,
            },
            {
                "name": f"Distribution shift on minority {shift_label} (-20%)",
                "type": "shift",
                "target_group": minority_value,
                "sensitive_col": sensitive_cols[0] if sensitive_cols else None,
                "magnitude": 0.2,
                "shift_col": shift_col,
            },
            {
                "name": "Covariate shift (global noise +10%)",
                "type": "covariate_shift",
                "magnitude": 0.1,
            },
            {
                "name": "Label flipping (random 5%)",
                "type": "label_flip_random",
                "magnitude": 0.05,
            },
        ]

    for config in scenario_configs:
        name = config.get("name", "Unnamed Scenario")
        scenario_type = config.get("type")
        target_group = str(config.get("target_group", ""))
        s_col = config.get("sensitive_col") or (
            sensitive_cols[0] if sensitive_cols else None
        )
        mag = float(config.get("magnitude", 0.5))

        modified_df = df.copy()

        if scenario_type == "undersample" and s_col and s_col in modified_df.columns:
            mask = modified_df[s_col].astype(str) == target_group
            if mask.any():
                drop_index = modified_df[mask].sample(frac=mag, random_state=42).index
                modified_df = modified_df.drop(index=drop_index)

        elif scenario_type == "label_noise" and s_col and s_col in modified_df.columns:
            mask = modified_df[s_col].astype(str) == target_group
            if mask.any():
                sample_index = modified_df[mask].sample(frac=mag, random_state=42).index
                current = modified_df.loc[sample_index, target_col]
                if pd.api.types.is_bool_dtype(current):
                    flipped = (~current).astype(int)
                elif pd.api.types.is_numeric_dtype(current):
                    flipped = (1 - current.astype(int)).values
                else:
                    flipped = (current.astype(int) ^ 1).values
                modified_df.loc[sample_index, target_col] = flipped

        elif scenario_type == "shift" and s_col and s_col in modified_df.columns:
            shift_col = config.get("shift_col") or _pick_first_numeric_col(modified_df)
            if shift_col and shift_col in modified_df.columns:
                modified_df[shift_col] = modified_df[shift_col].astype(float)
                mask = modified_df[s_col].astype(str) == target_group
                if mask.any():
                    modified_df.loc[mask, shift_col] *= 1.0 - mag

        elif scenario_type == "covariate_shift":
            # Add global Gaussian noise to all numeric features
            numeric_cols = modified_df.select_dtypes(
                include=[np.number]
            ).columns.tolist()
            for col in numeric_cols:
                if col == target_col:
                    continue
                noise = np.random.default_rng(42).normal(
                    0, mag * modified_df[col].std(), len(modified_df)
                )
                modified_df[col] = modified_df[col] + noise

        elif scenario_type == "label_flip_random":
            # Randomly flip labels on a random subset
            flip_idx = modified_df.sample(frac=mag, random_state=42).index
            current = modified_df.loc[flip_idx, target_col]
            if pd.api.types.is_bool_dtype(current):
                modified_df.loc[flip_idx, target_col] = (~current).astype(int)
            elif pd.api.types.is_numeric_dtype(current):
                modified_df.loc[flip_idx, target_col] = (1 - current.astype(int)).values
            else:
                modified_df.loc[flip_idx, target_col] = (current.astype(int) ^ 1).values

        scenario_split = prepare_split(modified_df, target_col)
        # Use the ORIGINAL model to predict on modified data.
        # This measures how the SAME model's decisions change under data shifts,
        # not how a newly-trained model would perform (which conflates retraining
        # robustness with stress sensitivity).
        scenario_pred = pd.Series(
            pipeline.predict(scenario_split.X_test),
            index=scenario_split.y_test.index,
        )
        scenario_accuracy = float(accuracy_score(scenario_split.y_test, scenario_pred))
        scenario_gaps = (
            fairness_gaps(
                scenario_pred,
                scenario_split.y_test,
                modified_df.loc[scenario_split.y_test.index, s_col],
            )
            if s_col and s_col in modified_df.columns
            else dict(ZERO_GAPS)
        )
        scenario_score = fairness_score_from_gaps(scenario_gaps)
        fairness_drop = round(baseline_score - scenario_score)

        # Statistical comparison using bootstrap overlap
        ci_overlap = False
        if baseline_ci and s_col and s_col in modified_df.columns:
            boot_scenario = bootstrap_fairness_gaps(
                scenario_pred,
                scenario_split.y_test,
                modified_df.loc[scenario_split.y_test.index, s_col],
            )
            bci = baseline_ci.get("demographic_parity_difference", {})
            sci = boot_scenario.get("demographic_parity_difference", {})
            b_lower, b_upper = bci.get("ci_lower", 0), bci.get("ci_upper", 0)
            s_lower, s_upper = sci.get("ci_lower", 0), sci.get("ci_upper", 0)
            ci_overlap = not (b_upper < s_lower or s_upper < b_lower)

        scenarios.append(
            {
                "name": name,
                "fairness_score": round(scenario_score),
                "accuracy": round(scenario_accuracy, 4),
                "fairness_drop": fairness_drop,
                "fragile": fairness_drop > 20,
                "statistically_significant": not ci_overlap if baseline_ci else None,
                "note": (
                    f"Fairness dropped {fairness_drop} points under {name.lower()}."
                    if fairness_drop > 0
                    else f"Fairness stable under {name.lower()}."
                ),
                "baseline_fairness_score": round(baseline_score),
                "baseline_accuracy": round(baseline_accuracy, 4),
            }
        )

    overall_fragility = (
        "High"
        if any(item["fragile"] for item in scenarios)
        else (
            "Medium" if any(item["fairness_drop"] > 10 for item in scenarios) else "Low"
        )
    )

    return {
        "baseline": {
            "fairness_score": round(baseline_score),
            "accuracy": round(baseline_accuracy, 4),
        },
        "scenarios": scenarios,
        "overall_fragility": overall_fragility,
    }
