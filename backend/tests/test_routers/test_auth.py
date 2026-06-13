from __future__ import annotations

from fastapi.testclient import TestClient


def test_me_with_auth_disabled_returns_dev_user(client: TestClient) -> None:
    resp = client.get("/api/auth/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["uid"] == "dev-user-id"
