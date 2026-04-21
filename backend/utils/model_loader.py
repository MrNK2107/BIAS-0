from __future__ import annotations

from pathlib import Path

import joblib


def load_model(path: str):
    return joblib.load(path)


def resolve_model_path(model_cache_dir: str, file_name: str) -> Path:
    cache_dir = Path(model_cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / file_name
