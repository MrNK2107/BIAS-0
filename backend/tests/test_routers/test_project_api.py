"""API tests that run fully in-memory (no Firebase): project CRUD, column
analysis, compliance assessment, and the mock-LLM explain/chat endpoints."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from core.column_profiler import analyze_columns
from firebase.repository import FirestoreRepository


@pytest.fixture(autouse=True)
def _mock_llm(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "mock")


def _create(client: TestClient, name: str = "p") -> str:
    resp = client.post(
        "/api/project/create",
        data={"name": name, "domain": "hiring", "sensitive_cols": "gender, race",
              "target_col": "hired"},
    )
    assert resp.status_code == 200
    return resp.json()["project_id"]


def test_project_lifecycle(client: TestClient) -> None:
    pid = _create(client, "lifecycle")

    listed = client.get("/api/project/list").json()
    mine = [p for p in listed if p["id"] == pid]
    assert mine and mine[0]["sensitive_columns"] == ["gender", "race"]
    assert mine[0]["max_step"] == 1

    resp = client.patch(f"/api/project/{pid}/config",
                        data={"sensitive_cols": "age", "target_col": "y"})
    assert resp.status_code == 200

    resp = client.patch(f"/api/project/{pid}/step", data={"step": 5})
    assert resp.json()["max_step"] == 5
    # step never goes backwards
    resp = client.patch(f"/api/project/{pid}/step", data={"step": 2})
    assert resp.json()["max_step"] == 5

    assert client.get(f"/api/project/{pid}/latest").json() == {"status": "none"}
    assert client.get(f"/api/project/{pid}/compare").json() == []

    resp = client.post(f"/api/project/{pid}/run")
    assert resp.status_code == 400  # no dataset uploaded yet

    assert client.delete(f"/api/project/{pid}").status_code == 200
    assert client.get(f"/api/project/{pid}/latest").status_code == 404


def test_unknown_project_is_404_everywhere(client: TestClient) -> None:
    for method, url in [
        ("get", "/api/project/nope/latest"),
        ("get", "/api/project/nope/compare"),
        ("delete", "/api/project/nope"),
    ]:
        assert getattr(client, method)(url).status_code == 404


def test_analyze_columns_ranks_sensitive_like_columns(client: TestClient) -> None:
    rows = [[str(i), g, str(1000 + i * 37)] for i, g in
            zip(range(60), ["male", "female", "non-binary"] * 20)]
    resp = client.post("/api/project/analyze-columns",
                       json={"columns": ["id", "gender", "income"], "rows": rows})
    assert resp.status_code == 200
    ranked = resp.json()
    assert ranked[0]["column"] == "gender"
    assert ranked[0]["confidence"] >= ranked[-1]["confidence"]
    assert analyze_columns([], []) == []


def test_compliance_assess_returns_narrative(client: TestClient) -> None:
    pid = _create(client, "compliance")
    resp = client.post("/api/compliance/assess", json={
        "project_id": pid, "fairness_score": 42, "demographic_parity": 0.3,
        "equal_opportunity_gap": 0.25, "domain": "hiring",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert "overall" in body and "narrative" in body
    assert body["overall"]["overall_status"] != "compliant"

    good = client.post("/api/compliance/assess", json={
        "project_id": pid, "fairness_score": 98, "demographic_parity": 0.01,
        "equal_opportunity_gap": 0.01, "domain": "hiring",
        "has_independent_audit": True,
    }).json()
    assert good["narrative"]

    bad = client.post("/api/compliance/assess",
                      json={"project_id": pid, "fairness_score": 150})
    assert bad.status_code == 422


def test_explain_and_chat_use_mock_llm(client: TestClient) -> None:
    pid = _create(client, "llm")
    resp = client.post("/api/explain/metric", json={
        "project_id": pid, "module": "model_bias",
        "metric_name": "demographic_parity_difference", "metric_value": 0.4,
    })
    assert resp.status_code == 200
    assert resp.json()["provider"] == "mock"
    assert resp.json()["explanation"]

    resp = client.post("/api/chat/query", json={
        "project_id": pid, "question": "Why is the score low?",
        "context": {"fairness_score": 40},
    })
    assert resp.status_code == 200
    assert resp.json()["answer"]


def test_in_memory_repository_crud_and_filters() -> None:
    repo: FirestoreRepository = FirestoreRepository(collection_name="t")
    a = repo.create({"owner": "u1", "n": 1})
    repo.create({"owner": "u1", "n": 3})
    repo.create({"owner": "u2", "n": 2})
    assert repo.get(a)["n"] == 1
    assert repo.get("missing") is None

    u1 = repo.list(filters=[("owner", "==", "u1")], order_by=("n", "DESCENDING"))
    assert [r["n"] for r in u1] == [3, 1]
    assert len(repo.list(filters=[("n", ">=", 2)])) == 2
    assert len(repo.list(filters=[("n", "<", 2)])) == 1
    assert len(repo.list(filters=[("owner", "!=", "u1")])) == 1
    assert len(repo.list(limit=1)) == 1

    repo.update(a, {"n": 10})
    assert repo.get(a)["n"] == 10
    repo.delete(a)
    assert repo.get(a) is None
    assert repo.delete_all([("owner", "==", "u1")]) == 1
    assert repo.transaction() is None

    with pytest.raises(Exception):
        repo.get_or_raise("missing")
