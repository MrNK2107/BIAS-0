from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models.db import Base, Project, SessionLocal, engine
from routers import audit, bias, fixes, monitoring, sandbox, upload

app = FastAPI(title="Unbiased AI Decision Platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(audit.router)
app.include_router(bias.router)
app.include_router(fixes.router)
app.include_router(sandbox.router)
app.include_router(monitoring.router)


@app.on_event("startup")
def startup_seed() -> None:
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        if not session.query(Project).first():
            session.add(
                Project(
                    name="Demo Loan Project",
                    domain="loan",
                    sensitive_columns=["gender", "caste"],
                    target_column="approved",
                )
            )
            session.commit()
    finally:
        session.close()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
