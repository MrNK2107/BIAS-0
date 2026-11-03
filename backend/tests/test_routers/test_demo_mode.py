"""End-to-end check that the API works without any Firebase credentials:
create project -> upload CSV (stored on local disk) -> run pipeline."""

from __future__ import annotations

import hashlib
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

DEMO_CSV = Path(__file__).resolve().parents[3] / "data" / "demo_loan.csv"


@pytest.fixture
def local_storage(tmp_path, monkeypatch):
    store = tmp_path / "store"
    monkeypatch.setenv("LOCAL_STORAGE_DIR", str(store))
    return store


def test_public_config_reports_no_persistence(client: TestClient) -> None:
    resp = client.get("/api/config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["auth_disabled"] is True
    assert data["persistence"] is False


def test_bogus_bearer_token_is_ignored_when_auth_disabled(client: TestClient) -> None:
    resp = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert resp.status_code == 200
    assert resp.json()["uid"] == "dev-user-id"


def test_upload_and_run_without_firebase(client: TestClient, local_storage) -> None:
    if not DEMO_CSV.exists():
        pytest.skip("data/demo_loan.csv not present")
    resp = client.post(
        "/api/project/create",
        data={"name": "demo", "domain": "loan", "sensitive_cols": "gender",
              "target_col": "approved"},
    )
    assert resp.status_code == 200
    pid = resp.json()["project_id"]

    # Use a 400-row slice so the full ML pipeline stays fast in CI.
    sample = local_storage.parent / "sample.csv"
    lines = DEMO_CSV.read_text(encoding="utf-8").splitlines()[:401]
    sample.write_text("\n".join(lines) + "\n", encoding="utf-8")

    with sample.open("rb") as fh:
        resp = client.post(
            f"/api/project/{pid}/upload",
            files={"dataset": ("demo_loan.csv", fh, "text/csv")},
        )
    assert resp.status_code == 200
    path = resp.json()["datasetPath"]
    assert path.startswith("local://")
    assert any(local_storage.rglob("*demo_loan.csv"))

    resp = client.post(f"/api/project/{pid}/run", data={"metric_priority": "balanced"})
    assert resp.status_code == 200, resp.text
    task_id = resp.json()["task_id"]

    # TestClient runs background tasks before returning, so status is final.
    deadline = time.time() + 5
    status = {}
    while time.time() < deadline:
        status = client.get(f"/api/pipeline/status/{task_id}").json()
        if status.get("status") in ("complete", "error"):
            break
        time.sleep(0.2)
    assert status.get("status") == "complete", status

    # A finished run must unlock every workflow step (Data Audit .. Monitoring).
    # Before the fix /run only bumped maxStep to 3, so steps 4-9 stayed locked.
    projects = client.get("/api/project/list").json()
    mine = next(p for p in projects if str(p["id"]) == str(pid))
    assert mine["max_step"] == 9, mine

    # The run result carries the statistical-rigour block (CIs, small groups,
    # calibration) for the audited model, and it is JSON-serialisable.
    rigour = status["result"]["model_bias"]["statistical_rigour"]
    assert rigour["config"]["n_boot"] > 0
    gender = rigour["per_attribute"]["gender"]
    dpd = gender["gaps"]["demographic_parity_difference"]
    assert dpd["ci_lower"] <= dpd["ci_upper"]
    assert set(gender["groups"]) >= {"female", "male"}
    assert "calibration" in gender and gender["calibration"]["overall"]["n"] > 0

    # Provenance for the evidence pack: the hash is of the exact uploaded bytes.
    prov = status["result"]["provenance"]
    assert prov["input"]["sha256"] == hashlib.sha256(sample.read_bytes()).hexdigest()
    assert prov["input"]["n_rows"] == 400
    # The original upload name, not the uuid-prefixed storage object.
    assert prov["input"]["filename"] == "demo_loan.csv"
    assert prov["input"]["stored_name"] == path.rsplit("/", 1)[-1]
    assert prov["input"]["stored_name"] != "demo_loan.csv"
    assert prov["input"]["stored_name"].endswith("_demo_loan.csv")
    assert mine["dataset_filename"] == "demo_loan.csv"
    assert prov["config"]["sensitive_cols"] == ["gender"]
    assert prov["config"]["statistical_rigour"]["n_boot"] == rigour["config"]["n_boot"]
    # No positive_label was sent: the inferred positive class is recorded.
    assert prov["config"]["positive_label"]["source"] == "inferred"
    assert str(prov["config"]["positive_label"]["value"]) == "1"
    assert prov["versions"]["metrics"]["bootstrap_ci"]


def test_run_uses_original_name_and_migrates_old_records(
    client: TestClient, local_storage, monkeypatch
) -> None:
    """New records keep the upload name; records from before the field existed
    fall back to the storage name with its uuid prefix stripped."""
    import routers.project as project_router
    from repositories import project_repo

    calls: list[dict] = []
    monkeypatch.setattr(project_router, "_run_pipeline", lambda **kw: calls.append(kw))

    pid = client.post(
        "/api/project/create",
        data={"name": "names", "sensitive_cols": "g", "target_col": "y"},
    ).json()["project_id"]
    resp = client.post(
        f"/api/project/{pid}/upload",
        files={"dataset": ("Q3 loans (final).csv", b"g,y\na,1\nb,0\n", "text/csv")},
    )
    assert resp.status_code == 200
    assert resp.json()["datasetFilename"] == "Q3 loans (final).csv"
    stored = resp.json()["datasetPath"].rsplit("/", 1)[-1]

    assert client.post(f"/api/project/{pid}/run").status_code == 200
    assert calls[-1]["filename"] == "Q3 loans (final).csv"
    assert calls[-1]["stored_name"] == stored

    # Simulate a record written before datasetFilename existed.
    project_repo._memory_store[pid].pop("datasetFilename")
    assert "datasetFilename" not in (project_repo.get(pid) or {})
    assert client.post(f"/api/project/{pid}/run").status_code == 200
    assert calls[-1]["filename"] == "Q3 loans (final).csv"
    assert calls[-1]["stored_name"] == stored
    listed = next(p for p in client.get("/api/project/list").json() if str(p["id"]) == str(pid))
    assert listed["dataset_filename"] == "Q3 loans (final).csv"


def test_run_forwards_the_user_positive_label(
    client: TestClient, local_storage, monkeypatch
) -> None:
    import routers.project as project_router

    calls: list[dict] = []
    monkeypatch.setattr(project_router, "_run_pipeline", lambda **kw: calls.append(kw))
    pid = client.post(
        "/api/project/create",
        data={"name": "pos", "sensitive_cols": "g", "target_col": "y"},
    ).json()["project_id"]
    client.post(
        f"/api/project/{pid}/upload",
        files={"dataset": ("d.csv", b"g,y\na,deny\nb,approve\n", "text/csv")},
    )
    assert client.post(f"/api/project/{pid}/run", data={"positive_label": " deny "}).status_code == 200
    assert calls[-1]["positive_label"] == "deny"
    assert client.post(f"/api/project/{pid}/run").status_code == 200
    assert calls[-1]["positive_label"] is None
