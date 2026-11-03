"""Seeded synthetic paired-probe results for demos and tests.

``python -m utils.paired_probe_sample`` (from ``backend/``) regenerates
``backend/samples/sample_paired_probes.csv``.

The story: an HR team tests a vendor's LLM resume screener before buying it.
They send 400 pairs of resumes. Within a pair the resume is identical except
the candidate's name, which reads as female or as male. The screener returns
a score and a shortlist decision. It quietly docks resumes with
female-coded names, so pairs that are decided differently mostly favour the
male-coded version. Everything is synthetic.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

PAIRED_SAMPLE_PATH = Path(__file__).resolve().parent.parent / "samples" / "sample_paired_probes.csv"
ROLES = ["Backend engineer", "Data analyst", "Sales lead", "Operations manager"]


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def make_paired_probes(n_pairs: int = 400, seed: int = 5) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    quality = rng.normal(0, 1.1, n_pairs)  # the shared resume
    role = rng.choice(ROLES, n_pairs)
    rows = []
    for i in range(n_pairs):
        for signal in ("female-coded", "male-coded"):
            penalty = 0.3 if signal == "female-coded" else 0.0
            score = float(_sigmoid(1.4 * quality[i] - penalty + rng.normal(0, 0.25)))
            rows.append({
                "pair_id": f"P-{i + 1:04d}",
                "role": role[i],
                "name_signal": signal,
                "screen_score": round(score, 4),
                "shortlisted": "yes" if score >= 0.5 else "no",
            })
    return pd.DataFrame(rows)


def main() -> None:
    PAIRED_SAMPLE_PATH.parent.mkdir(parents=True, exist_ok=True)
    make_paired_probes().to_csv(PAIRED_SAMPLE_PATH, index=False, lineterminator="\n")
    print(f"wrote {PAIRED_SAMPLE_PATH}")


if __name__ == "__main__":
    main()
