from __future__ import annotations

from typing import Any

import pandas as pd
from fastapi import APIRouter, Depends, File, Form, UploadFile

from core.counterfactual import run_counterfactual_test
from core.explainability import explain_flagged_decisions
from core.model_bias import run_model_bias_analysis
from core.stress_test import run_stress_tests
from utils.data_io import upload_file_to_dataframe

router = APIRouter(prefix="/bias", tags=["bias"])


@router.post("/model")
async def bias_model(
    sensitive_cols: str = Form(...),
    target_col: str = Form(...),
    file: UploadFile = File(...),
    model_path: str | None = Form(None),
) -> dict[str, Any]:
    df = await upload_file_to_dataframe(file)
    sensitive_list = [item.strip() for item in sensitive_cols.split(",") if item.strip()]
    return run_model_bias_analysis(df, sensitive_list, target_col, model_path=model_path)


@router.post("/explain")
async def bias_explain(
    sensitive_cols: str = Form(...),
    target_col: str = Form(...),
    file: UploadFile = File(...),
    model_path: str | None = Form(None),
    n_samples: int = Form(5),
) -> list[dict[str, Any]]:
    df = await upload_file_to_dataframe(file)
    sensitive_list = [item.strip() for item in sensitive_cols.split(",") if item.strip()]
    return explain_flagged_decisions(df, None, sensitive_list, target_col, n_samples=n_samples)


@router.post("/counterfactual")
async def bias_counterfactual(
    sensitive_col: str = Form(...),
    target_col: str = Form(...),
    file: UploadFile = File(...),
    model_path: str | None = Form(None),
) -> dict[str, Any]:
    df = await upload_file_to_dataframe(file)
    return run_counterfactual_test(df, None, sensitive_col, target_col)


@router.post("/stress")
async def bias_stress(
    sensitive_cols: str = Form(...),
    target_col: str = Form(...),
    file: UploadFile = File(...),
    model_path: str | None = Form(None),
) -> dict[str, Any]:
    df = await upload_file_to_dataframe(file)
    sensitive_list = [item.strip() for item in sensitive_cols.split(",") if item.strip()]
    return run_stress_tests(df, None, sensitive_list, target_col)
