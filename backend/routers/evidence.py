"""Evidence-pack verification endpoint."""

from __future__ import annotations

import zipfile
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from core.auth import require_user
from core.evidence_integrity import read_bundle_bytes, verify_files

router = APIRouter(prefix="/evidence", tags=["evidence"])

MAX_VERIFY_UPLOAD = 50 * 1024 * 1024  # 50 MB


@router.post("/verify")
async def verify_evidence(
    file: UploadFile = File(...),
    uid: str = Depends(require_user),
) -> dict[str, Any]:
    """Recompute and check the hashes of an evidence bundle (.zip) or pack (.json).

    The response lists every check; ``ok`` is true only when all pass. A
    passing bundle has not been changed since export, but it is unsigned, so
    this says nothing about who exported it.
    """
    data = await file.read(MAX_VERIFY_UPLOAD + 1)
    if len(data) > MAX_VERIFY_UPLOAD:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB)")
    try:
        files = read_bundle_bytes(data, file.filename or "")
    except (zipfile.BadZipFile, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Not a readable bundle: {exc}")
    report = verify_files(files)
    report["files"] = sorted(files)
    return report
