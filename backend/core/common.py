"""
Backward-compatible re-exports from the new focused modules.

Prefer importing directly from the sub-modules:
  from core.data import prepare_split
  from core.models import build_classifier
  from core.metrics import fairness_gaps, group_metrics
  from core.thresholds import risk_from_score
  from core.quality import check_dataset_quality
  from core.statistics import bootstrap_fairness_gaps
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

try:
    from xgboost import XGBClassifier
    _HAS_XGB = True
except ImportError:
    _HAS_XGB = False

MIN_SUBGROUP_SIZE = 30

from .data import (
    PreparedData,
    _drop_nan,
    encode_sensitive_series,
    infer_numeric_and_categorical,
    make_feature_frame,
    normalize_target_binary,
    prepare_split,
)
from .metrics import (
    ZERO_GAPS,
    fairness_gaps,
    fairness_score_from_gaps,
    get_metric_weights,
    group_metrics,
    top_correlated_feature,
)
from .models import (
    build_and_fit_default,
    build_classifier,
    train_multiple_models,
)


def utcnow_iso() -> str:
    return datetime.utcnow().isoformat()


from .quality import (
    DatasetQualityReport,
    check_dataset_quality,
)
from .statistics import (
    bootstrap_fairness_gaps,
    permutation_fairness_pvalue,
)
from .thresholds import (
    DEFAULT_THRESHOLDS,
    DOMAIN_THRESHOLDS,
    _domain_thresholds,
    risk_from_gap,
    risk_from_score,
)

_FAVORABLE_TOKENS = {
    "approved", "approve", "approval", "yes", "y", "true", "t", "good", "accept", "accepted",
    "hire", "hired", "granted", "grant", "positive", "pass", "passed", "success", "successful",
    "eligible", "admit", "admitted", "selected", "funded", ">50k",
}
_UNFAVORABLE_TOKENS = {
    "denied", "deny", "rejected", "reject", "no", "n", "false", "f", "bad", "decline",
    "declined", "fail", "failed", "negative", "ineligible", "unsuccessful", "<=50k", "<50k",
    "churn", "default", "defaulted", "fraud",
}


def _label_polarity(label: Any) -> int:
    s = str(label).strip().lower().strip(".")
    if s.startswith("not ") or s.startswith("non-") or s.startswith("no "):
        return -1
    if s in _FAVORABLE_TOKENS:
        return 1
    if s in _UNFAVORABLE_TOKENS:
        return -1
    if any(tok in s for tok in (">50k", "approv", "accept", "grant", "eligible", "hire")):
        return 1
    if any(tok in s for tok in ("<=50k", "<50k", "reject", "deny", "denied", "declin", "default", "fraud", "ineligibl")):
        return -1
    return 0


def validate_target_column(series: pd.Series, target_col: str = "target") -> dict[str, Any]:
    s = series.dropna()
    n = int(s.nunique())
    classes = [str(v) for v in list(pd.unique(s))[:10]]

    if n < 2:
        return {
            "valid": False, "n_classes": n, "classes": classes,
            "error": (
                f"Target column '{target_col}' has only {n} distinct value(s). A fairness "
                f"audit needs two outcome classes (e.g. approved vs denied)."
            ),
        }
    if n == 2:
        return {"valid": True, "n_classes": 2, "classes": classes, "error": None}

    _CONTINUOUS_UNIQUE_THRESHOLD = 20
    if pd.api.types.is_numeric_dtype(s) and n > _CONTINUOUS_UNIQUE_THRESHOLD:
        return {
            "valid": False, "n_classes": n, "classes": classes,
            "error": (
                f"Target column '{target_col}' looks continuous ({n} distinct numeric "
                f"values). This audit measures fairness for binary decisions - choose a "
                f"binary outcome column, or convert this into two classes."
            ),
        }
    return {
        "valid": False, "n_classes": n, "classes": classes,
        "error": (
            f"Target column '{target_col}' has {n} classes ({', '.join(classes)}). This "
            f"audit supports binary outcomes only - map it to two outcomes (favorable vs "
            f"unfavorable) or pick a binary target column."
        ),
    }


def resolve_positive_label(values: Any, override: Any = None) -> Any:
    uniq = list(pd.Series(values).dropna().unique())
    if not uniq:
        return None
    if override is not None and override in uniq:
        return override
    if set(uniq) == {0, 1}:
        return 1
    return max(uniq, key=lambda label: (_label_polarity(label), str(label)))


def positive_rate(col: pd.Series, override: Any = None) -> float:
    col = col.dropna()
    if col.empty:
        return 0.0
    if pd.api.types.is_numeric_dtype(col) and set(pd.unique(col)) <= {0, 1}:
        return float(col.mean())
    if col.nunique() != 2:
        return 0.0
    pos = resolve_positive_label(col, override=override)
    return float((col == pos).mean())


def fit_classifier(pipeline: Pipeline, X_train: pd.DataFrame, y_train: pd.Series) -> Pipeline:
    model = pipeline.named_steps.get("model") if hasattr(pipeline, "named_steps") else None
    preprocessor = pipeline.named_steps.get("preprocessor") if hasattr(pipeline, "named_steps") else None
    is_xgb = model is not None and model.__class__.__name__ == "XGBClassifier"
    n_classes = int(pd.Series(y_train).nunique())

    if is_xgb and preprocessor is not None and len(X_train) >= 50 and n_classes > 1:
        try:
            X_tr, X_val, y_tr, y_val = train_test_split(
                X_train, y_train, test_size=0.15, random_state=42, stratify=y_train
            )
            X_tr_t = preprocessor.fit_transform(X_tr, y_tr)
            X_val_t = preprocessor.transform(X_val)
            model.set_params(early_stopping_rounds=30)
            model.fit(X_tr_t, y_tr, eval_set=[(X_val_t, y_val)], verbose=False)
            return pipeline
        except Exception:
            try:
                model.set_params(early_stopping_rounds=None)
            except Exception:
                pass
    pipeline.fit(X_train, y_train)
    return pipeline


def overfit_assessment(train_accuracy: float, test_accuracy: float) -> dict[str, Any]:
    gap = round(float(train_accuracy) - float(test_accuracy), 4)
    if gap <= 0.05:
        level, warning = "none", None
    elif gap <= 0.10:
        level = "mild"
        warning = (
            f"Training accuracy ({train_accuracy:.1%}) exceeds test accuracy "
            f"({test_accuracy:.1%}) by {gap:.1%} — mild overfitting."
        )
    else:
        level = "high"
        warning = (
            f"Training accuracy ({train_accuracy:.1%}) exceeds test accuracy "
            f"({test_accuracy:.1%}) by {gap:.1%} — significant overfitting."
        )
    return {
        "train_accuracy": round(float(train_accuracy), 4),
        "test_accuracy": round(float(test_accuracy), 4),
        "gap": gap,
        "level": level,
        "warning": warning,
    }


__all__ = [
    "PreparedData",
    "encode_sensitive_series",
    "infer_numeric_and_categorical",
    "make_feature_frame",
    "normalize_target_binary",
    "prepare_split",
    "_drop_nan",
    "ZERO_GAPS",
    "fairness_gaps",
    "fairness_score_from_gaps",
    "get_metric_weights",
    "group_metrics",
    "top_correlated_feature",
    "build_and_fit_default",
    "build_classifier",
    "train_multiple_models",
    "DatasetQualityReport",
    "check_dataset_quality",
    "bootstrap_fairness_gaps",
    "permutation_fairness_pvalue",
    "DEFAULT_THRESHOLDS",
    "DOMAIN_THRESHOLDS",
    "_domain_thresholds",
    "risk_from_gap",
    "risk_from_score",
    "utcnow_iso",
    "MIN_SUBGROUP_SIZE",
    "validate_target_column",
    "resolve_positive_label",
    "positive_rate",
    "fit_classifier",
    "overfit_assessment",
]
