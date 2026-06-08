from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.auth import require_user

router = APIRouter(prefix="/auth", tags=["auth"])


class SignupRequest(BaseModel):
    email: str
    password: str
    name: str


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    uid: str
    email: str
    name: str


@router.post("/signup")
async def signup(req: SignupRequest) -> AuthResponse:
    """Create a new Firebase Auth user."""
    from firebase_admin import auth as firebase_auth
    try:
        user = firebase_auth.create_user(
            email=req.email,
            password=req.password,
            display_name=req.name,
        )
        return AuthResponse(uid=user.uid, email=user.email or req.email, name=user.display_name or req.name)
    except firebase_auth.EmailAlreadyExistsError:
        raise HTTPException(status_code=409, detail="Email already registered")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/me")
async def get_me(uid: str = Depends(require_user)) -> AuthResponse:
    """Return the current user's profile."""
    from firebase_admin import auth as firebase_auth
    try:
        user = firebase_auth.get_user(uid)
        return AuthResponse(uid=user.uid, email=user.email or "", name=user.display_name or "")
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))
