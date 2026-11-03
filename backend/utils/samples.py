"""The bundled synthetic decision logs, with the column mapping each one needs.

The UI lists these on the empty audit page so a visitor can run a realistic
audit in one click; the CLI and tests use the same presets.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from utils.decision_log_sample import SAMPLE_PATH
from utils.hiring_log_sample import HIRING_SAMPLE_PATH

SAMPLES: dict[str, dict[str, Any]] = {
    "lending": {
        "id": "lending",
        "title": "Personal-loan underwriting",
        "sector": "Lending",
        "path": SAMPLE_PATH,
        "rows": 6000,
        "window": "Nov 2025 - Oct 2026",
        "story": "A model update in May 2026 adds alternative-data features that penalise rural and ST applicants. "
                 "The pooled year looks borderline; the drift and one intersection do not.",
        "frameworks": ["RBI FREE-AI", "EU AI Act Annex III", "DPDP"],
        "mapping": {
            "decision_col": "decision",
            "group_cols": ["gender", "age_band", "region_tier", "caste_category"],
            "outcome_col": "repaid_12m",
            "score_col": "model_score",
            "time_col": "decision_date",
        },
        "system_name": "Personal-loan underwriting (PL-Score v2.x)",
        "organisation": "Example Finance (synthetic)",
    },
    "hiring": {
        "id": "hiring",
        "title": "AI resume screener",
        "sector": "Hiring",
        "path": HIRING_SAMPLE_PATH,
        "rows": 4000,
        "window": "Jan - Oct 2026",
        "story": "Screener s1.5 (July 2026) adds an employment-gap feature. Sex looks fine over the whole period "
                 "and breaches month after month since the release. No outcome column: a selection-only LL144 audit.",
        "frameworks": ["NYC LL144", "EU AI Act Annex III", "EEOC four-fifths (heuristic)"],
        "mapping": {
            "decision_col": "shortlisted",
            "group_cols": ["sex", "race_ethnicity"],
            "outcome_col": None,
            "score_col": "screen_score",
            "time_col": "applied_date",
        },
        "system_name": "TalentLens resume screener (s1.x)",
        "organisation": "Example Staffing, New York (synthetic)",
    },
}


def public_samples() -> list[dict[str, Any]]:
    """The catalogue without server paths."""
    return [{k: v for k, v in s.items() if k != "path"} | {"filename": Path(s["path"]).name} for s in SAMPLES.values()]
