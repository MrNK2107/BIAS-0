from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models.db import Base, Project, SessionLocal, engine
from routers import audit, bias, fixes, monitoring, pipeline, sandbox, project

app = FastAPI(title="Unbiased AI Decision Platform")

_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
]

# Set CORS_ALLOW_ALL=1 in the environment to open wildcard origins for local dev.
_allow_all = os.getenv("CORS_ALLOW_ALL", "0") == "1"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _allow_all else _CORS_ORIGINS,
    allow_credentials=not _allow_all,  # credentials + wildcard is illegal; disable when wildcard
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(project.router)
app.include_router(audit.router)
app.include_router(bias.router)
app.include_router(fixes.router)
app.include_router(sandbox.router)
app.include_router(monitoring.router)
app.include_router(pipeline.router)

@app.on_event("startup")
def startup_seed() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
