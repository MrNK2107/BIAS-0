from __future__ import annotations

import os
import warnings
from pathlib import Path

from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():
    load_dotenv(env_path)

# Suppress Pydantic v2 protected namespace warnings for fields like model_path, model_file
# in schemas and FastAPI endpoint parameters before any modules are imported.
warnings.filterwarnings(
    "ignore", message="Field.*has conflict with protected namespace"
)

import logging  # noqa: E402

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

from contextlib import asynccontextmanager  # noqa: E402

from core.config import configure_logging  # noqa: E402
from routers import (  # noqa: E402
    audit,
    auth,
    bias,
    chat,
    colab,
    compliance,
    datasets,
    explain,
    fixes,
    gemini_narrative,
    monitoring,
    pipeline,
    project,
    sandbox,
)

# ── Structured logging setup ─────────────────────────────────────────────
configure_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(application: FastAPI):
    from firebase.client import init_firebase

    try:
        init_firebase()
        logger.info("Firebase initialized successfully")
    except Exception as exc:
        logger.warning("Firebase unavailable — running without persistence: %s", exc)
    yield


app = FastAPI(title="Unbiased AI Decision Platform", lifespan=lifespan)

# ── CORS ─────────────────────────────────────────────────────────────────
_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
]

_allow_all = os.getenv("CORS_ALLOW_ALL", "0") == "1"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _allow_all else _CORS_ORIGINS,
    allow_credentials=not _allow_all,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Global Exception Handlers ────────────────────────────────────────────


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch unhandled exceptions and return a structured error response."""
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please check the server logs."},
    )


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    """Return 422 for validation errors."""
    logger.warning(
        "Validation error on %s %s: %s", request.method, request.url.path, exc
    )
    return JSONResponse(
        status_code=422,
        content={"detail": str(exc)},
    )


# ── Router Registration ──────────────────────────────────────────────────

app.include_router(project.router, prefix="/api")
app.include_router(audit.router, prefix="/api")
app.include_router(bias.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(fixes.router, prefix="/api")
app.include_router(sandbox.router, prefix="/api")
app.include_router(monitoring.router, prefix="/api")
app.include_router(pipeline.router, prefix="/api")
app.include_router(colab.router, prefix="/api")
app.include_router(compliance.router, prefix="/api")
app.include_router(explain.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(datasets.router, prefix="/api")
app.include_router(gemini_narrative.router, prefix="/api")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# ── Frontend Static Serving ──────────────────────────────────────────────

_frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

if os.path.isdir(os.path.join(_frontend_dist, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(_frontend_dist, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        if "." in full_path.split("/")[-1]:
            file_path = os.path.join(_frontend_dist, full_path)
            if os.path.exists(file_path):
                return FileResponse(file_path)
        return FileResponse(os.path.join(_frontend_dist, "index.html"))
