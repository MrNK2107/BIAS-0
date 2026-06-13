from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pandas as pd


@dataclass
class DatasetQualityReport:
    """Evaluates whether a dataset is large / balanced enough for meaningful fairness analysis."""

    is_sufficient: bool
    n_rows: int
    n_features: int
    min_class_size: int
    min_group_size: int | None = None
    warnings: list[str] = field(default_factory=list)

    MIN_ROWS = 50
    MIN_CLASS_FRACTION = 0.10
    MIN_GROUP_SIZE = 20

    def to_dict(self) -> dict[str, Any]:
        return {
            "is_sufficient": self.is_sufficient,
            "n_rows": self.n_rows,
            "n_features": self.n_features,
            "min_class_size": self.min_class_size,
            "min_group_size": self.min_group_size,
            "warnings": self.warnings,
        }


def check_dataset_quality(
    df: pd.DataFrame, target_col: str, sensitive_cols: list[str]
) -> DatasetQualityReport:
    """Return a quality report with warnings when the dataset is too small or imbalanced."""
    n = len(df)
    warnings: list[str] = []

    if n < DatasetQualityReport.MIN_ROWS:
        warnings.append(
            f"Dataset has only {n} rows; fairness metrics on < {DatasetQualityReport.MIN_ROWS} rows "
            f"are unreliable. Consider collecting more data."
        )

    n_features = len(df.columns) - 1  # exclude target
    min_class_size = 0
    if target_col in df.columns:
        counts = df[target_col].value_counts()
        min_class_size = int(counts.min()) if len(counts) > 1 else n
        if min_class_size < n * DatasetQualityReport.MIN_CLASS_FRACTION:
            warnings.append(
                f"Minority class has only {min_class_size} samples ({min_class_size/n*100:.1f}%). "
                f"Class imbalance degrades metric reliability."
            )

    min_group_size: int | None = None
    for col in sensitive_cols:
        if col in df.columns:
            gs = df[col].value_counts()
            smallest = int(gs.min())
            if min_group_size is None or smallest < min_group_size:
                min_group_size = smallest
            if smallest < DatasetQualityReport.MIN_GROUP_SIZE:
                warnings.append(
                    f"Sensitive group '{col}' has only {smallest} samples in its smallest subgroup. "
                    f"Fairness gaps for groups under {DatasetQualityReport.MIN_GROUP_SIZE} may be noise-dominated."
                )

    is_sufficient = n >= DatasetQualityReport.MIN_ROWS and (
        min_group_size is None or min_group_size >= DatasetQualityReport.MIN_GROUP_SIZE
    )
    return DatasetQualityReport(
        is_sufficient=is_sufficient,
        n_rows=n,
        n_features=n_features,
        min_class_size=min_class_size,
        min_group_size=min_group_size,
        warnings=warnings,
    )
