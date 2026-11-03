from __future__ import annotations

import os
from typing import Any

import pandas as pd
from joblib import parallel_backend
from sklearn.model_selection import GridSearchCV, train_test_split
from sklearn.pipeline import Pipeline

from .models import build_classifier

RF_GRID = {
    "model__n_estimators": [100, 200],
    "model__max_depth": [None, 10, 20],
    "model__min_samples_leaf": [1, 4],
}

# 72 -> 16 combos: the full grid took ~45 s of a ~130 s 5000-row run and its
# winner scored the same held-out accuracy (0.797 vs RF 0.795) on demo_loan.
XGB_GRID = {
    "model__n_estimators": [100, 150],
    "model__max_depth": [4, 6],
    "model__learning_rate": [0.05, 0.1],
    "model__subsample": [0.8, 1.0],
    "model__colsample_bytree": [0.8],
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


def _thread_split() -> tuple[int, int]:
    """Split cores between concurrent grid candidates and each model's own
    threads so the two levels of parallelism don't oversubscribe the CPU."""
    # BIAS_MAX_CORES caps total threads (e.g. on a shared machine).
    cores = int(os.environ.get("BIAS_MAX_CORES") or 0) or os.cpu_count() or 2
    search_jobs = max(1, min(4, cores // 2))
    return search_jobs, max(1, cores // search_jobs)


def _set_model_threads(pipe: Pipeline, model_type: str, n_threads: int) -> None:
    if model_type in ("rf", "xgb"):
        pipe.set_params(model__n_jobs=n_threads)


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

    search_jobs, model_threads = _thread_split()

    for mt in model_types:
        pipe = build_classifier(X_train, model_type=mt)
        _set_model_threads(pipe, mt, model_threads)
        grid = _grid_for(mt)

        gs = GridSearchCV(
            pipe,
            grid,
            cv=3,
            scoring=scoring,
            n_jobs=search_jobs,
            refit=True,
            error_score="raise",
        )
        # Threads, not loky processes: this runs inside the API server, where
        # spawning one worker process per core re-imported the ML stack in each,
        # and those workers either hung in xgboost's CUDA probe (see
        # core/__init__.py) or died with "WinError 6: handle is invalid".
        # sklearn/xgboost fits release the GIL, so threads scale fine.
        with parallel_backend("threading", n_jobs=search_jobs):
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
