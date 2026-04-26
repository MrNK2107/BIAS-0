from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from typing import Any


# ── helpers ───────────────────────────────────────────────────────────────────

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


def _safe_numeric_series(series: pd.Series) -> pd.Series:
    """Convert a series to float, coercing non-numeric values. Returns NaN for failures."""
    return pd.to_numeric(series, errors="coerce")


# ── clustering proxy detection ────────────────────────────────────────────────

def detect_proxy_via_clustering(
    df: pd.DataFrame, sensitive_cols: list[str]
) -> dict[str, dict[str, Any]]:
    clustering_results: dict[str, dict[str, Any]] = {}
    excluded_columns = {"approved", "hired", "target", "label"}

    for sensitive in sensitive_cols:
        if sensitive not in df.columns:
            continue

        encoded_sensitive, _ = pd.factorize(df[sensitive].astype(str))
        n_clusters = max(len(np.unique(encoded_sensitive)), 2)

        numeric_features = [
            col for col in df.columns
            if col not in sensitive_cols
            and col.lower() not in excluded_columns
            and pd.api.types.is_numeric_dtype(df[col])
        ]

        for feature in numeric_features:
            raw_data = _safe_numeric_series(df[feature])
            feature_data = raw_data.values.reshape(-1, 1)

            # Skip if too few usable samples
            valid_mask = ~np.isnan(feature_data.ravel())
            if valid_mask.sum() < n_clusters:
                continue

            # Impute NaN with median of valid values
            median_val = float(np.nanmedian(feature_data))
            feature_clean = np.where(np.isnan(feature_data), median_val, feature_data)

            # Clip extreme outliers to prevent KMeans numerical issues
            p1, p99 = np.percentile(feature_clean, [1, 99])
            feature_clean = np.clip(feature_clean, p1, p99)

            try:
                kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
                cluster_labels = kmeans.fit_predict(feature_clean)

                purities: list[float] = []
                for cluster_id in range(n_clusters):
                    cluster_mask = cluster_labels == cluster_id
                    cluster_size = int(cluster_mask.sum())
                    if cluster_size == 0:
                        continue
                    sensitive_in_cluster = encoded_sensitive[cluster_mask]
                    dominant_count = int(np.bincount(sensitive_in_cluster).max())
                    purities.append(dominant_count / cluster_size)

                avg_purity = float(np.mean(purities)) if purities else 0.0

                if avg_purity > 0.7:
                    confidence = "high" if avg_purity > 0.85 else "medium"
                    clustering_results[feature] = {
                        "feature": feature,
                        "cluster_proxy_score": round(avg_purity, 4),
                        "related_sensitive": sensitive,
                        "purity": round(avg_purity, 4),
                        "detection_method": "clustering",
                        "confidence": confidence,
                    }
            except Exception:
                continue

    return clustering_results


# ── correlation proxy detection ───────────────────────────────────────────────

def detect_proxy_features(df: pd.DataFrame, sensitive_cols: list[str]) -> dict[str, Any]:
    feature_rows: list[dict[str, Any]] = []
    safe_features: list[str] = []
    excluded_columns = {"approved", "hired", "target", "label"}

    sensitive_encoded: dict[str, np.ndarray | None] = {}
    for col in sensitive_cols:
        if col not in df.columns:
            sensitive_encoded[col] = None
            continue
        if pd.api.types.is_numeric_dtype(df[col]):
            sensitive_encoded[col] = _safe_numeric_series(df[col]).fillna(0).values
        else:
            sensitive_encoded[col] = pd.factorize(df[col].astype(str))[0]

    correlation_proxies: dict[str, dict[str, Any]] = {}

    for feature in df.columns:
        if feature in sensitive_cols or feature.lower() in excluded_columns:
            continue

        best_sensitive: str | None = None
        best_correlation = 0.0

        for sensitive in sensitive_cols:
            if sensitive not in df.columns:
                continue
            enc_sensitive = sensitive_encoded.get(sensitive)
            if enc_sensitive is None:
                continue

            try:
                if pd.api.types.is_numeric_dtype(df[feature]):
                    # Numeric feature vs numeric/encoded sensitive
                    feat_num = _safe_numeric_series(df[feature]).fillna(
                        _safe_numeric_series(df[feature]).median()
                    )
                    if pd.api.types.is_numeric_dtype(df[sensitive]):
                        sens_num = _safe_numeric_series(df[sensitive]).fillna(0)
                        correlation = abs(float(feat_num.corr(sens_num)))
                    else:
                        correlation = abs(
                            float(feat_num.corr(pd.Series(enc_sensitive, index=df.index)))
                        )
                elif pd.api.types.is_numeric_dtype(df[sensitive]):
                    # Categorical feature vs numeric sensitive
                    enc_feature = pd.factorize(df[feature].astype(str))[0]
                    sens_num = _safe_numeric_series(df[sensitive]).fillna(0)
                    correlation = abs(
                        float(pd.Series(enc_feature, index=df.index).corr(sens_num))
                    )
                else:
                    # Both categorical — use Cramér's V
                    correlation = _cramers_v(df[feature], df[sensitive])

                if not (correlation == correlation):  # NaN guard
                    correlation = 0.0
            except Exception:
                correlation = 0.0

            if correlation > best_correlation:
                best_correlation = float(correlation)
                best_sensitive = sensitive

        proxy_score = max(0.0, min(1.0, best_correlation))
        if proxy_score > 0.4:
            correlation_proxies[feature] = {
                "feature": feature,
                "proxy_score": round(proxy_score, 4),
                "correlated_with": best_sensitive,
                "correlation": round(best_correlation, 4),
                "warning": (
                    f"{feature} is strongly correlated with {best_sensitive} "
                    f"(r={proxy_score:.2f}). Consider removing or transforming."
                ),
                "detection_method": "correlation",
            }
        else:
            safe_features.append(feature)

    # Clustering-based detection
    clustering_proxies = detect_proxy_via_clustering(df, sensitive_cols)

    # Merge
    all_proxies: dict[str, dict[str, Any]] = dict(correlation_proxies)
    for feature, cr in clustering_proxies.items():
        if feature in all_proxies:
            all_proxies[feature]["detection_method"] = "both"
            all_proxies[feature]["confidence"] = "high"
            c_score = all_proxies[feature].get("proxy_score", 0.0)
            k_score = cr.get("cluster_proxy_score", 0.0)
            all_proxies[feature]["combined_score"] = round(max(c_score, k_score), 4)
            all_proxies[feature]["warning"] = (
                f"{feature} flagged via BOTH correlation and clustering "
                f"(correlation={c_score:.2f}, clustering={k_score:.2f}). "
                f"HIGH CONFIDENCE proxy — strongly recommended to remove or transform."
            )
        else:
            all_proxies[feature] = cr

    feature_rows = sorted(
        all_proxies.values(),
        key=lambda item: item.get("proxy_score") or item.get("cluster_proxy_score", 0.0),
        reverse=True,
    )[:5]

    safe_features = [f for f in safe_features if f not in all_proxies]

    overall_proxy_score = float(np.mean([
        row.get("proxy_score") or row.get("cluster_proxy_score", 0.0)
        for row in feature_rows
    ])) if feature_rows else 0.0

    return {
        "proxy_features": feature_rows,
        "safe_features": safe_features,
        "proxy_score": round(overall_proxy_score, 4),
    }
