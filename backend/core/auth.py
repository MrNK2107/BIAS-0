from __future__ import annotations

import logging
import os

from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

logger = logging.getLogger(__name__)

_security = HTTPBearer(auto_error=False)

DEV_USER_UID = "dev-user-id"
DEV_USER_EMAIL = "dev@local.dev"
DEV_USER_NAME = "Dev User"


def is_demo_mode() -> bool:
    """DEMO_MODE=1 runs the whole stack locally without Firebase credentials."""
    return os.getenv("DEMO_MODE", "0") == "1"


def is_auth_disabled() -> bool:
    """Auth is bypassed (everyone is the dev user) in AUTH_DISABLED or DEMO_MODE."""
    return os.getenv("AUTH_DISABLED", "0") == "1" or is_demo_mode()


async def verify_token(
    credentials: HTTPAuthorizationCredentials | None = Security(_security),
) -> str | None:
    if credentials is None:
        return None

    if is_auth_disabled():
        # Never try to verify tokens against Firebase when auth is off.
        return DEV_USER_UID

    from firebase_admin import auth as firebase_auth

    try:
        decoded = firebase_auth.verify_id_token(
            credentials.credentials, clock_skew_seconds=60
        )
        return decoded["uid"]
    except ValueError as exc:
        logger.warning("Token verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    except Exception as exc:
        logger.error("Unexpected token verification error: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def require_user(
    uid: str | None = Depends(verify_token),
) -> str:
    if is_auth_disabled():
        return DEV_USER_UID
    if uid is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return uid
