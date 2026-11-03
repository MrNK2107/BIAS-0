from __future__ import annotations

import json
import logging
import os

import firebase_admin
from firebase_admin import credentials, firestore, storage

logger = logging.getLogger(__name__)

_firebase_app: firebase_admin.App | None = None


def _build_cred_from_env() -> credentials.Certificate | None:
    """Try individual env vars first, then legacy JSON/path."""
    project_id = os.getenv("FIREBASE_PROJECT_ID")
    raw_key = os.getenv("FIREBASE_PRIVATE_KEY")
    client_email = os.getenv("FIREBASE_CLIENT_EMAIL")
    if project_id and raw_key and client_email:
        private_key = raw_key.replace("\\n", "\n")
        return credentials.Certificate(
            {
                "type": "service_account",
                "project_id": project_id,
                "private_key": private_key,
                "client_email": client_email,
                "private_key_id": os.getenv("FIREBASE_PRIVATE_KEY_ID", ""),
                "client_id": os.getenv("FIREBASE_CLIENT_ID", ""),
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "client_x509_cert_url": f"https://www.googleapis.com/robot/v1/metadata/x509/{client_email}",
                "universe_domain": "googleapis.com",
            }
        )
    return None


_FIREBASE_DISABLED = False


def is_firestore_available() -> bool:
    # Resolve lazily so callers never see "available" before init has run.
    init_firebase()
    return _firebase_app is not None and not _FIREBASE_DISABLED


def init_firebase() -> None:
    global _firebase_app, _FIREBASE_DISABLED
    if _firebase_app is not None or _FIREBASE_DISABLED:
        return

    if os.getenv("DEMO_MODE", "0") == "1":
        logger.info(
            "DEMO_MODE=1: Firebase disabled; using in-memory repositories and "
            "local file storage."
        )
        _FIREBASE_DISABLED = True
        return

    try:
        cred = _build_cred_from_env()
        if cred is None:
            cred_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
            if cred_json:
                cred = credentials.Certificate(json.loads(cred_json))
            else:
                cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
                if cred_path:
                    cred = credentials.Certificate(cred_path)
    except Exception as exc:  # malformed key / missing file
        logger.warning("Invalid Firebase credentials (%s); running without Firebase.", exc)
        cred = None

    if cred is None:
        logger.warning(
            "Firebase credentials not found. Firestore/storage will be unavailable. "
            "Set FIREBASE_PROJECT_ID + FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL "
            "or set DEMO_MODE=1 (or AUTH_DISABLED=1) for local development."
        )
        _FIREBASE_DISABLED = True
        return

    storage_bucket = os.getenv("FIREBASE_STORAGE_BUCKET")
    try:
        _firebase_app = firebase_admin.initialize_app(
            cred,
            options={"storageBucket": storage_bucket} if storage_bucket else None,
        )
    except Exception as exc:
        logger.warning("Firebase init failed (%s); running without Firebase.", exc)
        _FIREBASE_DISABLED = True


def get_firestore() -> firestore.Client | None:
    init_firebase()
    if _firebase_app is None:
        return None
    return firestore.client()


def get_storage_bucket() -> storage.Bucket | None:
    init_firebase()
    if _firebase_app is None:
        return None
    return storage.bucket()
