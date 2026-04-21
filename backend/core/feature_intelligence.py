from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def _cramers_v(series_a: pd.Series, series_b: pd.Series) -> float:
    confusion = pd.crosstab(series_a.astype(str), series_b.astype(str))
    if confusion.empty:
        return 0.0
    observed = confusion.to_numpy(dtype=float)
    total = observed.sum()
    if total == 0:
        return 0.0
    row_totals = observed.sum(axis=1, keepdims=True)
    col_totals = observed.sum(axis=0, keepdims=True)
    expected = row_totals @ col_totals / total
    with np.errstate(divide="ignore", invalid="ignore"):
        chi2 = np.nansum((observed - expected) ** 2 / np.where(expected == 0, 1, expected))
    phi2 = chi2 / total
    r, k = observed.shape
    return float(np.sqrt(phi2 / max(min(k - 1, r - 1), 1)))


def detect_proxy_features(df: pd.DataFrame, sensitive_cols: list[str]) -> dict[str, Any]:
    feature_rows: list[dict[str, Any]] = []
    safe_features: list[str] = []
    excluded_columns = {"approved", "hired", "target", "label"}
    sensitive_encoded = {col: pd.factorize(df[col].astype(str))[0] if col in df.columns else None for col in sensitive_cols}

    for feature in df.columns:
        if feature in sensitive_cols or feature.lower() in excluded_columns:
            continue
        best_sensitive = None
        best_correlation = 0.0
        for sensitive in sensitive_cols:
            if sensitive not in df.columns:
                continue
            if pd.api.types.is_numeric_dtype(df[feature]) and pd.api.types.is_numeric_dtype(df[sensitive]):
                correlation = abs(df[feature].corr(df[sensitive]))
            elif pd.api.types.is_numeric_dtype(df[feature]):
                encoded_sensitive = sensitive_encoded.get(sensitive)
                correlation = abs(pd.Series(df[feature]).corr(pd.Series(encoded_sensitive))) if encoded_sensitive is not None else 0.0
            elif pd.api.types.is_numeric_dtype(df[sensitive]):
                encoded_feature = pd.factorize(df[feature].astype(str))[0]
                correlation = abs(pd.Series(encoded_feature).corr(df[sensitive]))
            else:
                correlation = _cramers_v(df[feature], df[sensitive])
            if pd.notna(correlation) and correlation > best_correlation:
                best_correlation = float(correlation)
                best_sensitive = sensitive
        proxy_score = max(0.0, min(1.0, best_correlation))
        if proxy_score > 0.4:
            warning = f"{feature} is strongly correlated with {best_sensitive} (r={proxy_score:.2f}). Consider removing or transforming."
            feature_rows.append(
                {
                    "feature": feature,
                    "proxy_score": round(proxy_score, 4),
                    "correlated_with": best_sensitive,
                    "correlation": round(best_correlation, 4),
                    "warning": warning,
                }
            )
        else:
            safe_features.append(feature)

    feature_rows = sorted(feature_rows, key=lambda item: item["proxy_score"], reverse=True)[:5]
    overall_proxy_score = float(np.mean([row["proxy_score"] for row in feature_rows])) if feature_rows else 0.0
    return {
        "proxy_features": feature_rows,
        "safe_features": safe_features,
        "proxy_score": round(overall_proxy_score, 4),
    }
