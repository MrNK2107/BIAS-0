from __future__ import annotations

import os
import warnings

# Suppress Pydantic v2 protected namespace warnings for fields like model_path, model_file
# in schemas and FastAPI endpoint parameters before any modules are imported.
warnings.filterwarnings("ignore", message="Field.*has conflict with protected namespace")

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402

from models.db import Base, engine  # noqa: E402
from routers import audit, bias, fixes, monitoring, pipeline, sandbox, project  # noqa: E402

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

app.include_router(project.router, prefix="/api")
app.include_router(audit.router, prefix="/api")
app.include_router(bias.router, prefix="/api")
app.include_router(fixes.router, prefix="/api")
app.include_router(sandbox.router, prefix="/api")
app.include_router(monitoring.router, prefix="/api")
app.include_router(pipeline.router, prefix="/api")

@app.on_event("startup")
def startup_seed() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

# Serve Frontend
app.mount("/assets", StaticFiles(directory="../frontend/dist/assets"), name="assets")

@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    # If the path looks like a file (has an extension), don't serve index.html
    if "." in full_path.split("/")[-1]:
        # Try to serve the file from dist
        file_path = os.path.join("../frontend/dist", full_path)
        if os.path.exists(file_path):
            return FileResponse(file_path)
    
    # Otherwise, serve index.html for client-side routing
    return FileResponse("../frontend/dist/index.html")
