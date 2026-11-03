from __future__ import annotations

import logging
import uuid
from typing import Any

import joblib
import numpy as np
import pandas as pd
import sklearn.metrics
from fairlearn.metrics import (
    MetricFrame,
    false_positive_rate,
    true_positive_rate,
)
from sklearn.metrics import accuracy_score

from .common import (
    MIN_SUBGROUP_SIZE,
    build_classifier,
    fairness_gaps,
    fairness_score_from_gaps,
    fit_classifier,
    group_metrics,
    normalize_target_binary,
    overfit_assessment,
    permutation_fairness_pvalue,
    prepare_split,
    risk_from_score,
    train_multiple_models,
)
from .data import _binary_codes, _norm_label, infer_positive_label
from .metrics import ZERO_GAPS
from .rigour import analyse_statistical_rigour

logger = logging.getLogger(__name__)


def _to_native(d: dict) -> dict:
    """JSON-safe floats. NaN (e.g. TPR of a group with no actual positives)
    becomes None, not 0.0, so an undefined rate is not reported as zero."""
    clean: dict[str, float | None] = {}
    for k, v in d.items():
        try:
            val = float(v)
        except (ValueError, TypeError):
            clean[str(k)] = None
            continue
        clean[str(k)] = None if (np.isnan(val) or np.isinf(val)) else val
    return clean


class LabelMappedModel:
    """Adapter for a user model that predicts the original target labels
    ("hired" / "rejected"): ``predict`` returns 0/1 with ``positive_label`` as 1,
    matching how the target column was encoded. 0/1 and boolean predictions
    pass through unchanged."""

    def __init__(self, model: Any, positive_label: Any = None, target_labels: Any = None):
        self.model = model
        self.positive_label = positive_label
        self.target_labels = (
            {_norm_label(v) for v in target_labels} if target_labels is not None else None
        )
        self.classes_ = np.array([0, 1])

    def __getattr__(self, name: str) -> Any:
        # Only reached for attributes not set in __init__ (named_steps, ...).
        return getattr(self.__dict__["model"], name)

    def encode(self, pred: Any) -> np.ndarray:
        arr = np.asarray(pred)
        if arr.dtype == bool:
            return arr.astype(int)
        if np.issubdtype(arr.dtype, np.number):
            uniq = set(np.unique(arr[~np.isnan(arr.astype(float))]).tolist())
            if uniq <= {0, 1} or self.positive_label is None:
                return arr
            try:
                return (arr.astype(float) == float(self.positive_label)).astype(int)
            except (TypeError, ValueError):
                return arr
        norm = pd.Series(arr).astype(str).str.strip().str.lower()
        predicted = set(norm.unique())
        if self.positive_label is None:
            return _binary_codes(pd.Series(arr)).to_numpy()
        pos = _norm_label(self.positive_label)
        unknown = predicted - self.target_labels if self.target_labels else set()
        if unknown or len(predicted) > 2 or (pos not in predicted and not self.target_labels):
            raise ValueError(
                f"The model predicted labels {sorted(predicted)}, which cannot be mapped "
                f"to the target's positive label '{self.positive_label}'."
            )
        return (norm == pos).astype(int).to_numpy()

    def predict(self, X: Any) -> np.ndarray:
        return self.encode(self.model.predict(X))

    def predict_proba(self, X: Any) -> np.ndarray:
        proba = np.asarray(self.model.predict_proba(X), dtype=float)
        classes = list(getattr(self.model, "classes_", [0, 1]))
        if proba.ndim != 2 or proba.shape[1] != 2 or len(classes) != 2:
            return proba
        pos = self.positive_label
        idx = next(
            (i for i, c in enumerate(classes) if pos is not None and _norm_label(c) == _norm_label(pos)),
            classes.index(1) if 1 in classes else 1,
        )
        return np.column_stack([1.0 - proba[:, idx], proba[:, idx]])


def wrap_label_model(model: Any, positive_label: Any = None, target_labels: Any = None) -> Any:
    if model is None or isinstance(model, LabelMappedModel):
        return model
    return LabelMappedModel(model, positive_label, target_labels)


def run_model_bias_analysis(
    df: pd.DataFrame,
    sensitive_cols: list[str],
    target_col: str,
    model=None,
    model_path: str | None = None,
    metric_weights: dict[str, float] | None = None,
    domain: str = "other",
    model_types: list[str] | None = None,
    rigour_config: dict[str, Any] | None = None,
    positive_label: Any = None,
) -> dict[str, Any]:
    """``positive_label`` is the target label the user treats as the positive
    (selected) class, in the original label space; None infers it."""
    target_labels = None
    if target_col in df.columns:
        raw = df[target_col].dropna()
        already_binary = pd.api.types.is_numeric_dtype(raw) and set(pd.unique(raw)) <= {0, 1}
        if not already_binary:
            target_labels = list(pd.unique(raw))
        if positive_label is None and not already_binary:
            positive_label = infer_positive_label(raw)
    normalize_target_binary(df, target_col, positive_label=positive_label)
    prepared = prepare_split(df, target_col)

    # ── Multi-model training ─────────────────────────────────────────────
    trained_models: dict[str, Any] = {}

    # User models may predict the original text labels: map them to 0/1 with
    # the same positive class as the target.
    if model is not None:
        trained_models["shared"] = wrap_label_model(model, positive_label, target_labels)
    elif model_path:
        trained_models["user_provided"] = wrap_label_model(
            joblib.load(model_path), positive_label, target_labels
        )
    else:
        if model_types is None:
            model_types = ["rf", "xgb", "linear"]
        trained_models = train_multiple_models(
            prepared.X_train, prepared.y_train, model_types
        )

    # ── Evaluate each model ──────────────────────────────────────────────
    model_results: dict[str, dict[str, Any]] = {}
    for model_name, pipe in trained_models.items():
        try:
            y_pred = pd.Series(
                pipe.predict(prepared.X_test), index=prepared.y_test.index
            )
            overall_accuracy = float(accuracy_score(prepared.y_test, y_pred))
            overfit = overfit_assessment(
                accuracy_score(prepared.y_train, pipe.predict(prepared.X_train)) if hasattr(pipe, "predict") else 0.0,
                overall_accuracy,
            )

            metrics = dict(ZERO_GAPS)
            all_pvalues: dict[str, list[float]] = {
                "demographic_parity_difference": [],
                "equal_opportunity_difference": [],
                "fpr_gap": [],
                "fnr_gap": [],
            }
            for sensitive in sensitive_cols:
                if sensitive not in df.columns:
                    continue
                group_series = df.loc[prepared.y_test.index, sensitive]
                current_metrics = fairness_gaps(y_pred, prepared.y_test, group_series)
                for key, value in current_metrics.items():
                    metrics[key] = max(metrics[key], value)

                # Confidence intervals are computed once, for the selected
                # model, in the statistical-rigour block below.

                # Permutation p-values
                pvals = permutation_fairness_pvalue(
                    y_pred, prepared.y_test, group_series
                )
                for k in all_pvalues:
                    all_pvalues[k].append(pvals.get(k, 1.0))

            # Aggregate p-values across sensitive columns (min = most significant)
            agg_pvalues = {
                k: round(min(v), 4) if v else 1.0 for k, v in all_pvalues.items()
            }

            fairness_score = fairness_score_from_gaps(
                metrics, metric_weights=metric_weights
            )
            risk_level = risk_from_score(fairness_score, domain)

            group_performance: dict[str, Any] = {}
            for sensitive in sensitive_cols:
                if sensitive not in df.columns:
                    continue
                group_series = df.loc[prepared.y_test.index, sensitive]
                group_performance[sensitive] = group_metrics(
                    prepared.y_test, y_pred, group_series
                )

            low_confidence: list[dict[str, Any]] = []
            for sensitive in group_performance:
                # group_metrics has no "count" key, so this used to read 0 and
                # flag every group as low confidence.
                sizes = (
                    df.loc[prepared.y_test.index, sensitive].astype(str).value_counts()
                )
                for group, n in sizes.items():
                    if int(n) < MIN_SUBGROUP_SIZE:
                        low_confidence.append({
                            "sensitive": sensitive,
                            "group": str(group),
                            "count": int(n),
                        })

            model_results[model_name] = {
                "overall_accuracy": round(overall_accuracy, 4),
                "fairness_score": round(fairness_score),
                "risk_level": risk_level,
                "metrics": {key: round(value, 4) for key, value in metrics.items()},
                "p_values": agg_pvalues,
                "group_performance": group_performance,
                "overfit": overfit,
                "low_confidence_subgroups": low_confidence,
            }

        except Exception as exc:
            model_results[model_name] = {"error": str(exc)}

    # ── Pick best model: fairness-first, accuracy as tiebreaker ──────────
    best_model_name = max(
        model_results,
        key=lambda m: (
            model_results[m].get("fairness_score", 0),
            model_results[m].get("overall_accuracy", 0),
        )
        if "error" not in model_results[m]
        else (-1, -1),
    )
    best = model_results.get(best_model_name, {})

    # ── Fairlearn MetricFrame (on best model) ────────────────────────────
    fairlearn_metrics: dict[str, Any] = {}
    if best_model_name in trained_models and "error" not in best:
        pipe = trained_models[best_model_name]
        try:
            y_pred_best = pd.Series(
                pipe.predict(prepared.X_test), index=prepared.y_test.index
            )
            for sensitive in sensitive_cols:
                if sensitive not in df.columns:
                    continue
                sensitive_features = df.loc[prepared.y_test.index, sensitive]

                try:
                    mf = MetricFrame(
                        metrics={
                            "accuracy": sklearn.metrics.accuracy_score,
                            "tpr": true_positive_rate,
                            "fpr": false_positive_rate,
                        },
                        y_true=prepared.y_test,
                        y_pred=y_pred_best,
                        sensitive_features=sensitive_features,
                    )
                    fairlearn_metrics[sensitive] = {
                        "by_group": {
                            metric: _to_native(vals)
                            for metric, vals in mf.by_group.to_dict().items()
                        },
                        "overall": _to_native(mf.overall.to_dict()),
                        "difference": _to_native(mf.difference().to_dict()),
                    }
                except Exception as exc:
                    logger.debug(
                        "Fairlearn MetricFrame failed for %s: %s", sensitive, exc
                    )
                    fairlearn_metrics[sensitive] = {
                        "by_group": {},
                        "overall": {},
                        "difference": {},
                    }
        except Exception as exc:
            logger.debug("Fairlearn evaluation overall failed: %s", exc)

    # ── Intersectional bias (3+ columns) ─────────────────────────────────
    hidden_bias: list[dict[str, Any]] = []
    if "error" not in best:
        hidden_bias = _compute_intersectional_bias(
            df, prepared, sensitive_cols, best_model_name, trained_models
        )

    # ── Statistical rigour (CIs, small groups, intersections, calibration) ─
    statistical_rigour: dict[str, Any] = {}
    if best_model_name in trained_models and "error" not in best:
        try:
            statistical_rigour = _statistical_rigour(
                df, prepared, sensitive_cols, trained_models[best_model_name], rigour_config
            )
        except Exception as exc:  # never fail the audit over the extra block
            logger.warning("Statistical rigour analysis failed: %s", exc)

    # ── NYC LL144 rates (selection always; scoring when the model gives a score) ─
    ll144: dict[str, Any] = {}
    if best_model_name in trained_models and "error" not in best:
        try:
            ll144 = _ll144_block(df, prepared, sensitive_cols, trained_models[best_model_name])
        except Exception as exc:  # never fail the audit over the extra block
            logger.warning("LL144 rates failed: %s", exc)

    return {
        "overall_accuracy": best.get("overall_accuracy", 0.0),
        "fairness_score": best.get("fairness_score", 0),
        "risk_level": best.get("risk_level", "Red"),
        "metrics": best.get("metrics", {}),
        "p_values": best.get("p_values", {}),
        "group_performance": best.get("group_performance", {}),
        "fairlearn_metrics": fairlearn_metrics,
        "model_used": best_model_name,
        "hidden_bias": hidden_bias,
        "statistical_rigour": statistical_rigour,
        "ll144": ll144,
        "all_models": {
            name: {k: v for k, v in res.items() if k != "group_performance"}
            for name, res in model_results.items()
        },
    }


def _ll144_block(
    df: pd.DataFrame, prepared: Any, sensitive_cols: list[str], pipe: Any
) -> dict[str, Any]:
    """Test-set rates for the LL144 impact-ratio table: ``selection`` from the
    model's decisions, ``scoring`` from its P(positive) score when it has one
    (scoring rate = share above the full-sample median, 6 RCNY 5-301(c))."""
    from .compliance import ll144_rates

    cols = [c for c in sensitive_cols if c in df.columns]
    if not cols:
        return {}
    groups = df.loc[prepared.y_test.index, cols]
    decisions = np.asarray(pipe.predict(prepared.X_test), dtype=float)
    out: dict[str, Any] = {"selection": ll144_rates(groups, decisions, "selection")}
    scores = _positive_scores(pipe, prepared.X_test)
    out["scoring"] = ll144_rates(groups, scores, "scoring") if scores is not None else None
    return out


def _positive_scores(pipe: Any, X: pd.DataFrame) -> np.ndarray | None:
    """P(y=1) from the model, or None when it has no usable predict_proba."""
    if not hasattr(pipe, "predict_proba"):
        return None
    try:
        proba = np.asarray(pipe.predict_proba(X), dtype=float)
    except Exception as exc:
        logger.debug("predict_proba unavailable: %s", exc)
        return None
    if proba.ndim != 2 or proba.shape[1] != 2:
        return None
    classes = list(getattr(pipe, "classes_", [0, 1]))
    col = classes.index(1) if 1 in classes else 1
    return proba[:, col]


def _statistical_rigour(
    df: pd.DataFrame,
    prepared: Any,
    sensitive_cols: list[str],
    pipe: Any,
    config: dict[str, Any] | None,
) -> dict[str, Any]:
    idx = prepared.y_test.index
    y_pred = np.asarray(pipe.predict(prepared.X_test))
    y_score = _positive_scores(pipe, prepared.X_test)
    frame = df.loc[idx, [c for c in sensitive_cols if c in df.columns]]
    return analyse_statistical_rigour(
        frame,
        sensitive_cols,
        prepared.y_test.to_numpy(),
        y_pred,
        y_score,
        config=config,
    )


def _compute_intersectional_bias(
    df: pd.DataFrame,
    prepared: Any,
    sensitive_cols: list[str],
    best_model_name: str,
    trained_models: dict[str, Any],
) -> list[dict[str, Any]]:
    """Compute hidden bias across intersectional groups (supports 2+ sensitive columns).

    Uses UUID-suffixed temp column names to avoid collision with user dataset columns.
    """
    if best_model_name not in trained_models:
        return []
    pipe = trained_models[best_model_name]
    y_pred = pd.Series(pipe.predict(prepared.X_test), index=prepared.y_test.index)
    df_test = df.loc[prepared.y_test.index].copy()

    _COMBO = f"__combo_{uuid.uuid4().hex[:8]}"
    _COMBO3 = f"__combo3_{uuid.uuid4().hex[:8]}"

    hidden_bias: list[dict[str, Any]] = []

    overall_rate = float(y_pred.mean())
    # Single-attribute hidden bias for each sensitive column
    for col in sensitive_cols:
        if col not in df_test.columns:
            continue
        for val, group_df in df_test.groupby(col):
            idx = group_df.index
            if len(idx) < MIN_SUBGROUP_SIZE:
                continue
            group_rate = float(y_pred.loc[idx].mean())
            diff = group_rate - overall_rate
            hidden_bias.append(
                {
                    "id": f"{col}={val}",
                    "definition": f"{col} = {val}",
                    "attributes": {col: str(val)},
                    "metricDifference": f"{diff:+.0%}",
                    "metricValue": round(diff, 4),
                    "sampleSize": len(idx),
                    "metricName": "Approval Rate",
                }
            )

    # Pairwise intersections (2 columns)
    for i in range(len(sensitive_cols)):
        for j in range(i + 1, len(sensitive_cols)):
            col_a, col_b = sensitive_cols[i], sensitive_cols[j]
            if col_a not in df_test.columns or col_b not in df_test.columns:
                continue
            if _COMBO in df_test.columns:
                df_test.drop(columns=[_COMBO], inplace=True)
            df_test[_COMBO] = (
                df_test[col_a].astype(str) + " + " + df_test[col_b].astype(str)
            )
            for combo, group_df in df_test.groupby(_COMBO):
                idx = group_df.index
                if len(idx) < 15:
                    continue
                group_rate = float(y_pred.loc[idx].mean())
                diff = group_rate - overall_rate
                parts = str(combo).split(" + ")
                hidden_bias.append(
                    {
                        "id": str(combo),
                        "definition": str(combo),
                        "attributes": {
                            col_a: parts[0],
                            col_b: parts[1] if len(parts) > 1 else "",
                        },
                        "metricDifference": f"{diff:+.0%}",
                        "metricValue": round(diff, 4),
                        "sampleSize": len(idx),
                        "metricName": "Approval Rate (intersection)",
                    }
                )

    # Triple intersections (3 columns)
    if len(sensitive_cols) >= 3:
        col_a, col_b, col_c = sensitive_cols[0], sensitive_cols[1], sensitive_cols[2]
        if all(c in df_test.columns for c in [col_a, col_b, col_c]):
            if _COMBO3 in df_test.columns:
                df_test.drop(columns=[_COMBO3], inplace=True)
            df_test[_COMBO3] = (
                df_test[col_a].astype(str)
                + " + "
                + df_test[col_b].astype(str)
                + " + "
                + df_test[col_c].astype(str)
            )
            for combo, group_df in df_test.groupby(_COMBO3):
                idx = group_df.index
                if len(idx) < 10:
                    continue
                group_rate = float(y_pred.loc[idx].mean())
                diff = group_rate - overall_rate
                parts = str(combo).split(" + ")
                hidden_bias.append(
                    {
                        "id": str(combo),
                        "definition": str(combo),
                        "attributes": {
                            col_a: parts[0],
                            col_b: parts[1],
                            col_c: parts[2] if len(parts) > 2 else "",
                        },
                        "metricDifference": f"{diff:+.0%}",
                        "metricValue": round(diff, 4),
                        "sampleSize": len(idx),
                        "metricName": "Approval Rate (3-way)",
                    }
                )

    # Cleanup temp columns
    for col in [_COMBO, _COMBO3]:
        if col in df_test.columns:
            df_test.drop(columns=[col], inplace=True)

    return sorted(hidden_bias, key=lambda x: abs(x["metricValue"]), reverse=True)[:20]
