from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile

from core.dataset_loader import SUPPORTED_FORMATS, infer_format, load_dataset, preview_dataframe

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.post("/preview")
async def preview_dataset(file: UploadFile = File(...)) -> dict[str, Any]:
    if file.filename is None:
        raise HTTPException(400, "Filename required")
    fmt = infer_format(file.filename)
    if fmt is None:
        raise HTTPException(400, f"Unsupported format. Supported: {', '.join(sorted(SUPPORTED_FORMATS))}")
    try:
        content = await file.read()
        df = load_dataset(content, file.filename)
        return preview_dataframe(df)
    except Exception as exc:
        logger.exception("Dataset preview failed")
        raise HTTPException(400, str(exc))
