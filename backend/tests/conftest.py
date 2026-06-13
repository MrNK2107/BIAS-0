from __future__ import annotations

from typing import Any

import pandas as pd
import pytest

from core.common import build_classifier, prepare_split
from utils.synthetic_data import generate_loan_dataset


@pytest.fixture(scope="session")
def loan_df_small() -> pd.DataFrame:
    return generate_loan_dataset(rows=200, seed=42)


@pytest.fixture(scope="session")
def loan_df_medium() -> pd.DataFrame:
    return generate_loan_dataset(rows=500, seed=42)


@pytest.fixture(scope="session")
def trained_model_pipeline(loan_df_medium: pd.DataFrame) -> tuple[Any, Any]:
    prep = prepare_split(loan_df_medium, "approved")
    model = build_classifier(prep.X_train, model_type="rf")
    model.fit(prep.X_train, prep.y_train)
    return model, prep
