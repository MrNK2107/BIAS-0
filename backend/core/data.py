from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

# ── Helpers ────────────────────────────────────────────────────────────────


def _drop_nan(*series: pd.Series) -> list[pd.Series]:
    mask = pd.Series(True, index=series[0].index)
    for s in series:
        mask &= s.notna()
    return [s[mask] for s in series]


@dataclass
class PreparedData:
    X_train: pd.DataFrame
    X_test: pd.DataFrame
    y_train: pd.Series
    y_test: pd.Series
    feature_columns: list[str]
    numeric_features: list[str]
    categorical_features: list[str]


def normalize_target_binary(df: pd.DataFrame, target_col: str) -> pd.DataFrame:
    """Convert target column to binary 0/1 int in-place.

    Handles:
      - string targets like 'yes'/'no', 'approved'/'rejected', 'true'/'false'
      - boolean True/False
      - numeric targets that are already 0/1 or similar
    Non-binary (multi-class, continuous) targets are mapped via threshold at median.
    """
    if target_col not in df.columns:
        return df

    s = df[target_col]
    if pd.api.types.is_bool_dtype(s):
        df[target_col] = s.astype(int)
        return df

    if pd.api.types.is_numeric_dtype(s):
        unique = s.dropna().unique()
        if set(unique) <= {0, 1} or set(unique) <= {0.0, 1.0}:
            df[target_col] = s.astype(int)
            return df
        if unique.size > 2:
            median_val = float(s.median())
            df[target_col] = (s > median_val).astype(int)
            return df
        df[target_col] = s.astype(int)
        return df

    # String / categorical target
    str_s = s.astype(str).str.strip().str.lower()
    truthy = {
        "yes",
        "y",
        "true",
        "t",
        "1",
        "approved",
        "hired",
        "accepted",
        "pass",
        "positive",
        "1.0",
    }
    falsy = {
        "no",
        "n",
        "false",
        "f",
        "0",
        "rejected",
        "not_hired",
        "denied",
        "fail",
        "negative",
        "0.0",
    }
    if str_s.isin(truthy | falsy).all():
        df[target_col] = str_s.isin(truthy).astype(int)
        return df

    codes, uniques = pd.factorize(str_s)
    if len(uniques) == 2:
        df[target_col] = codes
        return df

    median_code = float(np.median(codes))
    df[target_col] = (codes > median_code).astype(int)
    return df


def encode_sensitive_series(series: pd.Series) -> pd.Series:
    if pd.api.types.is_numeric_dtype(series):
        return series.astype(float)
    codes, _ = pd.factorize(series.astype(str), sort=True)
    return pd.Series(codes, index=series.index, dtype=float)


def infer_numeric_and_categorical(
    df: pd.DataFrame, sensitive_cols: list[str], target_col: str
) -> tuple[list[str], list[str]]:
    feature_cols = [col for col in df.columns if col != target_col]
    numeric_features = [
        col for col in feature_cols if pd.api.types.is_numeric_dtype(df[col])
    ]
    categorical_features = [col for col in feature_cols if col not in numeric_features]
    return numeric_features, categorical_features


def make_feature_frame(df: pd.DataFrame, target_col: str) -> pd.DataFrame:
    return df.drop(columns=[target_col]).copy()


def prepare_split(
    df: pd.DataFrame, target_col: str, random_state: int = 42
) -> PreparedData:
    feature_columns = [col for col in df.columns if col != target_col]
    X = df[feature_columns].copy()
    y = df[target_col].copy()
    numeric_features = [
        col for col in X.columns if pd.api.types.is_numeric_dtype(X[col])
    ]
    categorical_features = [col for col in X.columns if col not in numeric_features]

    test_size = 0.2
    if len(df) < 5:
        test_size = 0.5
    if len(df) < 2:
        return PreparedData(
            X, X, y, y, feature_columns, numeric_features, categorical_features
        )

    if y.nunique() > 1:
        min_class_count = y.value_counts().min()
        if min_class_count < 2:
            X_train, X_test, y_train, y_test = train_test_split(
                X,
                y,
                test_size=test_size,
                random_state=random_state,
            )
        else:
            X_train, X_test, y_train, y_test = train_test_split(
                X,
                y,
                test_size=test_size,
                random_state=random_state,
                stratify=y,
            )
    else:
        X_train, X_test, y_train, y_test = train_test_split(
            X,
            y,
            test_size=test_size,
            random_state=random_state,
        )

    return PreparedData(
        X_train,
        X_test,
        y_train,
        y_test,
        feature_columns,
        numeric_features,
        categorical_features,
    )
