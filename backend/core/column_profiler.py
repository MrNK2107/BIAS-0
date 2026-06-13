from __future__ import annotations

from collections import Counter
from typing import Any


# Patterns that identify non-sensitive technical/identifier columns.
# Gated early so we don't waste compute on obvious non-candidates.
_TECHNICAL_PATTERNS = [
    "id", "uuid", "guid", "key",
    "timestamp", "createdat", "updatedat",
    "index", "rank",
    # numeric measures that aren't grouping variables
    "amount", "total", "price", "cost",
]


def _normalize(val: str) -> str:
    return val.strip().lower()


def _is_technical(column: str) -> bool:
    raw = column.lower().replace("_", "").replace("-", "").replace(" ", "")
    for p in _TECHNICAL_PATTERNS:
        if p in raw:
            return True
    return False


def _categorical_score(unique_count: int, total_count: int) -> float:
    """Low cardinality relative to row-count → likely a grouping variable."""
    if total_count == 0:
        return 0.0
    ratio = unique_count / total_count
    if ratio <= 0.02:
        return 1.0
    if ratio <= 0.05:
        return 0.9
    if ratio <= 0.10:
        return 0.7
    if ratio <= 0.25:
        return 0.4
    if ratio <= 0.50:
        return 0.1
    return 0.0


def _readable_score(values: list[str]) -> float:
    """Values should be short human-readable labels, not IDs or raw numbers."""
    cleaned = [v.strip() for v in values if v.strip()]
    if not cleaned:
        return 0.0

    sample = cleaned[:200]
    total = len(sample)

    numeric = 0
    id_like = 0
    too_long = 0
    has_duplicates = False
    seen: set[str] = set()

    for v in sample:
        try:
            float(v)
            numeric += 1
            continue
        except ValueError:
            pass

        if v in seen:
            has_duplicates = True
        seen.add(v)

        if len(v) > 40:
            too_long += 1

        if len(v) > 15 and all(c.isalnum() or c in "-_" for c in v):
            id_like += 1

    # Hard penalties for non-readable patterns
    if numeric / total > 0.3:
        return 0.0
    if id_like / total > 0.2:
        return 0.0
    if not has_duplicates and len(seen) == total:
        return 0.0
    if too_long / total > 0.3:
        return 0.2

    lengths = [len(v) for v in sample]
    avg_len = sum(lengths) / len(lengths)

    if 2 <= avg_len <= 20:
        return 1.0
    if avg_len < 2:
        return 0.2
    if avg_len <= 35:
        return 0.6
    return 0.2


def _balance_score(values: list[str]) -> float:
    """Evenly distributed groups → plausible demographic/protected attribute."""
    cleaned = [v.strip().lower() for v in values if v.strip()]
    if not cleaned:
        return 0.0

    counts = Counter(cleaned)
    total = len(cleaned)
    max_freq = max(counts.values())

    if max_freq == total:
        return 0.0
    dominant = max_freq / total
    if dominant > 0.85:
        return 0.1
    if dominant > 0.60:
        return 0.4
    return 1.0


def score_column(column: str, sample_values: list[str]) -> float:
    if _is_technical(column):
        return 0.0

    unique = list({_normalize(v) for v in sample_values if _normalize(v)})

    cat = _categorical_score(len(unique), len(sample_values))
    readable = _readable_score(sample_values)
    balance = _balance_score(sample_values)

    # Numeric-only columns (age, income, etc.) are not categorical grouping vars
    if readable == 0.0:
        return 0.0

    score = cat * 0.40 + readable * 0.35 + balance * 0.25
    return round(min(1.0, score), 2)


def analyze_columns(
    columns: list[str], rows: list[list[str]], sample_size: int = 500
) -> list[dict[str, Any]]:
    n = min(sample_size, len(rows))
    results: list[dict[str, Any]] = []
    for ci, col in enumerate(columns):
        values = [row[ci] for row in rows[:n] if ci < len(row)]
        confidence = score_column(col, values)
        reason = _explain(col, values, confidence)
        results.append({
            "column": col,
            "confidence": confidence,
            "reason": reason,
        })
    results.sort(key=lambda r: r["confidence"], reverse=True)
    return results


def _explain(column: str, values: list[str], confidence: float) -> str:
    if confidence >= 0.8:
        return "Categorical grouping variable with balanced, readable values"
    if confidence >= 0.5:
        return "Possible grouping variable — may be a sensitive attribute"
    if confidence >= 0.2:
        return "Weak signal — review manually"
    return ""
