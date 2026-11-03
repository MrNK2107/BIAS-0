from __future__ import annotations

from typing import Any

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBClassifier

logger = __import__("logging").getLogger(__name__)

# High-cardinality categoricals (e.g. a 5000-row file with ~3000 distinct
# zip_codes) used to one-hot into thousands of near-unique columns, which made
# tuning/SHAP slow and added mostly noise. Keep at most this many columns per
# categorical: the most frequent categories seen in *training* data (the
# encoder is fit inside the pipeline, so nothing leaks from test rows), with
# everything rarer -- and unseen test values -- pooled into one
# "<col>_infrequent_sklearn" column. Low-cardinality columns are unaffected.
MAX_ONEHOT_CATEGORIES: int | None = 20


def make_onehot_encoder() -> OneHotEncoder:
    if MAX_ONEHOT_CATEGORIES is None:
        return OneHotEncoder(handle_unknown="ignore", sparse_output=False)
    return OneHotEncoder(
        handle_unknown="infrequent_if_exist",
        max_categories=MAX_ONEHOT_CATEGORIES,
        sparse_output=False,
    )


def _recommend_model_type(
    X_train: pd.DataFrame, y_train: pd.Series
) -> str:
    """Choose RF or XGBoost based on dataset characteristics. Linear is never
    the default — it's included only when the user explicitly asks for comparison."""
    n_rows = X_train.shape[0]
    n_numeric = sum(
        1 for c in X_train.columns if pd.api.types.is_numeric_dtype(X_train[c])
    )
    n_cat = X_train.shape[1] - n_numeric
    n_classes = y_train.nunique()
    if n_classes > 2:
        return "rf"
    if n_rows < 500:
        return "rf"
    if n_cat > 50:
        return "rf"
    return "xgb"


def build_and_fit_default(prepared) -> Pipeline:
    """Build a classifier (auto-detected best type) and fit it on prepared data."""
    model_type = _recommend_model_type(prepared.X_train, prepared.y_train)
    logger.info("build_and_fit_default selected model_type=%s", model_type)
    pipe = build_classifier(prepared.X_train, model_type=model_type)
    pipe.fit(prepared.X_train, prepared.y_train)
    return pipe


def build_classifier(X_train: pd.DataFrame, model_type: str = "rf") -> Pipeline:
    """Build a classifier pipeline. Supports 'rf', 'linear', 'xgb'."""
    numeric_features = [
        col for col in X_train.columns if pd.api.types.is_numeric_dtype(X_train[col])
    ]
    categorical_features = [
        col for col in X_train.columns if col not in numeric_features
    ]

    numeric_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    categorical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", make_onehot_encoder()),
        ]
    )
    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric_pipeline, numeric_features),
            ("cat", categorical_pipeline, categorical_features),
        ],
        remainder="drop",
    )

    if model_type == "linear":
        estimator: Any = LogisticRegression(max_iter=1000, class_weight="balanced")
    elif model_type == "xgb":
        estimator = XGBClassifier(
            n_estimators=50,
            random_state=42,
            eval_metric="logloss",
            verbosity=0,
        )
    else:
        estimator = RandomForestClassifier(
            n_estimators=100,
            random_state=42,
            n_jobs=-1,
            class_weight="balanced_subsample",
        )

    return Pipeline(steps=[("preprocessor", preprocessor), ("model", estimator)])


def train_multiple_models(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    model_types: list[str] | None = None,
) -> dict[str, Pipeline]:
    """Train multiple model types on the same data and return a dict of trained pipelines."""
    if model_types is None:
        model_types = ["rf", "linear", "xgb"]
    models: dict[str, Pipeline] = {}
    for mt in model_types:
        try:
            pipe = build_classifier(X_train, model_type=mt)
            pipe.fit(X_train, y_train)
            models[mt] = pipe
        except Exception as exc:
            logger.warning("Failed to train model '%s': %s", mt, str(exc))
    return models
