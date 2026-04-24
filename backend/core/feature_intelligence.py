from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans


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


def detect_proxy_via_clustering(df: pd.DataFrame, sensitive_cols: list[str]) -> dict[str, dict[str, Any]]:
    """
    Detect proxy features using clustering-based approach.
    For each sensitive column, run KMeans clustering on numeric features
    and compute cluster purity to identify proxies.
    
    Returns a dict mapping feature names to clustering detection results:
    {
        "feature_name": {
            "feature": str,
            "cluster_proxy_score": float,
            "related_sensitive": str,
            "purity": float,
            "detection_method": "clustering",
            "confidence": str ("high" if purity > 0.85 else "medium" if purity > 0.7 else "low")
        }
    }
    """
    clustering_results: dict[str, dict[str, Any]] = {}
    excluded_columns = {"approved", "hired", "target", "label"}
    
    for sensitive in sensitive_cols:
        if sensitive not in df.columns:
            continue
        
        # Encode sensitive column
        encoded_sensitive, _ = pd.factorize(df[sensitive].astype(str))
        n_clusters = len(np.unique(encoded_sensitive))
        
        # Get numeric features (excluding sensitive columns and excluded columns)
        numeric_features = [
            col for col in df.columns
            if col not in sensitive_cols
            and col.lower() not in excluded_columns
            and pd.api.types.is_numeric_dtype(df[col])
        ]
        
        for feature in numeric_features:
            feature_data = df[feature].values.reshape(-1, 1)
            
            # Skip if too few samples or all NaN
            if len(feature_data) < n_clusters or pd.isna(feature_data).all():
                continue
            
            # Handle NaN by filling with median
            feature_clean = np.where(pd.isna(feature_data), np.nanmedian(feature_data), feature_data)
            
            try:
                # Run KMeans
                kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
                cluster_labels = kmeans.fit_predict(feature_clean)
                
                # Compute cluster purity
                purities = []
                for cluster_id in range(n_clusters):
                    cluster_mask = cluster_labels == cluster_id
                    cluster_size = cluster_mask.sum()
                    
                    if cluster_size == 0:
                        continue
                    
                    # Find dominant sensitive group in this cluster
                    sensitive_in_cluster = encoded_sensitive[cluster_mask]
                    dominant_count = np.bincount(sensitive_in_cluster).max()
                    purity = dominant_count / cluster_size
                    purities.append(purity)
                
                # Average purity across clusters
                avg_purity = float(np.mean(purities)) if purities else 0.0
                
                # Flag if purity > 0.7
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
                # Skip on any KMeans error (e.g., numerical instability)
                continue
    
    return clustering_results


def detect_proxy_features(df: pd.DataFrame, sensitive_cols: list[str]) -> dict[str, Any]:
    feature_rows: list[dict[str, Any]] = []
    safe_features: list[str] = []
    excluded_columns = {"approved", "hired", "target", "label"}
    sensitive_encoded = {col: pd.factorize(df[col].astype(str))[0] if col in df.columns else None for col in sensitive_cols}

    # Correlation-based detection
    correlation_proxies: dict[str, dict[str, Any]] = {}
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
            correlation_proxies[feature] = {
                "feature": feature,
                "proxy_score": round(proxy_score, 4),
                "correlated_with": best_sensitive,
                "correlation": round(best_correlation, 4),
                "warning": f"{feature} is strongly correlated with {best_sensitive} (r={proxy_score:.2f}). Consider removing or transforming.",
                "detection_method": "correlation",
            }
        else:
            safe_features.append(feature)
    
    # Clustering-based detection
    clustering_proxies = detect_proxy_via_clustering(df, sensitive_cols)
    
    # Merge results
    all_proxies: dict[str, dict[str, Any]] = {}
    
    # Add correlation-based proxies
    for feature, result in correlation_proxies.items():
        all_proxies[feature] = result
    
    # Add/merge clustering-based proxies
    for feature, clustering_result in clustering_proxies.items():
        if feature in all_proxies:
            # Feature detected by both methods -> mark as high confidence
            all_proxies[feature]["detection_method"] = "both"
            all_proxies[feature]["confidence"] = "high"
            # Use maximum score from either method
            correlation_score = all_proxies[feature].get("proxy_score", 0.0)
            clustering_score = clustering_result.get("cluster_proxy_score", 0.0)
            all_proxies[feature]["combined_score"] = round(max(correlation_score, clustering_score), 4)
            all_proxies[feature]["warning"] = (
                f"{feature} is flagged as proxy via BOTH correlation and clustering (correlation={correlation_score:.2f}, "
                f"clustering={clustering_score:.2f}). HIGH CONFIDENCE proxy - strongly recommended to remove or transform."
            )
        else:
            # Only detected by clustering
            all_proxies[feature] = clustering_result
    
    # Convert to list and sort by proxy score
    feature_rows = list(all_proxies.values())
    feature_rows = sorted(feature_rows, key=lambda item: item.get("proxy_score") or item.get("cluster_proxy_score", 0.0), reverse=True)[:5]
    
    # Remove safe features that were added to proxies
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
