from __future__ import annotations

from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth

_security = HTTPBearer(auto_error=False)


async def verify_token(
    credentials: HTTPAuthorizationCredentials | None = Security(_security),
) -> str | None:
    if credentials is None:
        return None
    try:
        decoded = firebase_auth.verify_id_token(credentials.credentials)
        return decoded["uid"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def require_user(
    uid: str | None = Depends(verify_token),
) -> str:
    if uid is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return uid
