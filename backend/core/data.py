from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

# ── Helpers ────────────────────────────────────────────────────────────────


def _drop_nan(*series: pd.Series) -> list[pd.Series]:
    mask = pd.Series(True, index=series[0].index)
    for s in series:
        mask &= s.notna()
    return [s[mask] for s in series]


MISSING_GROUP_LABEL = "(missing)"


def group_labels(series) -> pd.Series:
    """String group labels with missing values as one visible group.

    ``astype(str)`` alone is not enough: pandas 3 keeps NaN through it, so the
    missing rows got factorize code -1 (a crash in bincount) or vanished from
    groupby tables. Rows with no protected value are reported, not hidden.
    """
    s = series if isinstance(series, pd.Series) else pd.Series(np.asarray(series, dtype=object))
    return s.astype(object).where(s.notna(), MISSING_GROUP_LABEL).astype(str)


@dataclass
class PreparedData:
    X_train: pd.DataFrame
    X_test: pd.DataFrame
    y_train: pd.Series
    y_test: pd.Series
    feature_columns: list[str]
    numeric_features: list[str]
    categorical_features: list[str]


def _norm_label(value: Any) -> str:
    return str(value).strip().lower()


def _is_binary01(s: pd.Series) -> bool:
    known = s.dropna()
    return (
        pd.api.types.is_numeric_dtype(s)
        and not pd.api.types.is_bool_dtype(s)
        and set(pd.unique(known)) <= {0, 1}
    )


def _match_positive(s: pd.Series, positive_label: Any) -> pd.Series | None:
    """0/1 codes with ``positive_label`` as 1, or None when no value matches.
    Text matching ignores case and surrounding whitespace; numeric targets
    also accept the label as text ("1")."""
    if pd.api.types.is_numeric_dtype(s) and not pd.api.types.is_bool_dtype(s):
        try:
            num = float(positive_label)
        except (TypeError, ValueError):
            return None
        hit = s == num
    else:
        hit = s.astype(str).str.strip().str.lower() == _norm_label(positive_label)
    return hit.astype(int) if hit.any() else None


def infer_positive_label(values: pd.Series) -> Any:
    """The original label that ``normalize_target_binary`` maps to 1 when the
    user does not choose one (None for multi-class / continuous targets)."""
    s = pd.Series(values).dropna()
    if s.empty:
        return None
    if pd.api.types.is_bool_dtype(s):
        return True
    if pd.api.types.is_numeric_dtype(s):
        uniq = pd.unique(s)
        if set(uniq) <= {0, 1}:
            return 1
        if uniq.size == 2:
            return uniq.max().item()
        return None
    norm = s.astype(str).str.strip().str.lower()
    originals = dict(zip(norm, s, strict=True))
    if norm.isin(_TRUTHY | _FALSY).all():
        truthy = [v for v in pd.unique(norm) if v in _TRUTHY]
        return originals[truthy[0]] if truthy else None
    if norm.nunique() == 2:
        from .common import resolve_positive_label

        return originals[resolve_positive_label(norm)]
    return None


def resolve_target_positive(values: pd.Series, positive_label: Any = None) -> dict[str, Any]:
    """Provenance record of the positive class: the user's choice or the inference."""
    if positive_label is not None and str(positive_label).strip() != "":
        return {"value": positive_label, "source": "user"}
    inferred = infer_positive_label(values)
    if hasattr(inferred, "item"):
        inferred = inferred.item()
    return {"value": inferred, "source": "inferred"}


def normalize_target_binary(
    df: pd.DataFrame, target_col: str, positive_label: Any = None
) -> pd.DataFrame:
    """Convert target column to binary 0/1 in-place.

    Handles:
      - string targets like 'yes'/'no', 'approved'/'rejected', 'true'/'false'
      - boolean True/False
      - numeric targets that are already 0/1, or two-valued ({1, 2}, {-1, 1}):
        the larger value is the positive class
      - any other two-category string target: ``resolve_positive_label`` picks
        the positive class (favourable wording, else the later label in sorted
        order), independent of row order
    Numeric targets with more than two values are thresholded at the median
    (above = 1); ``describe_target_binarisation`` records this so the report
    and provenance show it. String targets with more than two labels need a
    ``positive_label`` (one-vs-rest): a median split of their alphabetical
    codes has no meaning, so it raises ValueError instead.

    Missing labels stay missing (NaN, the column becomes float) instead of being
    encoded as a class; ``prepare_split`` drops those rows. Encoding them used to
    turn a yes/no column with one blank into a 3-category column and invert
    the positive class.

    ``positive_label`` (the user's choice) overrides the inference: rows equal
    to it become 1, every other label 0. A label that matches no value raises
    ValueError, except on a column that is already 0/1 (normalised upstream,
    where the original labels are gone).
    """
    if target_col not in df.columns:
        return df

    s = df[target_col]
    known = s.notna()
    if positive_label is not None and str(positive_label).strip() != "":
        codes = _match_positive(s[known], positive_label)
        if codes is None:
            if _is_binary01(s):
                return df
            labels = ", ".join(sorted(map(str, pd.unique(s[known]))))
            raise ValueError(
                f"The positive label '{positive_label}' is not one of the values of "
                f"target column '{target_col}' ({labels})."
            )
        def encode(part: pd.Series) -> pd.Series:
            return _match_positive(part, positive_label)
    else:
        encode = _binary_codes
    if known.all():
        df[target_col] = encode(s).astype(int)
        return df
    out = pd.Series(np.nan, index=s.index, dtype=float)
    if known.any():
        out[known] = encode(s[known]).astype(float)
    df[target_col] = out
    return df


_TRUTHY = {
    "yes", "y", "true", "t", "1", "approved", "hired", "accepted", "pass",
    "positive", "1.0",
}
_FALSY = {
    "no", "n", "false", "f", "0", "rejected", "not_hired", "denied", "fail",
    "negative", "0.0",
}


def _binary_codes(s: pd.Series) -> pd.Series:
    """0/1 codes for a label series with no missing values."""
    if pd.api.types.is_bool_dtype(s):
        return s.astype(int)

    if pd.api.types.is_numeric_dtype(s):
        unique = s.unique()
        if set(unique) <= {0, 1}:
            return s.astype(int)
        if unique.size == 2:
            return (s == unique.max()).astype(int)
        if unique.size > 2:
            return (s > float(s.median())).astype(int)
        return s.astype(int)

    # String / categorical target
    str_s = s.astype(str).str.strip().str.lower()
    if str_s.isin(_TRUTHY | _FALSY).all():
        return str_s.isin(_TRUTHY).astype(int)

    codes, uniques = pd.factorize(str_s, sort=True)
    codes = pd.Series(codes, index=s.index)
    if len(uniques) > 2:
        shown = ", ".join(map(str, uniques[:10]))
        raise ValueError(
            f"The target has {len(uniques)} labels ({shown}). A fairness audit needs a "
            "binary outcome: choose the positive label (one-vs-rest) or map the column "
            "to two outcomes."
        )
    if len(uniques) == 2:
        # Same rule as the data audit's positive_rate: favourable wording wins
        # ("approve" over "deny"), otherwise the later label in sorted order.
        from .common import resolve_positive_label

        return (str_s == resolve_positive_label(str_s)).astype(int)

    return (codes > float(np.median(codes))).astype(int)


def describe_target_binarisation(values: pd.Series, positive_label: Any = None) -> dict[str, Any]:
    """How ``normalize_target_binary`` turns this target into 0/1, for the
    report and provenance: ``two_class``, ``one_vs_rest`` (user's label on a
    target with more than two labels) or ``median_threshold`` (numeric target
    with more than two values; 1 = above the median). ``note`` is a sentence
    for the report when the encoding is not a plain two-class mapping."""
    s = pd.Series(values).dropna()
    n = int(s.nunique())
    info: dict[str, Any] = {"method": "two_class", "n_classes": n, "note": None}
    has_label = positive_label is not None and str(positive_label).strip() != ""
    if n <= 2:
        return info
    if has_label:
        info.update(
            method="one_vs_rest",
            positive=positive_label,
            note=(
                f"Target has {n} labels; '{positive_label}' is the positive outcome and "
                f"the other {n - 1} labels count as negative (one-vs-rest)."
            ),
        )
        return info
    if pd.api.types.is_numeric_dtype(s) and not pd.api.types.is_bool_dtype(s):
        threshold = float(s.median())
        info.update(
            method="median_threshold",
            threshold=threshold,
            note=(
                f"Target has {n} numeric values; it was binarised at its median "
                f"({threshold:g}): values above the median count as the positive outcome."
            ),
        )
        return info
    info.update(method="unsupported", note=f"Target has {n} labels and no positive label.")
    return info


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
    if df[target_col].isna().any():
        # Unlabeled rows cannot be scored for TPR/FPR; normalize_target_binary
        # leaves them as NaN rather than guessing a class.
        df = df[df[target_col].notna()]
        df = df.assign(**{target_col: df[target_col].astype(int)})
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
