"""Evidence-pack integrity: canonical JSON, self-hashes, manifest, tamper detection."""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

import pytest

from core.evidence_integrity import (
    MANIFEST_SCHEMA,
    _es_number,
    canonical_json,
    main,
    manifest_sha256,
    pack_sha256,
    read_bundle_bytes,
    sha256_hex,
    verify_files,
    verify_pack,
)

FIXTURES = Path(__file__).parent / "fixtures"
JS_BUNDLE = FIXTURES / "evidence_bundle_js.zip"


# ── canonical JSON ──────────────────────────────────────────────────────────


def test_shared_vectors_match_browser_implementation() -> None:
    """Vectors were produced by frontend/src/utils/integrity.ts; the frontend
    unit tests check the same file, so the two implementations agree."""
    vectors = json.loads((FIXTURES / "canonical_vectors.json").read_text(encoding="utf-8"))["vectors"]
    assert len(vectors) >= 5
    for v in vectors:
        canon = canonical_json(json.loads(v["input"]))
        assert canon == v["canonical"], v["input"]
        assert sha256_hex(canon.encode("utf-8")) == v["sha256"]


def test_rfc8785_number_examples() -> None:
    # RFC 8785 section 3.2.2.3 / appendix B
    assert _es_number(333333333.33333329) == "333333333.3333333"
    assert _es_number(1e30) == "1e+30"
    assert _es_number(4.50) == "4.5"
    assert _es_number(2e-3) == "0.002"
    assert _es_number(1e-27) == "1e-27"
    assert _es_number(-0.0) == "0"
    assert _es_number(1e21) == "1e+21"
    assert _es_number(1e20) == "100000000000000000000"
    assert _es_number(1e-7) == "1e-7"
    assert _es_number(0.000001) == "0.000001"
    assert _es_number(2**60) == "1152921504606847000"
    with pytest.raises(ValueError):
        _es_number(float("nan"))


def test_canonical_json_ignores_key_order_and_whitespace() -> None:
    a = json.loads('{"b": [1, 2.0, {"y": 1, "x": 2}], "a": "é"}')
    b = json.loads('{"a":"é","b":[1,2,{"x":2,"y":1}]}')
    assert canonical_json(a) == canonical_json(b) == '{"a":"é","b":[1,2,{"x":2,"y":1}]}'


# ── bundles ─────────────────────────────────────────────────────────────────


def _pack() -> dict:
    pack = {
        "schema": "bias0.evidence-pack",
        "schema_version": "1.1.0",
        "exported_at": "2026-11-02T00:00:00.000Z",
        "provenance": {"input": {"filename": "loans.csv", "sha256": "ab" * 32}},
        "summary": {"fairness_score": 72.4, "decision": "LOW RISK"},
        "fairness_metrics": {"demographic_parity_difference": 0.18},
    }
    pack["integrity"] = {
        "algorithm": "sha256",
        "canonicalization": "RFC 8785 (JCS)",
        "pack_sha256": pack_sha256(pack),
    }
    return pack


def _bundle(pack: dict | None = None, **files: bytes) -> dict[str, bytes]:
    pack = pack or _pack()
    out = {
        "evidence-pack.json": json.dumps(pack, indent=2).encode(),
        "evidence.csv": "﻿section,metric,value\r\nsummary,fairness_score,72.4\r\n".encode(),
        "report.html": b"<!doctype html><title>r</title>",
        **files,
    }
    manifest = {
        "schema": MANIFEST_SCHEMA,
        "schema_version": "1.0.0",
        "artifacts": [
            {"path": p, "size_bytes": len(b), "sha256": sha256_hex(b)} for p, b in out.items()
        ],
        "pack_sha256": pack_sha256(pack),
        "input_sha256": pack["provenance"]["input"]["sha256"],
        "signature": None,
    }
    manifest["manifest_sha256"] = manifest_sha256(manifest)
    out["manifest.json"] = json.dumps(manifest, indent=2).encode()
    return out


def _failed(report: dict) -> set[str]:
    return {c["check"] for c in report["checks"] if not c["ok"]}


def test_untouched_bundle_verifies() -> None:
    report = verify_files(_bundle())
    assert report["ok"], report
    assert report["signed"] is False


def test_browser_bundle_verifies() -> None:
    """A bundle exported by the browser code (buildEvidenceBundle)."""
    files = read_bundle_bytes(JS_BUNDLE.read_bytes())
    assert set(files) == {"evidence-pack.json", "evidence.csv", "report.html", "manifest.json"}
    report = verify_files(files)
    assert report["ok"], [c for c in report["checks"] if not c["ok"]]
    pack = json.loads(files["evidence-pack.json"])
    assert pack["provenance"]["input"]["filename"] == "Q3 loans (final).csv"
    assert pack["provenance"]["input"]["stored_name"].endswith("_Q3 loans (final).csv")


def test_reformatted_pack_keeps_its_self_hash() -> None:
    pack = json.loads(read_bundle_bytes(JS_BUNDLE.read_bytes())["evidence-pack.json"])
    reordered = json.loads(json.dumps(dict(reversed(list(pack.items())))))
    assert verify_pack(reordered)[0]["ok"]


def test_tampered_value_is_detected() -> None:
    files = _bundle()
    pack = json.loads(files["evidence-pack.json"])
    pack["summary"]["fairness_score"] = 95  # make the model look fairer
    files["evidence-pack.json"] = json.dumps(pack, indent=2).encode()
    failed = _failed(verify_files(files))
    assert {"evidence-pack.json: sha256", "pack self-hash", "manifest pack_sha256 matches pack"} <= failed


def test_tamper_with_recomputed_pack_hash_is_still_caught_by_manifest() -> None:
    files = _bundle()
    pack = json.loads(files["evidence-pack.json"])
    pack["fairness_metrics"]["demographic_parity_difference"] = 0.01
    pack["integrity"]["pack_sha256"] = pack_sha256(pack)
    files["evidence-pack.json"] = json.dumps(pack).encode()
    failed = _failed(verify_files(files))
    assert "pack self-hash" not in failed
    assert {"evidence-pack.json: sha256", "manifest pack_sha256 matches pack"} <= failed


def test_tampered_csv_report_and_manifest_are_detected() -> None:
    files = _bundle()
    files["evidence.csv"] = files["evidence.csv"].replace(b"72.4", b"92.4")
    assert _failed(verify_files(files)) == {"evidence.csv: sha256"}

    files = _bundle()
    files["report.html"] += b"<!-- edited -->"
    assert _failed(verify_files(files)) == {"report.html: sha256"}

    files = _bundle()
    manifest = json.loads(files["manifest.json"])
    manifest["input_sha256"] = "00" * 32
    files["manifest.json"] = json.dumps(manifest).encode()
    assert {"manifest self-hash", "manifest input_sha256 matches provenance"} <= _failed(verify_files(files))


def test_missing_and_extra_files_are_detected() -> None:
    files = _bundle()
    del files["report.html"]
    files["notes.txt"] = b"added later"
    failed = _failed(verify_files(files))
    assert {"report.html: present", "notes.txt: listed in manifest"} <= failed


def test_bare_pack_and_legacy_pack() -> None:
    pack = _pack()
    assert verify_files({"x.json": json.dumps(pack).encode()})["ok"]
    del pack["integrity"]  # exported before 1.1.0
    report = verify_files({"x.json": json.dumps(pack).encode()})
    assert not report["ok"] and "integrity" in report["checks"][0]["detail"]


def test_zip_round_trip_and_size_limits(monkeypatch) -> None:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, data in _bundle().items():
            zf.writestr(name, data)
    assert verify_files(read_bundle_bytes(buf.getvalue()))["ok"]

    import core.evidence_integrity as ei

    monkeypatch.setattr(ei, "MAX_UNCOMPRESSED_BYTES", 10)
    with pytest.raises(ValueError):
        read_bundle_bytes(buf.getvalue())


def test_cli(tmp_path, capsys) -> None:
    assert main([str(JS_BUNDLE)]) == 0
    assert "VERIFIED" in capsys.readouterr().out
    d = tmp_path / "bundle"
    d.mkdir()
    for name, data in _bundle().items():
        (d / name).write_bytes(data)
    assert main([str(d)]) == 0
    (d / "evidence.csv").write_bytes(b"tampered")
    assert main([str(d)]) == 1
    out = capsys.readouterr().out
    assert "[FAIL] evidence.csv: sha256" in out and "NOT VERIFIED" in out
    assert main([]) == 2



def test_zip_with_duplicate_entry_names_is_rejected() -> None:
    """Two entries with the same name: zipfile (and this verifier) read the last
    one, while many unzip tools and viewers show the first. A tampered first copy
    plus the original second copy used to verify as VERIFIED."""
    import warnings

    files = _bundle()
    pack = json.loads(files["evidence-pack.json"])
    pack["summary"]["fairness_score"] = 95
    buf = io.BytesIO()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # zipfile warns "Duplicate name"
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("evidence-pack.json", json.dumps(pack).encode())
            for name, data in files.items():
                zf.writestr(name, data)
    with pytest.raises(ValueError, match="duplicate"):
        read_bundle_bytes(buf.getvalue())
