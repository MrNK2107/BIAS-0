"""NYC LL144 rate type (selection vs scoring) as a project setting, carried into provenance."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from core.evidence import PROVENANCE_SCHEMA_VERSION, build_provenance


@pytest.fixture
def local_storage(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCAL_STORAGE_DIR", str(tmp_path / "store"))


def _create(client: TestClient) -> str:
    return client.post(
        "/api/project/create",
        data={"name": "ll", "sensitive_cols": "g", "target_col": "y"},
    ).json()["project_id"]


def _listed(client: TestClient, pid: str) -> dict:
    return next(p for p in client.get("/api/project/list").json() if p["id"] == pid)


def test_default_is_selection_and_setting_is_listed(client: TestClient) -> None:
    pid = _create(client)
    assert _listed(client, pid)["ll144_rate_type"] == "selection"
    resp = client.patch(f"/api/project/{pid}/settings", data={"ll144_rate_type": "scoring"})
    assert resp.status_code == 200
    assert resp.json()["ll144_rate_type"] == "scoring"
    assert _listed(client, pid)["ll144_rate_type"] == "scoring"


def test_invalid_rate_type_is_rejected(client: TestClient) -> None:
    pid = _create(client)
    resp = client.patch(f"/api/project/{pid}/settings", data={"ll144_rate_type": "pass_fail"})
    assert resp.status_code == 422
    assert client.patch("/api/project/nope/settings", data={"ll144_rate_type": "scoring"}).status_code == 404


def test_run_forwards_the_project_rate_type(client: TestClient, local_storage, monkeypatch) -> None:
    import routers.project as project_router

    calls: list[dict] = []
    monkeypatch.setattr(project_router, "_run_pipeline", lambda **kw: calls.append(kw))
    pid = _create(client)
    client.post(
        f"/api/project/{pid}/upload",
        files={"dataset": ("d.csv", b"g,y\na,0\nb,1\n", "text/csv")},
    )
    assert client.post(f"/api/project/{pid}/run").status_code == 200
    assert calls[-1]["ll144_rate_type"] == {"value": "selection", "source": "default"}
    client.patch(f"/api/project/{pid}/settings", data={"ll144_rate_type": "scoring"})
    assert client.post(f"/api/project/{pid}/run").status_code == 200
    assert calls[-1]["ll144_rate_type"] == {"value": "scoring", "source": "project"}


def test_provenance_records_rate_type() -> None:
    kw = dict(
        df_bytes=b"a,t\n1,1\n", filename="x.csv", n_rows=1, columns=["a", "t"],
        sensitive_cols=["a"], target_col="t", domain="hiring", metric_weights={},
        model_used="tuned_rf",
    )
    assert PROVENANCE_SCHEMA_VERSION == "1.4.0"
    assert build_provenance(**kw)["config"]["ll144_rate_type"] is None
    prov = build_provenance(**kw, ll144_rate_type={"value": "scoring", "source": "project"})
    assert prov["config"]["ll144_rate_type"] == {"value": "scoring", "source": "project"}
