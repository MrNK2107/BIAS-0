from __future__ import annotations

import io
from pathlib import Path

import pandas as pd
from fastapi import UploadFile


async def upload_file_to_dataframe(file: UploadFile) -> pd.DataFrame:
    raw = await file.read()
    return pd.read_csv(io.BytesIO(raw))


def path_to_dataframe(path: str | Path) -> pd.DataFrame:
    return pd.read_csv(Path(path))


def dataframe_to_csv_text(df: pd.DataFrame) -> str:
    return df.to_csv(index=False)
