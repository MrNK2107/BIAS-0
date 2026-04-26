"""Utility for loading a user-uploaded serialized model from bytes."""
from __future__ import annotations

import io
import joblib


def load_model_from_bytes(raw: bytes):
    """Deserialize a joblib/pickle model from raw bytes.

    Returns the fitted model object, or raises ValueError if deserialization fails.
    """
    try:
        return joblib.load(io.BytesIO(raw))
    except Exception as exc:
        raise ValueError(f"Failed to deserialize uploaded model: {exc}") from exc
