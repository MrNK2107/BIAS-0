"""Audit ledger: a per-user, hash-chained history of outcome audits.

Every recorded audit appends one summary entry (no row-level data): the input
hash, the mapping, the verdict and the per-attribute impact-ratio intervals.
Each entry carries ``prev_entry_sha256`` (the previous entry's hash) and its
own ``entry_sha256`` over the RFC 8785 canonical JSON of the rest of the entry
(``core.evidence_integrity.canonical_sha256``, the same canonicalisation as the
evidence pack). Editing or deleting any past entry breaks the chain, which
``verify_chain`` reports.

What it does not prove: the chain is unsigned, so someone with write access to
the whole store could rewrite every entry and recompute all hashes. Anchoring
the head hash elsewhere (a ticket, an email, a signed manifest) closes that gap;
the API returns the head hash for that purpose.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from .evidence_integrity import canonical_sha256

LEDGER_SCHEMA = "bias0.audit-ledger@1.0.0"
GENESIS = "0" * 64


def _attribute_summary(audit: dict[str, Any]) -> dict[str, Any]:
    out = {}
    for name, block in {**audit["attributes"], **audit["intersections"]}.items():
        di = block["gaps"]["disparate_impact_ratio"]
        out[name] = {
            "status": block["verdict"]["status"],
            "impact_ratio": di["point"],
            "ci_lower": di["ci_lower"],
            "ci_upper": di["ci_upper"],
        }
    return out


def build_entry(
    audit: dict[str, Any],
    provenance: dict[str, Any],
    *,
    uid: str,
    seq: int,
    prev_entry_sha256: str,
    system_name: str | None = None,
    recorded_at: str | None = None,
) -> dict[str, Any]:
    """A ledger entry for one audit, with its chain hash filled in."""
    drift = audit.get("drift") or {}
    entry: dict[str, Any] = {
        "schema": LEDGER_SCHEMA,
        "seq": seq,
        "uid": uid,
        "recorded_at": recorded_at or datetime.now(UTC).isoformat(timespec="seconds"),
        "system_name": system_name or None,
        "input": {
            "filename": provenance.get("filename"),
            "sha256": provenance.get("sha256"),
            "rows": provenance.get("rows"),
        },
        "mapping": audit["mapping"],
        "threshold": audit["threshold"],
        "audit_schema": audit["schema"],
        "verdict": {
            "status": audit["verdict"]["status"],
            "grade": audit["verdict"]["grade"],
            "worst_impact_ratio": audit["verdict"]["worst_impact_ratio"],
        },
        "attributes": _attribute_summary(audit),
        "drift_alerts": len(drift.get("alerts") or []),
        "window": (
            [drift["periods"][0]["period"], drift["periods"][-1]["period"]]
            if drift.get("periods") else None
        ),
        "prev_entry_sha256": prev_entry_sha256,
    }
    # Plain JSON types only (numpy floats in, canonical numbers out).
    entry = json.loads(json.dumps(entry, default=float))
    entry["entry_sha256"] = entry_hash(entry)
    return entry


def entry_hash(entry: dict[str, Any]) -> str:
    body = {k: v for k, v in entry.items() if k not in ("entry_sha256", "id", "created_at", "updated_at")}
    return canonical_sha256(body)


def verify_chain(entries: list[dict[str, Any]]) -> dict[str, Any]:
    """Check sequence, links and hashes of one user's entries (any order)."""
    ordered = sorted(entries, key=lambda e: e.get("seq", 0))
    problems: list[str] = []
    prev = GENESIS
    for i, e in enumerate(ordered, start=1):
        if e.get("seq") != i:
            problems.append(f"Entry {e.get('seq')}: expected sequence number {i} (an entry is missing).")
        if e.get("prev_entry_sha256") != prev:
            problems.append(f"Entry {e.get('seq')}: does not link to the previous entry.")
        if entry_hash(e) != e.get("entry_sha256"):
            problems.append(f"Entry {e.get('seq')}: content does not match its hash (edited after recording).")
        prev = e.get("entry_sha256", "")
    return {
        "ok": not problems,
        "n_entries": len(ordered),
        "head_sha256": ordered[-1]["entry_sha256"] if ordered else GENESIS,
        "problems": problems,
    }


def compare_to_previous(entry: dict[str, Any], history: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Change in impact ratios against the latest earlier audit of the same system."""
    same = [
        h for h in history
        if h["seq"] < entry["seq"]
        and (h.get("system_name") or None) == (entry.get("system_name") or None)
        and h["mapping"]["decision_col"] == entry["mapping"]["decision_col"]
    ]
    if not same:
        return None
    prev = max(same, key=lambda h: h["seq"])
    changes = {}
    for name, cur in entry["attributes"].items():
        old = prev["attributes"].get(name)
        if not old or old["impact_ratio"] is None or cur["impact_ratio"] is None:
            continue
        changes[name] = {
            "from": old["impact_ratio"],
            "to": cur["impact_ratio"],
            "delta": round(cur["impact_ratio"] - old["impact_ratio"], 4),
            "status_from": old["status"],
            "status_to": cur["status"],
        }
    return {
        "previous_seq": prev["seq"],
        "previous_recorded_at": prev["recorded_at"],
        "same_input": prev["input"]["sha256"] == entry["input"]["sha256"],
        "grade_from": prev["verdict"]["grade"],
        "grade_to": entry["verdict"]["grade"],
        "changes": changes,
    }
