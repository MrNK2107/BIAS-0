"""Hash-chained audit ledger: build, verify, tamper detection, comparison."""

from __future__ import annotations

import copy

import pandas as pd

from core.audit_ledger import (
    GENESIS,
    build_entry,
    compare_to_previous,
    entry_hash,
    verify_chain,
)
from core.outcome_audit import run_outcome_audit

FAST = {"n_boot": 100, "seed": 3}


def _audit(rate_b: float):
    rows = []
    for g, rate in (("a", 0.6), ("b", rate_b)):
        k = int(400 * rate)
        rows += [{"g": g, "d": 1}] * k + [{"g": g, "d": 0}] * (400 - k)
    return run_outcome_audit(pd.DataFrame(rows), "d", ["g"], config=FAST)


def _chain(n: int = 3) -> list[dict]:
    entries: list[dict] = []
    prev = GENESIS
    for i in range(1, n + 1):
        e = build_entry(
            _audit(0.6 - 0.1 * i), {"filename": f"m{i}.csv", "sha256": f"{i:064x}", "rows": 800},
            uid="u1", seq=i, prev_entry_sha256=prev, system_name="PL-Score",
            recorded_at=f"2026-0{i}-01T00:00:00+00:00",
        )
        entries.append(e)
        prev = e["entry_sha256"]
    return entries


def test_entry_is_summary_only_and_hash_is_stable():
    e = _chain(1)[0]
    assert e["prev_entry_sha256"] == GENESIS
    assert e["entry_sha256"] == entry_hash(e)
    assert set(e["attributes"]["g"]) == {"status", "impact_ratio", "ci_lower", "ci_upper"}
    assert "groups" not in str(e.keys())
    # storage metadata does not change the hash
    assert entry_hash({**e, "id": "x", "created_at": "now"}) == e["entry_sha256"]


def test_intact_chain_verifies_in_any_order():
    entries = _chain(3)
    res = verify_chain(list(reversed(entries)))
    assert res["ok"] and res["n_entries"] == 3
    assert res["head_sha256"] == entries[-1]["entry_sha256"]
    assert verify_chain([])["ok"]


def test_edited_entry_is_detected():
    entries = copy.deepcopy(_chain(3))
    entries[1]["verdict"]["grade"] = "A"
    res = verify_chain(entries)
    assert not res["ok"]
    assert any("Entry 2" in p and "edited" in p for p in res["problems"])


def test_edit_with_recomputed_hash_breaks_the_next_link():
    entries = copy.deepcopy(_chain(3))
    entries[1]["verdict"]["grade"] = "A"
    entries[1]["entry_sha256"] = entry_hash(entries[1])
    res = verify_chain(entries)
    assert not res["ok"]
    assert any("Entry 3" in p and "link" in p for p in res["problems"])


def test_deleted_entry_is_detected():
    entries = _chain(3)
    res = verify_chain([entries[0], entries[2]])
    assert not res["ok"]
    assert any("missing" in p for p in res["problems"])


def test_compare_to_previous_audit_of_same_system():
    entries = _chain(3)
    cmp = compare_to_previous(entries[2], entries[:2])
    assert cmp["previous_seq"] == 2
    ch = cmp["changes"]["g"]
    assert ch["from"] == entries[1]["attributes"]["g"]["impact_ratio"]
    assert ch["delta"] < 0  # group b's rate keeps falling
    assert cmp["same_input"] is False
    assert compare_to_previous(entries[0], []) is None
