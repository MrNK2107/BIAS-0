from __future__ import annotations

from fastapi.testclient import TestClient


def test_fixes_recommend_returns_fixes(client: TestClient) -> None:
    payload = {
        "data_audit": {"under_represented_groups": ["female"]},
        "proxy": {"proxy_features": [{"feature": "zip_code", "proxy_score": 0.8}]},
        "model_bias": {"fairness_score": 35},
    }
    resp = client.post("/api/fixes/recommend", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "recommendations" in data or isinstance(data, list)
