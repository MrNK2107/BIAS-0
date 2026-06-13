from __future__ import annotations

# ── Domain-specific risk thresholds ──────────────────────────────────────
# Each domain gets its own fairness-score cutoffs because high-stakes
# domains (criminal justice, healthcare) demand stricter standards.
DOMAIN_THRESHOLDS: dict[str, dict[str, float]] = {
    "criminal_justice": {"green_min": 80, "yellow_min": 55, "red_max": 55},
    "healthcare": {"green_min": 78, "yellow_min": 55, "red_max": 55},
    "loan": {"green_min": 70, "yellow_min": 45, "red_max": 45},
    "hiring": {"green_min": 72, "yellow_min": 48, "red_max": 48},
    "insurance": {"green_min": 70, "yellow_min": 45, "red_max": 45},
    "education": {"green_min": 68, "yellow_min": 42, "red_max": 42},
    "marketing": {"green_min": 60, "yellow_min": 35, "red_max": 35},
    "other": {"green_min": 75, "yellow_min": 50, "red_max": 50},
}

DEFAULT_THRESHOLDS = DOMAIN_THRESHOLDS["other"]


def _domain_thresholds(domain: str) -> dict[str, float]:
    return DOMAIN_THRESHOLDS.get(domain, DEFAULT_THRESHOLDS)


def risk_from_gap(gap: float, domain: str = "other") -> str:
    """Map max gap to risk level using domain-specific thresholds.

    Fairness score ≈ 100 * (1 - max_gap).
    - Green: score >= green_min  → gap <= 1 - green_min/100
    - Yellow: score >= yellow_min → gap <= 1 - yellow_min/100
    - Red: score < yellow_min     → gap > 1 - yellow_min/100
    """
    th = _domain_thresholds(domain)
    red_threshold = 1.0 - th["yellow_min"] / 100.0
    green_threshold = 1.0 - th["green_min"] / 100.0
    if gap > red_threshold:
        return "Red"
    if gap > green_threshold:
        return "Yellow"
    return "Green"


def risk_from_score(score: float, domain: str = "other") -> str:
    th = _domain_thresholds(domain)
    if score >= th["green_min"]:
        return "Green"
    if score >= th["yellow_min"]:
        return "Yellow"
    return "Red"
