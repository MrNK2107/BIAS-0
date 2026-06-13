from __future__ import annotations

from fastapi.testclient import TestClient


def test_pipeline_status_unknown_task_returns_404(client: TestClient) -> None:
    resp = client.get("/api/pipeline/status/nonexistent-task-id")
    assert resp.status_code == 404
