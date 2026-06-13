from __future__ import annotations

import os
from typing import Any, Generator

import pytest
from fastapi.testclient import TestClient

# Disable auth and firestore for all API tests
os.environ["AUTH_DISABLED"] = "1"

from main import app  # noqa: E402


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as c:
        yield c
