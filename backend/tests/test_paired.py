"""Paired-probe analysis: hand-counted tables, McNemar, verdict branches, validation, the sample."""

from __future__ import annotations

import hashlib

import pandas as pd
import pytest

from core.outcome_audit import AuditInputError
from core.paired import paired_probe
from utils.paired_probe_sample import PAIRED_SAMPLE_PATH, make_paired_probes

FAST = {"n_boot": 300, "seed": 1}


def _pairs(spec: dict[tuple[int, int], int]) -> pd.DataFrame:
    """spec: (decision for A, decision for B) -> number of pairs."""
    rows, i = [], 0
    for (da, db), k in spec.items():
        for _ in range(k):
            i += 1
            rows += [{"pair": i, "v": "A", "d": da}, {"pair": i, "v": "B", "d": db}]
    return pd.DataFrame(rows)


def test_table_rates_and_mcnemar_by_hand():
    df = _pairs({(1, 1): 20, (1, 0): 15, (0, 1): 3, (0, 0): 22})
    r = paired_probe(df, "pair", "v", "d", config=FAST)
    assert r["n_pairs"] == 60
    assert r["table"] == {"both_selected": 20, "only_reference": 15, "only_other": 3, "neither": 22}
    assert r["selection_rate"] == {"A": pytest.approx(35 / 60, abs=1e-4), "B": pytest.approx(23 / 60, abs=1e-4)}
    assert r["flip_rate"] == pytest.approx(18 / 60, abs=1e-4)
    # exact two-sided binomial on 15 of 18 discordant: 2 * P(X <= 3 | n=18, p=.5) = 0.00754
    assert r["mcnemar_p"] == pytest.approx(0.007538, abs=1e-5)
    assert r["verdict"]["status"] == "disparity" and r["favoured"] == "A"
    assert "15 favoured A and 3 favoured B" in r["verdict"]["reason"]


def test_balanced_flips_with_many_pairs_is_no_material_difference():
    df = _pairs({(1, 1): 400, (1, 0): 10, (0, 1): 10, (0, 0): 380})
    r = paired_probe(df, "pair", "v", "d", config=FAST)
    assert r["verdict"]["status"] == "no_material_disparity"
    assert -0.05 <= r["rate_difference_ci"][0] <= r["rate_difference_ci"][1] <= 0.05


def test_too_few_pairs_or_wide_interval_is_inconclusive():
    assert paired_probe(_pairs({(1, 0): 5, (0, 0): 5}), "pair", "v", "d", config=FAST)["verdict"]["status"] == "inconclusive"
    r = paired_probe(_pairs({(1, 1): 10, (1, 0): 8, (0, 1): 5, (0, 0): 17}), "pair", "v", "d", config=FAST)
    assert r["verdict"]["status"] == "inconclusive" and r["mcnemar_p"] > 0.05


def test_reference_flips_the_direction():
    df = _pairs({(1, 0): 15, (0, 1): 3, (0, 0): 42})
    r = paired_probe(df, "pair", "v", "d", reference="B", config=FAST)
    assert r["reference"] == "B" and r["table"]["only_reference"] == 3 and r["table"]["only_other"] == 15
    assert r["favoured"] == "A" and r["rate_difference"] < 0


def test_incomplete_pairs_are_dropped_and_counted():
    df = _pairs({(1, 0): 20, (0, 0): 20})
    df = pd.concat([df, pd.DataFrame([{"pair": 999, "v": "A", "d": 1}, {"pair": 998, "v": "A", "d": 1}, {"pair": 998, "v": "A", "d": 0}])])
    r = paired_probe(df, "pair", "v", "d", config=FAST)
    assert r["n_pairs"] == 40 and r["n_pairs_dropped"] == 2 and r["warnings"]


def test_validation_errors():
    df = _pairs({(1, 0): 5})
    with pytest.raises(AuditInputError, match="exactly two values"):
        paired_probe(df.assign(v=["A", "B", "C"] * 3 + ["A"]), "pair", "v", "d")
    with pytest.raises(AuditInputError, match="not in the file"):
        paired_probe(df, "pair", "nope", "d")
    with pytest.raises(AuditInputError, match="Reference"):
        paired_probe(df, "pair", "v", "d", reference="Z")


def test_sample_matches_generator_and_tells_its_story():
    expected = make_paired_probes().to_csv(index=False, lineterminator="\n").encode()
    assert hashlib.sha256(PAIRED_SAMPLE_PATH.read_bytes()).hexdigest() == hashlib.sha256(expected).hexdigest()
    r = paired_probe(pd.read_csv(PAIRED_SAMPLE_PATH), "pair_id", "name_signal", "shortlisted",
                     score_col="screen_score", reference="male-coded", config=FAST)
    assert r["n_pairs"] == 400 and r["verdict"]["status"] == "disparity" and r["favoured"] == "male-coded"
    assert r["score"]["mean_difference"] > 0 and r["score"]["ci"][0] > 0


def test_pairs_with_a_missing_decision_are_counted_as_dropped():
    df = pd.DataFrame({
        "pair": [f"p{i}" for i in range(40) for _ in range(2)],
        "v": ["a", "b"] * 40,
        "d": [1, 0] * 40,
    })
    df.loc[1, "d"] = None
    r = paired_probe(df, "pair", "v", "d", config={"n_boot": 50})
    assert r["n_pairs"] == 39 and r["n_pairs_dropped"] == 1
    assert any("no decision" in w for w in r["warnings"])
