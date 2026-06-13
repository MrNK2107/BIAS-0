from __future__ import annotations

import logging
import uuid

from fastapi import UploadFile

logger = logging.getLogger(__name__)


async def upload_file(file: UploadFile, prefix: str) -> str:
    from firebase.client import get_storage_bucket, is_firestore_available

    if not is_firestore_available():
        logger.warning("Firebase Storage unavailable — returning local placeholder path")
        return f"local://{prefix}/{uuid.uuid4().hex}_{file.filename}"

    bucket = get_storage_bucket()
    if bucket is None:
        logger.warning("Firebase Storage bucket is None — returning local placeholder")
        return f"local://{prefix}/{uuid.uuid4().hex}_{file.filename}"
    blob = bucket.blob(f"{prefix}/{uuid.uuid4().hex}_{file.filename}")
    content = await file.read()
    blob.upload_from_string(content, content_type=file.content_type)
    return f"gs://{bucket.name}/{blob.name}"


def download_file_bytes(url: str) -> bytes:
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

    with open(url, "rb") as f:
        return f.read()
