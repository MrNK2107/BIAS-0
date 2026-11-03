"""Seeded synthetic hiring-screen log for demos and tests (NYC Local Law 144 shape).

``python -m utils.hiring_log_sample`` (from ``backend/``) regenerates
``backend/samples/sample_hiring_screen.csv``.

The story it encodes (so the demo has something real to find):

- An HR-tech vendor's AI resume screener ("TalentLens"), used by an employer
  hiring in New York City, 10 months of applications (Jan - Oct 2026).
- Every candidate gets a ``screen_score`` (0-1) and the top of the queue is
  ``shortlisted`` for a recruiter call. LL144 asks for selection *and* scoring
  rates, so both are in the log.
- Screener ``s1.4`` until June 2026: small gaps, all impact ratios near or
  above 0.8.
- Screener ``s1.5`` from July 2026 adds an "employment-gap" feature. Career
  breaks are far more common among women in this log, so the female
  shortlist rate falls and the sex impact ratio drifts below 0.8.
- A "school tier" feature costs Black and Hispanic or Latino candidates a
  little from the start: the pooled race impact ratio sits near 0.8, so its
  verdict depends on the interval, not the point.
- Native Hawaiian or Other Pacific Islander candidates are about 0.5 % of
  the log (under 30): flagged, not ranked.
- About 9 % of candidates did not disclose race/ethnicity: the LL144
  unknown category, excluded from the ratios and counted.
- There is no outcome column (a screener rarely sees later job performance):
  the audit runs on decisions alone and says what it cannot measure.

Everything is synthetic. No real person is described.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

HIRING_SAMPLE_PATH = Path(__file__).resolve().parent.parent / "samples" / "sample_hiring_screen.csv"
SCREENER_UPDATE = pd.Timestamp("2026-07-01")

RACE_CATEGORIES = [
    "White",
    "Black or African American",
    "Hispanic or Latino",
    "Asian",
    "Native Hawaiian or Other Pacific Islander",
    "Two or More Races",
    "",
]
RACE_P = [0.36, 0.17, 0.17, 0.17, 0.005, 0.035, 0.09]


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def make_hiring_log(n: int = 4000, seed: int = 11) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    start = pd.Timestamp("2026-01-01")
    days = rng.integers(0, 304, n)  # Jan 1 - Oct 31
    dates = start + pd.to_timedelta(np.sort(days), unit="D")

    sex = rng.choice(["Female", "Male"], n, p=[0.46, 0.54])
    race = rng.choice(RACE_CATEGORIES, n, p=RACE_P)
    job_family = rng.choice(["Engineering", "Sales", "Operations"], n, p=[0.45, 0.30, 0.25])
    years = np.clip(np.round(rng.gamma(2.2, 2.6, n)), 0, 30).astype(int)
    # Career breaks: more common for women in this log (caregiving), unrelated to skill.
    gap = rng.random(n) < np.where(sex == "Female", 0.45, 0.08)

    # Latent job-relevant skill: the same distribution for every group.
    skill = rng.normal(0, 1, n) + 0.04 * np.minimum(years, 12)

    after = dates >= SCREENER_UPDATE
    penalty = np.zeros(n)
    # "School tier" feature, present throughout: a small proxy penalty.
    penalty += np.where(race == "Black or African American", 0.30, 0.0)
    penalty += np.where(race == "Hispanic or Latino", 0.22, 0.0)
    # s1.5: the employment-gap feature.
    penalty += np.where(after & gap, 2.4, 0.0)
    raw = 1.5 * skill - 0.35 - penalty + rng.normal(0, 0.4, n)
    score = _sigmoid(raw)
    shortlisted = score >= 0.5

    return pd.DataFrame(
        {
            "candidate_id": [f"CAND-{i:05d}" for i in range(1, n + 1)],
            "applied_date": dates.strftime("%Y-%m-%d"),
            "screener_version": np.where(after, "s1.5", "s1.4"),
            "job_family": job_family,
            "sex": sex,
            "race_ethnicity": race,
            "years_experience": years,
            "employment_gap": np.where(gap, "yes", "no"),
            "screen_score": np.round(score, 4),
            "shortlisted": np.where(shortlisted, "yes", "no"),
        }
    )


def main() -> None:
    HIRING_SAMPLE_PATH.parent.mkdir(parents=True, exist_ok=True)
    make_hiring_log().to_csv(HIRING_SAMPLE_PATH, index=False, lineterminator="\n")
    print(f"wrote {HIRING_SAMPLE_PATH}")


if __name__ == "__main__":
    main()
