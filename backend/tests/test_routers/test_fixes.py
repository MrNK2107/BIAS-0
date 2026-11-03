from __future__ import annotations

from fastapi.testclient import TestClient


def _create_project(client: TestClient) -> str:
    resp = client.post(
        "/api/project/create",
        data={"name": "fixes-test", "domain": "loan", "sensitive_cols": "gender",
              "target_col": "approved"},
    )
    assert resp.status_code == 200
    return resp.json()["project_id"]


def test_fixes_recommend_returns_fixes(client: TestClient) -> None:
    payload = {
        "project_id": _create_project(client),
        "audit_result": {"under_represented_groups": ["female"]},
        "proxy_result": {"proxy_features": [{"feature": "zip_code", "proxy_score": 0.8}]},
        "bias_result": {"fairness_score": 35},
    }
    resp = client.post("/api/fixes/recommend", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) > 0


def test_fixes_recommend_unknown_project_returns_404(client: TestClient) -> None:
    resp = client.post("/api/fixes/recommend", json={"project_id": "does-not-exist"})
    assert resp.status_code == 404
