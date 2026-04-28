from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models.db import Base, Project, SessionLocal, engine
from routers import audit, bias, fixes, monitoring, pipeline, sandbox, project

app = FastAPI(title="Unbiased AI Decision Platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(audit.router)
app.include_router(bias.router)
app.include_router(fixes.router)
app.include_router(sandbox.router)
app.include_router(monitoring.router)
app.include_router(pipeline.router)
app.include_router(project.router)

@app.on_event("startup")
def startup_seed() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
