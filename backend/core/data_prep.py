from __future__ import annotations

from typing import Any

import pandas as pd
from sklearn.model_selection import train_test_split

MIN_CLASSES = 2


def ensure_valid_target(series: pd.Series, col_name: str = "target") -> None:
    if series.nunique() < MIN_CLASSES:
        raise ValueError(f"Target '{col_name}' has {series.nunique()} unique value(s); need at least 2.")
    if series.isna().any():
        raise ValueError(f"Target '{col_name}' contains NaN values.")


def balanced_train_test_split(
    X: pd.DataFrame,
    y: pd.Series,
    test_size: float = 0.3,
    random_state: int = 42,
) -> dict[str, Any]:
    ensure_valid_target(y, "target")
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=random_state, stratify=y,
    )
    return {"X_train": X_train, "X_test": X_test, "y_train": y_train, "y_test": y_test}
