from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import accuracy_score, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression


RISK_LEVELS = {"Green": 75, "Yellow": 50, "Red": 0}


@dataclass
class PreparedData:
    X_train: pd.DataFrame
    X_test: pd.DataFrame
    y_train: pd.Series
    y_test: pd.Series
    feature_columns: list[str]
    numeric_features: list[str]
    categorical_features: list[str]


def risk_from_gap(gap: float) -> str:
    if gap > 0.4:
        return "Red"
    if gap >= 0.15:
        return "Yellow"
    return "Green"


def risk_from_score(score: float) -> str:
    if score >= 75:
        return "Green"
    if score >= 50:
        return "Yellow"
    return "Red"


def encode_sensitive_series(series: pd.Series) -> pd.Series:
    if pd.api.types.is_numeric_dtype(series):
        return series.astype(float)
    codes, _ = pd.factorize(series.astype(str), sort=True)
    return pd.Series(codes, index=series.index, dtype=float)


def infer_numeric_and_categorical(df: pd.DataFrame, sensitive_cols: list[str], target_col: str) -> tuple[list[str], list[str]]:
    feature_cols = [col for col in df.columns if col != target_col]
    numeric_features = [col for col in feature_cols if pd.api.types.is_numeric_dtype(df[col])]
    categorical_features = [col for col in feature_cols if col not in numeric_features]
    for col in sensitive_cols:
        if col in categorical_features:
            continue
    return numeric_features, categorical_features


def make_feature_frame(df: pd.DataFrame, target_col: str) -> pd.DataFrame:
    return df.drop(columns=[target_col]).copy()


def prepare_split(df: pd.DataFrame, target_col: str, random_state: int = 42) -> PreparedData:
    feature_columns = [col for col in df.columns if col != target_col]
    X = df[feature_columns].copy()
    y = df[target_col].copy()
    numeric_features = [col for col in X.columns if pd.api.types.is_numeric_dtype(X[col])]
    categorical_features = [col for col in X.columns if col not in numeric_features]
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=random_state,
        stratify=y if y.nunique() > 1 else None,
    )
    return PreparedData(X_train, X_test, y_train, y_test, feature_columns, numeric_features, categorical_features)


def build_classifier(X_train: pd.DataFrame, model_type: str = "rf") -> Pipeline:
    numeric_features = [col for col in X_train.columns if pd.api.types.is_numeric_dtype(X_train[col])]
    categorical_features = [col for col in X_train.columns if col not in numeric_features]
    numeric_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
        ]
    )
    categorical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]
    )
    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric_pipeline, numeric_features),
            ("cat", categorical_pipeline, categorical_features),
        ],
        remainder="drop",
    )
    estimator: Any
    if model_type == "linear":
        estimator = LogisticRegression(max_iter=1000)
    else:
        estimator = RandomForestClassifier(n_estimators=50, random_state=42, n_jobs=-1)
    return Pipeline(steps=[("preprocessor", preprocessor), ("model", estimator)])


def group_metrics(y_true: pd.Series, y_pred: pd.Series, group: pd.Series) -> dict[str, dict[str, float]]:
    output: dict[str, dict[str, float]] = {}
    for value in group.astype(str).unique():
        mask = group.astype(str) == value
        group_true = y_true[mask]
        group_pred = y_pred[mask]
        tn, fp, fn, tp = confusion_matrix(group_true, group_pred, labels=[0, 1]).ravel()
        denom_pos = max(tp + fn, 1)
        denom_neg = max(fp + tn, 1)
        output[value] = {
            "approval_rate": float(np.mean(group_pred)),
            "tpr": float(tp / denom_pos),
            "fpr": float(fp / denom_neg),
            "accuracy": float(accuracy_score(group_true, group_pred)),
        }
    return output


def fairness_gaps(y_pred: pd.Series, y_true: pd.Series, group: pd.Series) -> dict[str, float]:
    group_values = group.astype(str).unique()
    approval_rates = []
    tprs = []
    fprs = []
    fnrs = []
    for value in group_values:
        mask = group.astype(str) == value
        group_true = y_true[mask]
        group_pred = y_pred[mask]
        tn, fp, fn, tp = confusion_matrix(group_true, group_pred, labels=[0, 1]).ravel()
        approval_rates.append(float(np.mean(group_pred)))
        tprs.append(float(tp / max(tp + fn, 1)))
        fprs.append(float(fp / max(fp + tn, 1)))
        fnrs.append(float(fn / max(tp + fn, 1)))
    return {
        "demographic_parity_difference": float(max(approval_rates) - min(approval_rates)) if approval_rates else 0.0,
        "equal_opportunity_difference": float(max(tprs) - min(tprs)) if tprs else 0.0,
        "fpr_gap": float(max(fprs) - min(fprs)) if fprs else 0.0,
        "fnr_gap": float(max(fnrs) - min(fnrs)) if fnrs else 0.0,
    }


def fairness_score_from_gaps(gaps: dict[str, float], metric_weights: dict[str, float] | None = None) -> float:
    if metric_weights is None:
        metric_weights = {
            "demographic_parity_difference": 25,
            "equal_opportunity_difference": 20,
            "fpr_gap": 15,
            "fnr_gap": 15,
        }
    raw_penalty = (
        metric_weights.get("demographic_parity_difference", 25) * gaps.get("demographic_parity_difference", 0.0)
        + metric_weights.get("equal_opportunity_difference", 20) * gaps.get("equal_opportunity_difference", 0.0)
        + metric_weights.get("fpr_gap", 15) * gaps.get("fpr_gap", 0.0)
        + metric_weights.get("fnr_gap", 15) * gaps.get("fnr_gap", 0.0)
    )
    return float(max(0.0, min(100.0, 100.0 - raw_penalty)))


def top_correlated_feature(features: pd.DataFrame, sensitive_cols: list[str]) -> tuple[str | None, float]:
    best_feature = None
    best_score = 0.0
    for column in features.columns:
        if column in sensitive_cols:
            continue
        for sensitive in sensitive_cols:
            sens = features[sensitive] if sensitive in features.columns else None
            if sens is None:
                continue
            if pd.api.types.is_numeric_dtype(features[column]) and pd.api.types.is_numeric_dtype(sens):
                correlation = abs(features[column].corr(sens))
            else:
                encoded_feature = pd.factorize(features[column].astype(str))[0]
                encoded_sensitive = pd.factorize(sens.astype(str))[0]
                if encoded_feature.size == 0:
                    correlation = 0.0
                else:
                    correlation = abs(pd.Series(encoded_feature).corr(pd.Series(encoded_sensitive)))
            if correlation > best_score:
                best_score = float(correlation if pd.notna(correlation) else 0.0)
                best_feature = column
    return best_feature, best_score
