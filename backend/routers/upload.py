from __future__ import annotations

from pathlib import Path

import pandas as pd
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from models.db import Project, get_db
from utils.data_io import dataframe_to_csv_text
from utils.synthetic_data import generate_loan_dataset

router = APIRouter(prefix="/demo", tags=["demo"])


@router.get("/loan")
def demo_loan() -> dict[str, str]:
    df = generate_loan_dataset()
    return {"file_name": "demo_loan.csv", "csv_text": dataframe_to_csv_text(df)}


@router.get("/projects")
def list_projects(db: Session = Depends(get_db)) -> list[dict]:
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    return [
        {
            "id": project.id,
            "name": project.name,
            "domain": project.domain,
            "sensitive_columns": project.sensitive_columns,
            "target_column": project.target_column,
        }
        for project in projects
    ]
