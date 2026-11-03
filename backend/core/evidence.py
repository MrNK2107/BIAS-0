"""Provenance for an audit run: what was audited, with which settings and code.

The block is attached to every pipeline result as ``provenance`` and is the
backbone of the exported evidence pack. It lets a reviewer check that a report
belongs to a given input file (SHA-256 of the exact uploaded bytes) and was
produced with known metric definitions and library versions.

Bump a ``METRIC_VERSIONS`` entry whenever the definition or computation of that
metric changes in a way that can change its value for the same input.
"""

from __future__ import annotations

import hashlib
import os
import platform
import re
from importlib import metadata
from typing import Any

from core.common import utcnow_iso

BIAS0_VERSION = "0.4.0"
# 1.1.0: input.filename is the original upload name; input.stored_name added.
# 1.2.0: config.positive_label ({value, source}) records the positive class.
# 1.3.0: config.target_binarisation records how the target became 0/1.
# 1.4.0: config.ll144_rate_type ({value, source}): NYC LL144 selection or scoring rates.
PROVENANCE_SCHEMA_VERSION = "1.4.0"

METRIC_VERSIONS: dict[str, str] = {
    # core.metrics.fairness_gaps: max-minus-min over groups (fairlearn between_groups)
    # 1.1.0 (2026-11-02): missing protected values form a "(missing)" group;
    # missing labels are dropped, two-valued labels map to 0/1; per-group
    # TPR/FPR are null when undefined.
    "fairness_gaps": "1.1.0",
    # core.rigour: stratified percentile bootstrap, Wilson rate CIs, small-group flags
    "bootstrap_ci": "1.1.0",
    "small_group_flags": "1.1.0",
    # core.rigour: intersectional gaps over reliable cells only
    "intersectional_gaps": "1.1.0",
    # core.rigour.calibration_summary: equal-width bins, ECE weighted by bin count
    "calibration": "1.0.0",
    # routers.pipeline: 0.25 model + 0.20 counterfactual + 0.20 stress + 0.20 data + 0.15 proxy
    "unified_fairness_score": "1.0.0",
}

UNIFIED_SCORE_WEIGHTS: dict[str, float] = {
    "model_bias_score": 0.25,
    "counterfactual_score": 0.20,
    "stress_test_score": 0.20,
    "data_bias_score": 0.20,
    "proxy_risk_score": 0.15,
}

_LIBRARIES = ("numpy", "pandas", "scikit-learn", "fairlearn", "xgboost", "lightgbm", "shap")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# Storage object names are "<uuid4 hex>_<original name>" (core/storage.py).
_STORED_NAME_RE = re.compile(r"^[0-9a-f]{32}_(.+)$")


def display_name(name: str | None) -> str:
    """Base name of an uploaded file as the user's browser sent it."""
    base = os.path.basename((name or "").replace("\\", "/"))
    return base or "upload.csv"


def original_name_from_stored(stored: str) -> str:
    """Recover the upload name from a storage path or object name.

    Projects created before the original name was recorded only have the
    stored object (``<32 hex>_demo_loan.csv``); the prefix is stripped. A name
    without that prefix is returned unchanged.
    """
    base = display_name(stored)
    m = _STORED_NAME_RE.match(base)
    return m.group(1) if m else base


def library_versions() -> dict[str, str | None]:
    out: dict[str, str | None] = {"python": platform.python_version()}
    for name in _LIBRARIES:
        try:
            out[name] = metadata.version(name)
        except metadata.PackageNotFoundError:
            out[name] = None
    return out

# NYC LL144 (6 RCNY 5-301): selection rates (b) when the tool outputs a decision,
# scoring rates (c) when it outputs a score. Selection is the default.
LL144_RATE_TYPES = ("selection", "scoring")


def project_ll144_rate_type(project: dict[str, Any]) -> dict[str, str]:
    """``{value, source}`` for provenance: the project setting, or the default."""
    value = project.get("ll144RateType")
    if value in LL144_RATE_TYPES:
        return {"value": value, "source": "project"}
    return {"value": "selection", "source": "default"}


def build_provenance(
    *,
    df_bytes: bytes,
    filename: str,
    n_rows: int,
    columns: list[str],
    sensitive_cols: list[str],
    target_col: str,
    domain: str,
    metric_weights: dict[str, float],
    model_used: str,
    model_bytes: bytes | None = None,
    rigour_config: dict[str, Any] | None = None,
    generated_at: str | None = None,
    stored_name: str | None = None,
    positive_label: dict[str, Any] | None = None,
    target_binarisation: dict[str, Any] | None = None,
    ll144_rate_type: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """JSON-serialisable provenance block for one audit run.

    ``positive_label`` is ``{"value": <label>, "source": "user" | "inferred"}``:
    which target label counted as the positive (selected) outcome.
    ``target_binarisation`` (1.3.0) is ``core.data.describe_target_binarisation``:
    how the target became 0/1 (two_class, one_vs_rest or median_threshold).
    ``ll144_rate_type`` (1.4.0) is ``{"value": "selection" | "scoring", "source":
    "project" | "default"}``: which NYC LL144 rate (6 RCNY 5-301(b) or (c)) the
    project setting chose for the impact-ratio table.

    ``filename`` is the name the file was uploaded under; ``stored_name`` is the
    storage object it was read from (None when the bytes came straight from
    the request).
    """
    return {
        "schema_version": PROVENANCE_SCHEMA_VERSION,
        "generated_at": generated_at or utcnow_iso(),
        "input": {
            "filename": filename,
            "stored_name": stored_name,
            "sha256": sha256_hex(df_bytes),
            "size_bytes": len(df_bytes),
            "n_rows": int(n_rows),
            "n_columns": len(columns),
            "columns": [str(c) for c in columns],
        },
        "model": {
            "used": model_used,
            "sha256": sha256_hex(model_bytes) if model_bytes else None,
        },
        "config": {
            "sensitive_cols": list(sensitive_cols),
            "target_col": target_col,
            "positive_label": dict(positive_label) if positive_label else None,
            "target_binarisation": dict(target_binarisation) if target_binarisation else None,
            "ll144_rate_type": dict(ll144_rate_type) if ll144_rate_type else None,
            "domain": domain,
            "metric_weights": dict(metric_weights),
            "unified_score_weights": dict(UNIFIED_SCORE_WEIGHTS),
            "statistical_rigour": dict(rigour_config or {}),
        },
        "versions": {
            "bias0": BIAS0_VERSION,
            "metrics": dict(METRIC_VERSIONS),
            "libraries": library_versions(),
        },
    }
