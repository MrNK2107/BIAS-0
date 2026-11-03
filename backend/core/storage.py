from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path

from fastapi import UploadFile

logger = logging.getLogger(__name__)

LOCAL_PREFIX = "local://"


def _local_storage_root() -> Path:
    """Directory used for uploads when Firebase Storage is unavailable."""
    default = Path(__file__).resolve().parent.parent / ".local_storage"
    return Path(os.getenv("LOCAL_STORAGE_DIR", str(default))).resolve()


def _safe_name(filename: str | None) -> str:
    name = os.path.basename(filename or "upload.bin").replace("\\", "_")
    return name or "upload.bin"


async def _save_local(file: UploadFile, prefix: str) -> str:
    rel = f"{prefix.strip('/')}/{uuid.uuid4().hex}_{_safe_name(file.filename)}"
    dest = _local_storage_root() / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(await file.read())
    return f"{LOCAL_PREFIX}{rel}"


async def upload_file(file: UploadFile, prefix: str) -> str:
    from firebase.client import get_storage_bucket, is_firestore_available

    if not is_firestore_available():
        logger.info("Firebase Storage unavailable: storing upload on local disk")
        return await _save_local(file, prefix)

    bucket = get_storage_bucket()
    if bucket is None:
        logger.warning("Firebase Storage bucket is None: storing upload on local disk")
        return await _save_local(file, prefix)
    blob = bucket.blob(f"{prefix}/{uuid.uuid4().hex}_{file.filename}")
    content = await file.read()
    blob.upload_from_string(content, content_type=file.content_type)
    return f"gs://{bucket.name}/{blob.name}"


def _resolve_local(url: str) -> Path:
    root = _local_storage_root()
    path = (root / url[len(LOCAL_PREFIX):]).resolve()
    if root != path and root not in path.parents:
        raise ValueError("Invalid local storage path")
    return path


def download_file_bytes(url: str) -> bytes:
    if url.startswith(LOCAL_PREFIX):
        path = _resolve_local(url)
        if not path.exists():
            raise FileNotFoundError(
                "Uploaded file no longer exists in local storage; please re-upload."
            )
        return path.read_bytes()

    if url.startswith("gs://"):
        from firebase.client import get_storage_bucket, is_firestore_available

        if not is_firestore_available():
            raise RuntimeError(
                "Firebase Storage unavailable — cannot download file from gs:// URL"
            )

        bucket = get_storage_bucket()
        if bucket is None:
            raise RuntimeError(
                "Firebase Storage bucket is None — cannot download file"
            )
        blob_name = url.replace(f"gs://{bucket.name}/", "", 1)
        blob = bucket.blob(blob_name)
        return blob.download_as_bytes()

    raise ValueError(f"Unsupported storage URL: {url!r}")
