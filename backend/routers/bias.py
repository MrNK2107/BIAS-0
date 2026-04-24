from __future__ import annotations

import json
from typing import Any

import pandas as pd
import requests
from fastapi import APIRouter, Depends, File, Form, UploadFile
from sklearn.metrics import accuracy_score

from core.common import fairness_gaps, fairness_score_from_gaps, group_metrics, prepare_split, risk_from_score
from core.counterfactual import run_counterfactual_test
from core.explainability import explain_flagged_decisions, generate_narrative_summary
from core.model_bias import run_model_bias_analysis
from core.stress_test import run_stress_tests
from pydantic import BaseModel
from utils.data_io import upload_file_to_dataframe

router = APIRouter(prefix="/bias", tags=["bias"])


def get_metric_weights(metric_priority: str = "balanced") -> dict[str, float]:
    """Convert metric priority string to weights dictionary."""
    if metric_priority == "equal_opportunity_first":
        return {
            "demographic_parity_difference": 15,
            "equal_opportunity_difference": 45,
            "fpr_gap": 15,
        }
    elif metric_priority == "demographic_parity_first":
        return {
            "demographic_parity_difference": 45,
            "equal_opportunity_difference": 15,
            "fpr_gap": 15,
        }
    else:  # "balanced" or default
        return {
            "demographic_parity_difference": 30,
            "equal_opportunity_difference": 25,
            "fpr_gap": 20,
        }


@router.post("/model")
async def bias_model(
    sensitive_cols: str = Form(...),
    target_col: str = Form(...),
    file: UploadFile = File(...),
    model_path: str | None = Form(None),
    metric_priority: str = Form(default="balanced"),
) -> dict[str, Any]:
    df = await upload_file_to_dataframe(file)
    sensitive_list = [item.strip() for item in sensitive_cols.split(",") if item.strip()]
    metric_weights = get_metric_weights(metric_priority)
    return run_model_bias_analysis(df, sensitive_list, target_col, model_path=model_path, metric_weights=metric_weights)


@router.post("/model-from-api")
async def bias_model_from_api(
    api_url: str = Form(...),
    api_request_format: str = Form(...),
    sensitive_cols: str = Form(...),
    target_col: str = Form(...),
    file: UploadFile = File(...),
    metric_priority: str = Form(default="balanced"),
) -> dict[str, Any]:
    """
    Analyze bias using predictions from an external API endpoint.
    
    api_request_format should be a JSON template with column names as placeholders.
    Example: {"input": "{feature1}", "age": {age}, "score": {score}}
    """
    df = await upload_file_to_dataframe(file)
    sensitive_list = [item.strip() for item in sensitive_cols.split(",") if item.strip()]
    metric_weights = get_metric_weights(metric_priority)
    
    # Prepare data split
    prepared = prepare_split(df, target_col)
    X_test = prepared.X_test
    y_test = prepared.y_test
    
    # Parse the request template
    request_template = json.loads(api_request_format)
    
    # Collect predictions from API
    predictions = []
    for idx, row in X_test.iterrows():
        # Replace placeholders in template with actual row values
        request_data = _substitute_template(request_template, row)
        
        try:
            response = requests.post(api_url, json=request_data, timeout=30)
            response.raise_for_status()
            pred = response.json()
            # Assume the API returns a dict with 'prediction' key
            # Adjust this based on your API response format
            if isinstance(pred, dict) and "prediction" in pred:
                predictions.append(pred["prediction"])
            elif isinstance(pred, (int, float)):
                predictions.append(int(pred))
            else:
                # Try to extract a single numeric value
                predictions.append(int(list(pred.values())[0]))
        except Exception as e:
            raise ValueError(f"Failed to get prediction for row {idx} from {api_url}: {str(e)}")
    
    # Create predictions series
    y_pred = pd.Series(predictions, index=y_test.index)
    
    # Calculate bias metrics
    overall_accuracy = float(accuracy_score(y_test, y_pred))
    
    metrics = {"demographic_parity_difference": 0.0, "equal_opportunity_difference": 0.0, "fpr_gap": 0.0}
    for sensitive in sensitive_list:
        if sensitive not in df.columns:
            continue
        current_metrics = fairness_gaps(y_pred, y_test, df.loc[y_test.index, sensitive])
        for key, value in current_metrics.items():
            metrics[key] = max(metrics[key], value)
    
    fairness_score = fairness_score_from_gaps(metrics, metric_weights=metric_weights)
    risk_level = risk_from_score(fairness_score)
    
    group_performance: dict[str, Any] = {}
    for sensitive in sensitive_list:
        if sensitive not in df.columns:
            continue
        group_series = df.loc[y_test.index, sensitive]
        group_performance[sensitive] = group_metrics(y_test, y_pred, group_series)
    
    return {
        "overall_accuracy": round(overall_accuracy, 4),
        "fairness_score": round(fairness_score),
        "risk_level": risk_level,
        "metrics": {key: round(value, 4) for key, value in metrics.items()},
        "group_performance": group_performance,
        "model_used": "external_api",
    }


def _substitute_template(template: Any, row: pd.Series) -> Any:
    """
    Recursively substitute placeholders in template with row values.
    Placeholders are in the format {column_name} for string values.
    """
    if isinstance(template, str):
        # Handle string placeholders like "{column_name}"
        result = template
        for col_name in row.index:
            placeholder = "{" + col_name + "}"
            if placeholder in result:
                result = result.replace(placeholder, str(row[col_name]))
        return result
    elif isinstance(template, dict):
        return {k: _substitute_template(v, row) for k, v in template.items()}
    elif isinstance(template, list):
        return [_substitute_template(item, row) for item in template]
    else:
        return template


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


class ExplainSummaryRequest(BaseModel):
    flagged_list: list[dict[str, Any]]
    sensitive_cols: list[str]
    domain: str


@router.post("/explain-summary")
async def explain_summary(request: ExplainSummaryRequest) -> dict[str, str]:
    summary = generate_narrative_summary(request.flagged_list, request.sensitive_cols, request.domain)
    return {"summary": summary}


@router.post("/counterfactual")
async def bias_counterfactual(
    sensitive_col: str = Form(...),
    target_col: str = Form(...),
    file: UploadFile = File(...),
    model_path: str | None = Form(None),
    metric_priority: str = Form(default="balanced"),
) -> dict[str, Any]:
    df = await upload_file_to_dataframe(file)
    metric_weights = get_metric_weights(metric_priority)
    return run_counterfactual_test(df, None, sensitive_col, target_col, metric_weights=metric_weights)


@router.post("/stress")
async def bias_stress(
    sensitive_cols: str = Form(...),
    target_col: str = Form(...),
    file: UploadFile = File(...),
    model_path: str | None = Form(None),
    metric_priority: str = Form(default="balanced"),
    custom_scenarios: str | None = Form(None),
) -> dict[str, Any]:
    df = await upload_file_to_dataframe(file)
    sensitive_list = [item.strip() for item in sensitive_cols.split(",") if item.strip()]
    
    custom_list = None
    if custom_scenarios:
        try:
            custom_list = json.loads(custom_scenarios)
        except json.JSONDecodeError:
            pass
            
    return run_stress_tests(df, None, sensitive_list, target_col, custom_scenarios=custom_list)
