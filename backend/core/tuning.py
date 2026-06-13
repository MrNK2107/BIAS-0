from __future__ import annotations

from typing import Any

import pandas as pd
from sklearn.model_selection import GridSearchCV, train_test_split
from sklearn.pipeline import Pipeline

from .models import build_classifier

RF_GRID = {
    "model__n_estimators": [100, 200],
    "model__max_depth": [None, 10, 20],
    "model__min_samples_leaf": [1, 4],
}

XGB_GRID = {
    "model__n_estimators": [50, 100, 150],
    "model__max_depth": [4, 6, 8],
    "model__learning_rate": [0.05, 0.1],
    "model__subsample": [0.8, 1.0],
    "model__colsample_bytree": [0.8, 1.0],
}

LINEAR_GRID = {
    "model__C": [0.1, 1.0, 10.0],
    "model__penalty": ["l2"],
}


def _grid_for(model_type: str) -> dict[str, list[Any]]:
    if model_type == "rf":
        return RF_GRID
    if model_type == "xgb":
        return XGB_GRID
    return LINEAR_GRID


def train_best_model(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    model_types: list[str] | None = None,
) -> tuple[Pipeline, str]:
    """Train multiple model types with hyperparameter tuning, pick best by
    held-out validation F1, then refit the winner on all training data.

    Returns (trained_pipeline, model_name).
    """
    if model_types is None:
        model_types = ["rf", "xgb"]

    n_classes = y_train.nunique()
    scoring = "f1_macro" if n_classes > 2 else "f1"

    X_tr, X_val, y_tr, y_val = train_test_split(
        X_train, y_train, test_size=0.2, random_state=42, stratify=y_train,
    )

    best_score: float = -1.0
    best_name: str = ""
    best_params: dict[str, Any] = {}

    for mt in model_types:
        pipe = build_classifier(X_train, model_type=mt)
        grid = _grid_for(mt)

        gs = GridSearchCV(
            pipe,
            grid,
            cv=3,
            scoring=scoring,
            n_jobs=-1,
            refit=True,
            error_score="raise",
        )
        gs.fit(X_tr, y_tr)

        val_score = gs.score(X_val, y_val)
        if val_score > best_score:
            best_score = val_score
            best_name = mt
            best_params = gs.best_params_

    best_pipe = build_classifier(X_train, model_type=best_name)
    best_pipe.set_params(**best_params)
    best_pipe.fit(X_train, y_train)

    return best_pipe, best_name
