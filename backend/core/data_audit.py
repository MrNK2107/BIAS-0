from __future__ import annotations

from typing import Any

import pandas as pd

from .common import risk_from_gap


def run_data_audit(df: pd.DataFrame, sensitive_cols: list[str], target_col: str) -> dict[str, Any]:
    group_stats: dict[str, dict[str, Any]] = {}
    under_represented_groups: list[str] = []
    total_rows = max(len(df), 1)  # guard division by zero

    for sensitive in sensitive_cols:
        if sensitive not in df.columns:
            continue
        stats_for_sensitive: dict[str, Any] = {}
        counts = df[sensitive].value_counts(dropna=False)

        for group_value, count in counts.items():
            count_int = int(count)
            mask = df[sensitive].astype(str) == str(group_value)
            group_df = df[mask]

            # Guard: positive_rate safe even when target_col missing or group empty
            if target_col in group_df.columns and not group_df.empty:
                col = group_df[target_col]
                # Handle non-numeric target gracefully
                try:
                    positive_rate = float(pd.to_numeric(col, errors="coerce").mean())
                    if positive_rate != positive_rate:  # NaN check
                        positive_rate = 0.0
                except Exception:
                    positive_rate = 0.0
            else:
                positive_rate = 0.0

            missing_rate = float(group_df.isna().mean().mean()) if not group_df.empty else 0.0
            representation_ratio = count_int / total_rows  # total_rows >= 1, safe

            stats_for_sensitive[str(group_value)] = {
                "count": count_int,
                "positive_rate": round(positive_rate, 4),
                "missing_rate": round(missing_rate, 4),
                "under_represented": bool(representation_ratio < 0.2),
            }
            if representation_ratio < 0.2:
                under_represented_groups.append(str(group_value))

        group_stats[sensitive] = stats_for_sensitive

    # Overall class distribution
    if target_col in df.columns:
        try:
            positive_rate = float(pd.to_numeric(df[target_col], errors="coerce").mean())
            positive_rate = 0.0 if positive_rate != positive_rate else positive_rate
        except Exception:
            positive_rate = 0.0
    else:
        positive_rate = 0.0

    class_distribution = {
        "approved": round(positive_rate, 4),
        "rejected": round(1.0 - positive_rate, 4),
    }

    missing_data = {
        column: round(float(df[column].isna().mean()), 4)
        for column in df.columns
    }

    # Approval-rate gap across groups (robust to NaN / empty slices)
    max_gap = 0.0
    worst_reason = "No gaps detected"
    for sensitive in sensitive_cols:
        if sensitive not in df.columns or target_col not in df.columns:
            continue
        try:
            numeric_target = pd.to_numeric(df[target_col], errors="coerce")
            rates = df.groupby(sensitive)[target_col].apply(
                lambda s: float(pd.to_numeric(s, errors="coerce").mean())
            ).dropna()
            if rates.empty:
                continue
            gap = float(rates.max() - rates.min())
            if gap > max_gap:
                max_gap = gap
                worst_reason = (
                    f"Approval rate gap between {sensitive} groups is {round(gap * 100)}%"
                )
        except Exception:
            continue

    risk_level = risk_from_gap(max_gap)

    return {
        "group_stats": group_stats,
        "class_distribution": class_distribution,
        "under_represented_groups": under_represented_groups,
        "missing_data": missing_data,
        "risk_level": risk_level,
        "risk_reason": worst_reason,
        "max_gap": round(max_gap, 4),
    }
