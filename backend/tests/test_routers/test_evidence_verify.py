"""POST /api/evidence/verify: recompute and check an evidence bundle's hashes."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from core.evidence_integrity import read_bundle_bytes

JS_BUNDLE = Path(__file__).resolve().parents[1] / "fixtures" / "evidence_bundle_js.zip"


def test_verify_endpoint(client: TestClient) -> None:
    resp = client.post(
        "/api/evidence/verify",
        files={"file": ("bundle.zip", JS_BUNDLE.read_bytes(), "application/zip")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is True and body["kind"] == "bundle"
    assert "manifest.json" in body["files"]

    files = read_bundle_bytes(JS_BUNDLE.read_bytes())
    pack = json.loads(files["evidence-pack.json"])
    pack["summary"]["decision"] = "APPROVED"
    resp = client.post(
        "/api/evidence/verify",
        files={"file": ("pack.json", json.dumps(pack).encode(), "application/json")},
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is False

    resp = client.post(
        "/api/evidence/verify",
        files={"file": ("x.zip", b"PK\x03\x04garbage", "application/zip")},
    )
    assert resp.status_code == 400
