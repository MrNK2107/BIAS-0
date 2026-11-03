"""Seeded synthetic lending decision log for demos and tests.

``python -m utils.decision_log_sample`` (from ``backend/``) regenerates
``backend/samples/sample_lending_decisions.csv``.

The story it encodes (so the demo has something real to find):

- A digital lender, 12 months of personal-loan decisions (Nov 2025 - Oct 2026).
- Model ``v2.2`` until April 2026: modest gaps, all impact ratios above 0.8.
- Model ``v2.3`` from May 2026 adds alternative-data features (device, SMS) that
  act as proxies for **rural region** and **ST** applicants, whose approval
  rates fall. Fairness drift should show the impact ratio crossing 0.8.
- ``gender = other`` is tiny (about 0.4 %, under 30 decisions), so its rate is noisy and must be
  flagged, not ranked.
- About 7 % of applicants did not disclose a caste category (blank): LL144-style
  unknown category, excluded from impact ratios and counted.
- ``repaid_12m`` is a retrospective outcome label for every applicant (a
  synthetic convenience; real logs usually only observe repayment for approved
  loans, which the audit warns about).

Everything is synthetic. No real person is described.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

SAMPLE_PATH = Path(__file__).resolve().parent.parent / "samples" / "sample_lending_decisions.csv"
MODEL_UPDATE = pd.Timestamp("2026-05-01")


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def make_decision_log(n: int = 6000, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    start = pd.Timestamp("2025-11-01")
    days = rng.integers(0, 365, n)
    dates = start + pd.to_timedelta(np.sort(days), unit="D")

    gender = rng.choice(["female", "male", "other"], n, p=[0.38, 0.616, 0.004])
    age_band = rng.choice(["18-25", "26-35", "36-50", "51+"], n, p=[0.22, 0.38, 0.28, 0.12])
    region = rng.choice(["metro", "urban", "rural"], n, p=[0.40, 0.33, 0.27])
    caste = rng.choice(["General", "OBC", "SC", "ST", ""], n, p=[0.36, 0.33, 0.15, 0.09, 0.07])
    income_band = rng.choice(["<3L", "3-6L", "6-12L", ">12L"], n, p=[0.24, 0.36, 0.28, 0.12])

    income_effect = pd.Series(income_band).map({"<3L": -0.5, "3-6L": -0.1, "6-12L": 0.3, ">12L": 0.6}).to_numpy()
    # Latent creditworthiness: the same distribution for every group (so any
    # decision gap beyond income mix is not explained by ability to repay).
    worth = rng.normal(0, 1, n) + income_effect
    bureau = np.clip(np.round(700 + 70 * worth + rng.normal(0, 25, n)), 300, 900).astype(int)
    repaid = rng.random(n) < _sigmoid(1.3 * worth + 1.1)

    after = dates >= MODEL_UPDATE
    penalty = np.zeros(n)
    penalty += np.where(region == "rural", 0.10, 0.0)
    penalty += np.where(caste == "ST", 0.15, 0.0)
    penalty += np.where(caste == "SC", 0.08, 0.0)
    # v2.3: alternative-data proxies hit rural and ST applicants.
    penalty += np.where(after & (region == "rural"), 1.0, 0.0)
    penalty += np.where(after & (caste == "ST"), 0.9, 0.0)
    score = _sigmoid(1.6 * worth + 0.55 - penalty + rng.normal(0, 0.35, n))
    approved = score >= 0.5

    return pd.DataFrame(
        {
            "application_id": [f"APP-{i:06d}" for i in range(1, n + 1)],
            "decision_date": dates.strftime("%Y-%m-%d"),
            "model_version": np.where(after, "v2.3", "v2.2"),
            "gender": gender,
            "age_band": age_band,
            "region_tier": region,
            "caste_category": caste,
            "income_band": income_band,
            "bureau_score": bureau,
            "model_score": np.round(score, 4),
            "decision": np.where(approved, "approved", "declined"),
            "repaid_12m": np.where(repaid, "yes", "no"),
        }
    )


def main() -> None:
    SAMPLE_PATH.parent.mkdir(parents=True, exist_ok=True)
    make_decision_log().to_csv(SAMPLE_PATH, index=False, lineterminator="\n")
    print(f"wrote {SAMPLE_PATH}")


if __name__ == "__main__":
    main()
