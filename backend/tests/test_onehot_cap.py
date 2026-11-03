"""High-cardinality categoricals are capped in the one-hot encoder."""
from __future__ import annotations

import numpy as np
import pandas as pd

from core.models import MAX_ONEHOT_CATEGORIES, build_classifier


def _frame(n: int = 600, seed: int = 0) -> tuple[pd.DataFrame, pd.Series]:
    rng = np.random.default_rng(seed)
    X = pd.DataFrame(
        {
            "income": rng.normal(50_000, 10_000, n),
            "gender": rng.choice(["female", "male", "other"], n),
            # ~n distinct values, like zip_code in data/demo_loan.csv
            "zip_code": [f"{rng.integers(100, 999)}-{rng.integers(100, 999)}" for _ in range(n)],
        }
    )
    y = pd.Series((X["income"] > 50_000).astype(int))
    return X, y


def _names(pipe) -> list[str]:
    return list(pipe.named_steps["preprocessor"].get_feature_names_out())


def test_high_cardinality_column_is_capped():
    X, y = _frame()
    pipe = build_classifier(X, "rf").fit(X, y)
    zip_cols = [c for c in _names(pipe) if c.startswith("cat__zip_code_")]
    assert X["zip_code"].nunique() > 500
    assert len(zip_cols) <= MAX_ONEHOT_CATEGORIES
    assert any(c.endswith("_infrequent_sklearn") for c in zip_cols)


def test_low_cardinality_column_is_untouched():
    X, y = _frame()
    pipe = build_classifier(X, "rf").fit(X, y)
    gender_cols = sorted(c for c in _names(pipe) if c.startswith("cat__gender_"))
    assert gender_cols == ["cat__gender_female", "cat__gender_male", "cat__gender_other"]


def test_unseen_categories_at_predict_time_do_not_fail():
    X, y = _frame()
    pipe = build_classifier(X, "xgb").fit(X, y)
    X_new = X.head(5).copy()
    X_new["zip_code"] = "000-000"  # never seen in training
    X_new.loc[X_new.index[0], "gender"] = "unknown"
    assert len(pipe.predict(X_new)) == 5


def test_categories_come_from_training_rows_only():
    """The kept categories are learned at fit time, so test-only values can't leak in."""
    X, y = _frame()
    X_train = X.copy()
    X_train.loc[X_train.index[:50], "zip_code"] = "111-111"  # frequent in train
    pipe = build_classifier(X_train, "rf").fit(X_train, y)
    assert "cat__zip_code_111-111" in _names(pipe)


def test_proxy_detection_caps_high_cardinality_sensitive_labels():
    """A near-unique sensitive column (zip_code) used to mean ~n KMeans clusters
    and a kNN search per class in mutual_info_classif (minutes)."""
    from core.feature_intelligence import MAX_MI_CLASSES, _cap_label_cardinality, detect_proxy_features

    labels = np.arange(1000) % 300
    capped = _cap_label_cardinality(labels)
    assert len(np.unique(capped)) == MAX_MI_CLASSES + 1
    small = np.array([0, 1, 1, 2])
    assert (_cap_label_cardinality(small) == small).all()

    X, y = _frame(n=400)
    df = X.assign(approved=y)
    result = detect_proxy_features(df, ["gender", "zip_code"])
    assert "proxy_features" in result
