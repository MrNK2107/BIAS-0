"""Utility for safely loading a user-uploaded serialized model from bytes.

Uses a restricted Unpickler to prevent arbitrary code execution from
malicious .pkl / .joblib files. Only allows known-safe sklearn/numpy/scipy types.
"""

from __future__ import annotations

import io
import pickle
import logging

import numpy as np
import sklearn.base

logger = logging.getLogger(__name__)

SAFE_MODULES = frozenset({
    "sklearn",
    "sklearn.tree",
    "sklearn.ensemble",
    "sklearn.linear_model",
    "sklearn.svm",
    "sklearn.neighbors",
    "sklearn.preprocessing",
    "sklearn.compose",
    "sklearn.pipeline",
    "sklearn.impute",
    "sklearn.feature_selection",
    "numpy",
    "scipy.sparse",
    "scipy.sparse._csr",
    "scipy.sparse._csc",
    "scipy.sparse._coo",
})

SAFE_TYPES = (
    sklearn.base.BaseEstimator,
    np.ndarray,
    np.float16,
    np.float32,
    np.float64,
    np.int8,
    np.int16,
    np.int32,
    np.int64,
    np.bool_,
)


class SafeUnpickler(pickle.Unpickler):
    """Unpickler that restricts module imports to known-safe packages."""

    def find_class(self, module: str, name: str) -> type:
        if not any(module == safe or module.startswith(f"{safe}.") for safe in SAFE_MODULES):
            raise pickle.UnpicklingError(
                f"Blocked unsafe module '{module}' during model deserialization. "
                f"Only sklearn, numpy, and scipy are allowed."
            )
        return super().find_class(module, name)


def load_model_from_bytes(raw: bytes):
    """Safely deserialize a joblib/pickle model from raw bytes.

    Uses a restricted Unpickler to block arbitrary code execution.
    Returns the fitted model object, or raises ValueError if deserialization fails.

    Note: Standard joblib.load is not used because it allows arbitrary
    Python code execution via pickle. This safe alternative restricts
    imports to sklearn/numpy/scipy only.
    """
    try:
        model = SafeUnpickler(io.BytesIO(raw)).load()
        if not isinstance(model, SAFE_TYPES):
            raise ValueError(
                f"Uploaded model is not a valid sklearn estimator (got {type(model).__name__})"
            )
        logger.info("Successfully loaded model: %s", type(model).__name__)
        return model
    except pickle.UnpicklingError:
        raise
    except Exception as exc:
        raise ValueError(f"Failed to deserialize uploaded model: {exc}") from exc
