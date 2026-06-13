from __future__ import annotations

import logging
from typing import Any

import numpy as np
import pandas as pd

from .common import (
    check_dataset_quality,
    normalize_target_binary,
    positive_rate,
    resolve_positive_label,
    risk_from_gap,
)

logger = logging.getLogger(__name__)


def run_data_audit(
    df: pd.DataFrame,
    sensitive_cols: list[str],
    target_col: str,
    domain: str = "other",
    positive_label: Any = None,
) -> dict[str, Any]:
    normalize_target_binary(df, target_col)
    if target_col not in df.columns:
        pos_label = None
    else:
        pos_label = resolve_positive_label(df[target_col]) if positive_label is None else positive_label

    # ── Dataset Quality Report ───────────────────────────────────────────
    quality = check_dataset_quality(df, target_col, sensitive_cols)

    group_stats: dict[str, dict[str, Any]] = {}
    under_represented_groups: list[str] = []
    total_rows = max(len(df), 1)

    for sensitive in sensitive_cols:
        if sensitive not in df.columns:
            continue
        stats_for_sensitive: dict[str, Any] = {}
        counts = df[sensitive].value_counts(dropna=False)

        for group_value, count in counts.items():
            if pd.isna(group_value) or str(group_value).lower() == "nan":
                continue

            count_int = int(count)
            mask = df[sensitive].astype(str) == str(group_value)
            group_df = df[mask]

            if target_col in group_df.columns and not group_df.empty:
                pr = positive_rate(group_df[target_col], override=pos_label)
            else:
                pr = 0.0

            missing_rate = (
                float(group_df.isna().mean().mean()) if not group_df.empty else 0.0
            )
            representation_ratio = count_int / total_rows

            stats_for_sensitive[str(group_value)] = {
                "count": count_int,
                "positive_rate": round(pr, 4),
                "missing_rate": round(missing_rate, 4),
                "under_represented": bool(representation_ratio < 0.2),
                "representation_ratio": round(representation_ratio, 4),
            }
            if representation_ratio < 0.2:
                under_represented_groups.append(str(group_value))

        group_stats[sensitive] = stats_for_sensitive

    # Overall class distribution
    if target_col in df.columns:
        ovr_pr = positive_rate(df[target_col], override=pos_label)
    else:
        ovr_pr = 0.0

    class_distribution = {
        "approved": round(ovr_pr, 4),
        "rejected": round(1.0 - ovr_pr, 4),
    }

    # ── Balanced representation analysis ─────────────────────────────────
    balanced_attributes: list[str] = []
    imbalanced_attributes: list[str] = []
    for sensitive in sensitive_cols:
        if sensitive not in df.columns:
            continue
        counts = df[sensitive].value_counts(normalize=True)
        max_frac = float(counts.max())
        if max_frac > 0.80:
            imbalanced_attributes.append(sensitive)
        else:
            balanced_attributes.append(sensitive)

    # Missing data
    missing_data = {
        column: round(float(df[column].isna().mean()), 4) for column in df.columns
    }

    # Approval-rate gap across groups
    max_gap = 0.0
    worst_reason = "No gaps detected"
    for sensitive in sensitive_cols:
        if sensitive not in df.columns or target_col not in df.columns:
            continue
        try:
            pd.to_numeric(df[target_col], errors="coerce")
            rates = (
                df.groupby(sensitive)[target_col]
                .apply(lambda s: float(pd.to_numeric(s, errors="coerce").mean()))
                .dropna()
            )
            if rates.empty:
                continue
            gap = float(rates.max() - rates.min())
            if gap > max_gap:
                max_gap = gap
                worst_reason = f"Approval rate gap between {sensitive} groups is {round(gap * 100)}%"
        except Exception as exc:
            logger.debug(
                "Could not compute approval-rate gap for %s: %s", sensitive, exc
            )
            continue

    risk_level = risk_from_gap(max_gap, domain)

    return {
        "group_stats": group_stats,
        "class_distribution": class_distribution,
        "under_represented_groups": under_represented_groups,
        "missing_data": missing_data,
        "risk_level": risk_level,
        "risk_reason": worst_reason,
        "max_gap": round(max_gap, 4),
        "dataset_quality": quality.to_dict(),
        "balanced_attributes": balanced_attributes,
        "imbalanced_attributes": imbalanced_attributes,
    }
