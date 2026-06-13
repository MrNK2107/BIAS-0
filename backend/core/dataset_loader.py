from __future__ import annotations

import io
from typing import Any

import pandas as pd


SUPPORTED_FORMATS = {".csv", ".tsv", ".xlsx", ".xls", ".json", ".parquet"}


def infer_format(filename: str) -> str | None:
    import os
    _, ext = os.path.splitext(filename)
    return ext.lower() if ext.lower() in SUPPORTED_FORMATS else None


def load_dataset(content: bytes, filename: str) -> pd.DataFrame:
    fmt = infer_format(filename)
    if fmt == ".csv":
        return pd.read_csv(io.BytesIO(content))
    if fmt == ".tsv":
        return pd.read_csv(io.BytesIO(content), sep="\t")
    if fmt in (".xlsx", ".xls"):
        return pd.read_excel(io.BytesIO(content))
    if fmt == ".json":
        return pd.read_json(io.BytesIO(content))
    if fmt == ".parquet":
        return pd.read_parquet(io.BytesIO(content))
    raise ValueError(f"Unsupported file format '{fmt}'. Supported: {', '.join(sorted(SUPPORTED_FORMATS))}")


def preview_dataframe(df: pd.DataFrame, n: int = 5) -> dict[str, Any]:
    return {
        "columns": list(df.columns),
        "dtypes": {str(c): str(df[c].dtype) for c in df.columns},
        "rows": len(df),
        "preview": df.head(n).to_dict(orient="records"),
        "missing_summary": {str(c): int(df[c].isna().sum()) for c in df.columns if df[c].isna().any()},
    }
