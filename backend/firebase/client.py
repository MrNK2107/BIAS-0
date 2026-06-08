from __future__ import annotations

import json
import os

import firebase_admin
from firebase_admin import credentials, firestore, storage

_firebase_app: firebase_admin.App | None = None


def _build_cred_from_env() -> credentials.Certificate | None:
    """Try individual env vars first, then legacy JSON/path."""
    project_id = os.getenv("FIREBASE_PROJECT_ID")
    raw_key = os.getenv("FIREBASE_PRIVATE_KEY")
    client_email = os.getenv("FIREBASE_CLIENT_EMAIL")
    if project_id and raw_key and client_email:
        private_key = raw_key.replace("\\n", "\n")
        return credentials.Certificate({
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
        })
    return None


def init_firebase() -> None:
    global _firebase_app
    if _firebase_app is not None:
        return

    cred = _build_cred_from_env()
    if cred is None:
        cred_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
        if cred_json:
            cred = credentials.Certificate(json.loads(cred_json))
        else:
            cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
            if cred_path:
                cred = credentials.Certificate(cred_path)

    if cred is None:
        raise RuntimeError(
            "Firebase credentials not found. Set FIREBASE_PROJECT_ID + "
            "FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL, or use the "
            "legacy FIREBASE_SERVICE_ACCOUNT_JSON / FIREBASE_SERVICE_ACCOUNT_PATH."
        )

    storage_bucket = os.getenv("FIREBASE_STORAGE_BUCKET")
    _firebase_app = firebase_admin.initialize_app(
        cred,
        options={"storageBucket": storage_bucket} if storage_bucket else None,
    )


def get_firestore() -> firestore.Client:
    if _firebase_app is None:
        init_firebase()
    return firestore.client()


def get_storage_bucket() -> storage.Bucket:
    if _firebase_app is None:
        init_firebase()
    return storage.bucket()
