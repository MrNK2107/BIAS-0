from __future__ import annotations

from typing import Any

import pandas as pd

from .common import risk_from_gap


def run_data_audit(df: pd.DataFrame, sensitive_cols: list[str], target_col: str) -> dict[str, Any]:
    group_stats: dict[str, dict[str, Any]] = {}
    under_represented_groups: list[str] = []
    total_rows = len(df)

    for sensitive in sensitive_cols:
        if sensitive not in df.columns:
            continue
        stats_for_sensitive: dict[str, Any] = {}
        counts = df[sensitive].value_counts(dropna=False)
        for group_value, count in counts.items():
            mask = df[sensitive].astype(str) == str(group_value)
            group_df = df[mask]
            positive_rate = float(group_df[target_col].mean()) if target_col in group_df.columns and not group_df.empty else 0.0
            missing_rate = float(group_df.isna().mean().mean()) if not group_df.empty else 0.0
            stats_for_sensitive[str(group_value)] = {
                "count": int(count),
                "positive_rate": round(positive_rate, 4),
                "missing_rate": round(missing_rate, 4),
                "under_represented": bool(count / max(total_rows, 1) < 0.2),
            }
            if count / max(total_rows, 1) < 0.2:
                under_represented_groups.append(str(group_value))
        group_stats[sensitive] = stats_for_sensitive

    positive_rate = float(df[target_col].mean()) if target_col in df.columns else 0.0
    class_distribution = {
        "approved": round(positive_rate, 4),
        "rejected": round(1 - positive_rate, 4),
    }

    missing_data = {column: round(float(df[column].isna().mean()), 4) for column in df.columns}

    max_gap = 0.0
    worst_reason = "No gaps detected"
    for sensitive in sensitive_cols:
        if sensitive not in df.columns:
            continue
        rates = df.groupby(sensitive)[target_col].mean().dropna()
        if not rates.empty:
            gap = float(rates.max() - rates.min())
            if gap > max_gap:
                max_gap = gap
                worst_reason = f"Approval rate gap between {sensitive} groups is {round(gap * 100)}%"

    risk_level = risk_from_gap(max_gap)

    return {
        "group_stats": group_stats,
        "class_distribution": class_distribution,
        "under_represented_groups": under_represented_groups,
        "missing_data": missing_data,
        "risk_level": risk_level,
        "risk_reason": worst_reason,
    }
