from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, Form, UploadFile

from core.sandbox import run_sandbox_simulation
from utils.data_io import upload_file_to_dataframe

router = APIRouter(prefix="/fixes", tags=["sandbox"])


@router.post("/sandbox")
async def sandbox_route(
    sensitive_cols: str = Form(...),
    target_col: str = Form(...),
    fixes_to_apply: str = Form("[]"),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    import json

    df = await upload_file_to_dataframe(file)
    sensitive_list = [item.strip() for item in sensitive_cols.split(",") if item.strip()]
    return run_sandbox_simulation(df, sensitive_list, target_col, json.loads(fixes_to_apply))
