"""Integrity checks for exported evidence packs and bundles.

The browser exports an evidence *bundle*: a ZIP holding

- ``evidence-pack.json``  the versioned evidence pack (``bias0.evidence-pack``),
- ``evidence.csv``         the same numbers as a flat table,
- ``report.html``          the human-readable audit report,
- ``manifest.json``        what is in the bundle and how to check it.

Two kinds of hash are used (all SHA-256, lowercase hex):

- **File hashes.** ``manifest.artifacts[*].sha256`` is the hash of each file's
  exact bytes, so any edit to any file is detected.
- **Canonical-JSON hashes.** ``pack.integrity.pack_sha256`` is the hash of the
  pack with its ``integrity`` member removed, serialised with the JSON
  Canonicalization Scheme (RFC 8785: sorted keys, no whitespace, ECMAScript
  number formatting). It survives re-formatting (pretty-printing, key order)
  but not a change of any value. ``manifest_sha256`` is the same thing for the
  manifest itself (with ``manifest_sha256`` removed).

What this does and does not prove: the hashes show that the files are the
ones the manifest describes and that nothing was changed *after* export
without also re-computing the hashes. They are not a signature: someone who
edits a file and recomputes every hash produces a bundle that verifies. To
bind a bundle to an issuer, sign ``manifest.json`` with a key the reviewer
trusts (see docs/evidence-pack.md) -- BIAS-0 ships no signing key.

Usage::

    python -m core.evidence_integrity bundle.zip      # or a directory, or a pack .json
"""

from __future__ import annotations

import hashlib
import io
import json
import math
import sys
import zipfile
from pathlib import Path
from typing import Any

MANIFEST_SCHEMA = "bias0.evidence-manifest"
MANIFEST_NAME = "manifest.json"
PACK_NAME = "evidence-pack.json"
CANONICALIZATION = "RFC 8785 (JCS)"

# Limits for untrusted uploads (the API accepts bundles from anyone signed in).
MAX_BUNDLE_FILES = 32
MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024


# ── RFC 8785 canonical JSON ─────────────────────────────────────────────────


def _es_number(x: int | float) -> str:
    """Format a number the way ECMAScript ``Number.prototype.toString`` does.

    RFC 8785 requires this so that a pack hashed in the browser and re-hashed
    here give the same bytes. Python's ``repr`` already yields the shortest
    round-tripping digits; only the layout (exponent form, ``.0``) differs.
    """
    if isinstance(x, int) and abs(x) < 2**53:
        return str(x)
    x = float(x)  # JSON numbers are IEEE doubles in JavaScript
    if not math.isfinite(x):
        raise ValueError("NaN and Infinity are not valid JSON")
    if x == 0:
        return "0"  # also -0
    sign = "-" if x < 0 else ""
    mant, _, exp = repr(abs(x)).partition("e")
    ip, _, fp = mant.partition(".")
    digits = ip + fp
    n = len(ip) + (int(exp) if exp else 0)  # decimal point position
    stripped = digits.lstrip("0")
    n -= len(digits) - len(stripped)
    digits = stripped.rstrip("0")
    k = len(digits)
    if k <= n <= 21:
        out = digits + "0" * (n - k)
    elif 0 < n <= 21:
        out = digits[:n] + "." + digits[n:]
    elif -6 < n <= 0:
        out = "0." + "0" * (-n) + digits
    else:
        e = n - 1
        esign = "+" if e >= 0 else "-"
        head = digits if k == 1 else digits[0] + "." + digits[1:]
        out = f"{head}e{esign}{abs(e)}"
    return sign + out


def _utf16_key(s: str) -> bytes:
    # RFC 8785 sorts member names by their UTF-16 code units.
    return s.encode("utf-16-be", "surrogatepass")


def canonical_json(value: Any) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (int, float)):
        return _es_number(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(canonical_json(v) for v in value) + "]"
    if isinstance(value, dict):
        for k in value:
            if not isinstance(k, str):
                raise TypeError(f"JSON object keys must be strings, got {type(k).__name__}")
        items = sorted(value.items(), key=lambda kv: _utf16_key(kv[0]))
        return "{" + ",".join(
            json.dumps(k, ensure_ascii=False) + ":" + canonical_json(v) for k, v in items
        ) + "}"
    raise TypeError(f"Not JSON-serialisable: {type(value).__name__}")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical_sha256(value: Any) -> str:
    return sha256_hex(canonical_json(value).encode("utf-8"))


def pack_sha256(pack: dict[str, Any]) -> str:
    """Canonical hash of an evidence pack, excluding its ``integrity`` member."""
    return canonical_sha256({k: v for k, v in pack.items() if k != "integrity"})


def manifest_sha256(manifest: dict[str, Any]) -> str:
    return canonical_sha256({k: v for k, v in manifest.items() if k != "manifest_sha256"})


# ── Verification ────────────────────────────────────────────────────────────


def _check(checks: list[dict[str, Any]], name: str, ok: bool, **detail: Any) -> None:
    checks.append({"check": name, "ok": bool(ok), **detail})


def _load_json(raw: bytes, label: str, checks: list[dict[str, Any]]) -> Any:
    try:
        return json.loads(raw.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        _check(checks, f"{label} is valid JSON", False, detail=str(exc))
        return None


def verify_pack(pack: Any, checks: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """Recompute the pack's self-hash and compare it with ``integrity.pack_sha256``."""
    checks = [] if checks is None else checks
    if not isinstance(pack, dict):
        _check(checks, "pack is a JSON object", False)
        return checks
    integrity = pack.get("integrity")
    if not isinstance(integrity, dict) or "pack_sha256" not in integrity:
        _check(
            checks,
            "pack self-hash",
            False,
            detail="pack has no integrity.pack_sha256 (exported before schema 1.1.0?)",
        )
        return checks
    actual = pack_sha256(pack)
    _check(
        checks,
        "pack self-hash",
        actual == integrity.get("pack_sha256"),
        expected=integrity.get("pack_sha256"),
        actual=actual,
    )
    return checks


def verify_files(files: dict[str, bytes]) -> dict[str, Any]:
    """Verify a bundle given as {path: bytes}. Returns {ok, checks, ...}."""
    checks: list[dict[str, Any]] = []
    if MANIFEST_NAME not in files:
        # A bare pack can still be checked against its own hash.
        if PACK_NAME in files or len(files) == 1:
            raw = files.get(PACK_NAME) or next(iter(files.values()))
            pack = _load_json(raw, "pack", checks)
            if pack is not None:
                verify_pack(pack, checks)
            return _report(checks, kind="pack")
        _check(checks, "manifest.json present", False)
        return _report(checks, kind="bundle")

    manifest = _load_json(files[MANIFEST_NAME], "manifest", checks)
    if not isinstance(manifest, dict):
        if manifest is not None:
            _check(checks, "manifest is a JSON object", False)
        return _report(checks, kind="bundle")

    _check(
        checks,
        "manifest schema",
        manifest.get("schema") == MANIFEST_SCHEMA,
        actual=manifest.get("schema"),
    )
    actual = manifest_sha256(manifest)
    _check(
        checks,
        "manifest self-hash",
        actual == manifest.get("manifest_sha256"),
        expected=manifest.get("manifest_sha256"),
        actual=actual,
    )

    listed: set[str] = set()
    for art in manifest.get("artifacts") or []:
        path = str(art.get("path", ""))
        listed.add(path)
        raw = files.get(path)
        if raw is None:
            _check(checks, f"{path}: present", False)
            continue
        digest = sha256_hex(raw)
        _check(
            checks,
            f"{path}: sha256",
            digest == art.get("sha256") and len(raw) == art.get("size_bytes"),
            expected=art.get("sha256"),
            actual=digest,
            size_bytes=len(raw),
        )
    for extra in sorted(set(files) - listed - {MANIFEST_NAME}):
        _check(checks, f"{extra}: listed in manifest", False, detail="file not in manifest")

    if PACK_NAME in files:
        pack = _load_json(files[PACK_NAME], "pack", checks)
        if pack is not None:
            verify_pack(pack, checks)
            if isinstance(pack, dict):
                recomputed = pack_sha256(pack)
                _check(
                    checks,
                    "manifest pack_sha256 matches pack",
                    recomputed == manifest.get("pack_sha256"),
                    expected=manifest.get("pack_sha256"),
                    actual=recomputed,
                )
                prov_hash = ((pack.get("provenance") or {}).get("input") or {}).get("sha256")
                _check(
                    checks,
                    "manifest input_sha256 matches provenance",
                    prov_hash == manifest.get("input_sha256"),
                    expected=manifest.get("input_sha256"),
                    actual=prov_hash,
                )
    else:
        _check(checks, f"{PACK_NAME}: present", False)

    return _report(
        checks,
        kind="bundle",
        signed=bool(manifest.get("signature")),
        input_sha256=manifest.get("input_sha256"),
    )


def _report(checks: list[dict[str, Any]], **extra: Any) -> dict[str, Any]:
    return {"ok": bool(checks) and all(c["ok"] for c in checks), "checks": checks, **extra}


def read_bundle_bytes(data: bytes, name: str = "") -> dict[str, bytes]:
    """{path: bytes} from a ZIP bundle or a single JSON file (by content)."""
    if data[:4] == b"PK\x03\x04":
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            infos = [i for i in zf.infolist() if not i.is_dir()]
            if len(infos) > MAX_BUNDLE_FILES:
                raise ValueError(f"bundle has more than {MAX_BUNDLE_FILES} files")
            if sum(i.file_size for i in infos) > MAX_UNCOMPRESSED_BYTES:
                raise ValueError("bundle is too large when uncompressed")
            # zipfile reads the last of two same-named entries, unzip tools often
            # show the first: a verified bundle could display different content.
            names = [i.filename for i in infos]
            if len(set(names)) != len(names):
                raise ValueError("bundle has duplicate entry names")
            # Read in memory only; nothing is extracted to disk.
            return {i.filename: zf.read(i) for i in infos}
    return {Path(name).name or PACK_NAME: data}


def read_bundle_path(path: Path) -> dict[str, bytes]:
    if path.is_dir():
        return {p.name: p.read_bytes() for p in sorted(path.iterdir()) if p.is_file()}
    return read_bundle_bytes(path.read_bytes(), path.name)


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 1 or args[0] in ("-h", "--help"):
        print("usage: python -m core.evidence_integrity <bundle.zip | bundle-dir | evidence-pack.json>")
        return 2
    report = verify_files(read_bundle_path(Path(args[0])))
    for c in report["checks"]:
        line = f"[{'ok' if c['ok'] else 'FAIL'}] {c['check']}"
        if not c["ok"] and ("expected" in c or "detail" in c):
            line += f"  ({c.get('detail') or 'expected ' + str(c.get('expected')) + ', got ' + str(c.get('actual'))})"
        print(line)
    if report.get("kind") == "bundle" and not report.get("signed"):
        print("note: the manifest is not signed; hashes detect changes, not who made them.")
    print("VERIFIED" if report["ok"] else "NOT VERIFIED")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
