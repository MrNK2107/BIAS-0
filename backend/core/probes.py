"""Paired-probe generation (Mode B, the other half): build the name-swapped probe set.

A paired test needs pairs of applications that are identical except for one
signal. This module writes them: each pair shares one synthetic resume (role,
years of experience, skills, education, employer history, surname) and the two
versions differ only in the first name, drawn from the two name lists. The
output is a file of probes to send to the screener; its results go back into
:func:`core.paired.paired_probe`.

Reproducible: the same groups, names, pair count, roles and seed always give
the same probes, byte for byte. Each probe carries a ``probe_set`` fingerprint
(a short SHA-256 of those settings) so results can be traced to the set.

The default names follow the correspondence-study tradition of first names
that most readers code as female or male (after Bertrand and Mullainathan,
2004). They are examples, not a validated instrument: swap in names that are
validated for the population and signal you are testing.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
from typing import Any

import numpy as np

from .outcome_audit import AuditInputError

PROBE_SCHEMA = "bias0.paired-probes@1.0.0"
MAX_PAIRS = 5000
MAX_NAMES = 200
MAX_NAME_LEN = 60

DEFAULT_GROUPS: list[dict[str, Any]] = [
    {"label": "female-coded", "names": ["Emily", "Anne", "Jill", "Allison", "Laurie", "Sarah", "Meredith", "Carrie"]},
    {"label": "male-coded", "names": ["Greg", "Brendan", "Geoffrey", "Brett", "Todd", "Matthew", "Neil", "Jay"]},
]
SURNAMES = ["Walsh", "Baker", "Murphy", "Kelly", "Sullivan", "Ryan", "Collins", "Mitchell", "Reed", "Parker",
            "Hayes", "Morgan", "Carter", "Bennett", "Foster", "Brooks"]
ROLE_SKILLS: dict[str, list[str]] = {
    "Backend engineer": ["Python", "Go", "PostgreSQL", "Kubernetes", "REST APIs", "Kafka", "AWS", "CI/CD"],
    "Data analyst": ["SQL", "Python", "Tableau", "Excel", "A/B testing", "dbt", "Looker", "statistics"],
    "Sales lead": ["Salesforce", "pipeline management", "negotiation", "forecasting", "B2B SaaS", "account planning"],
    "Operations manager": ["process improvement", "Lean", "vendor management", "budgeting", "SAP", "scheduling"],
}
DEGREES = ["BSc Computer Science", "BA Economics", "BBA Business Administration", "BSc Mathematics",
           "BEng Industrial Engineering", "BA Communications"]
EMPLOYERS = ["Northwind Traders", "Contoso Ltd", "Fabrikam", "Tailspin Toys", "Litware", "Adventure Works",
             "Wide World Importers", "Proseware"]
COLUMNS = ["probe_id", "pair_id", "variant", "first_name", "name", "role", "years_experience", "education",
           "skills", "employers", "resume_text", "probe_set"]


def _clean_groups(groups: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    groups = groups if groups is not None else DEFAULT_GROUPS
    if len(groups) != 2:
        raise AuditInputError("A paired test compares exactly two versions: give two groups of names.")
    out = []
    for g in groups:
        label = str(g.get("label", "")).strip()
        names = [str(n).strip() for n in g.get("names", []) if str(n).strip()]
        if not label:
            raise AuditInputError("Each group needs a label (for example 'female-coded').")
        if not names:
            raise AuditInputError(f"Group '{label}' has no names.")
        if len(names) > MAX_NAMES:
            raise AuditInputError(f"Group '{label}' has {len(names)} names; at most {MAX_NAMES}.")
        if any(len(n) > MAX_NAME_LEN for n in names):
            raise AuditInputError(f"Names must be at most {MAX_NAME_LEN} characters.")
        out.append({"label": label, "names": list(dict.fromkeys(names))})
    if out[0]["label"] == out[1]["label"]:
        raise AuditInputError("The two groups need different labels.")
    shared = set(out[0]["names"]) & set(out[1]["names"])
    if shared:
        raise AuditInputError(f"A name cannot be in both groups: {', '.join(sorted(shared))}.")
    return out


def probe_set_id(groups: list[dict[str, Any]], n_pairs: int, seed: int, roles: list[str]) -> str:
    key = json.dumps({"schema": PROBE_SCHEMA, "groups": groups, "n_pairs": n_pairs, "seed": seed, "roles": roles},
                     sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(key.encode()).hexdigest()[:12]


def generate_probes(
    n_pairs: int = 200,
    seed: int = 7,
    groups: list[dict[str, Any]] | None = None,
    roles: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Two probes per pair, identical except for the first name. Deterministic for a given input."""
    if not 1 <= int(n_pairs) <= MAX_PAIRS:
        raise AuditInputError(f"Pairs must be between 1 and {MAX_PAIRS}.")
    n_pairs, seed = int(n_pairs), int(seed)
    clean = _clean_groups(groups)
    roles = list(roles) if roles else list(ROLE_SKILLS)
    unknown = [r for r in roles if r not in ROLE_SKILLS]
    if unknown:
        raise AuditInputError(f"Unknown role(s): {', '.join(unknown)}. Choose from {', '.join(ROLE_SKILLS)}.")
    set_id = probe_set_id(clean, n_pairs, seed, roles)
    rng = np.random.default_rng(seed)
    rows: list[dict[str, Any]] = []
    for i in range(n_pairs):
        role = roles[int(rng.integers(len(roles)))]
        pool = ROLE_SKILLS[role]
        skills = [pool[j] for j in sorted(rng.choice(len(pool), size=min(4, len(pool)), replace=False))]
        years = int(rng.integers(1, 15))
        degree = DEGREES[int(rng.integers(len(DEGREES)))]
        employers = [EMPLOYERS[j] for j in rng.choice(len(EMPLOYERS), size=2, replace=False)]
        surname = SURNAMES[int(rng.integers(len(SURNAMES)))]
        firsts = [g["names"][int(rng.integers(len(g["names"])))] for g in clean]
        # Presentation order is randomised per pair so a screener that drifts within a batch
        # (or caches by position) cannot line up with the signal.
        order = [0, 1] if rng.random() < 0.5 else [1, 0]
        pair_id = f"P-{i + 1:04d}"
        for k in order:
            first = firsts[k]
            name = first if " " in first else f"{first} {surname}"
            text = (
                f"Name: {name}\n"
                f"Applying for: {role}\n"
                f"Experience: {years} year{'s' if years != 1 else ''}; most recently at {employers[0]}, before that {employers[1]}\n"
                f"Skills: {', '.join(skills)}\n"
                f"Education: {degree}"
            )
            rows.append({
                "probe_id": f"{pair_id}-{'AB'[k]}",
                "pair_id": pair_id,
                "variant": clean[k]["label"],
                "first_name": first,
                "name": name,
                "role": role,
                "years_experience": years,
                "education": degree,
                "skills": "; ".join(skills),
                "employers": "; ".join(employers),
                "resume_text": text,
                "probe_set": set_id,
            })
    return rows


def probes_to_csv(rows: list[dict[str, Any]], extra: list[str] | None = None) -> str:
    buf = io.StringIO()
    cols = COLUMNS + [c for c in (extra or []) if c not in COLUMNS]
    w = csv.DictWriter(buf, fieldnames=cols, extrasaction="ignore", lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
    return buf.getvalue()


def probes_to_jsonl(rows: list[dict[str, Any]]) -> str:
    return "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows)


def read_probes(text: str) -> list[dict[str, Any]]:
    """Read probes back from CSV or JSONL (detected from the first character)."""
    text = text.lstrip("﻿")
    if text.lstrip().startswith("{"):
        return [json.loads(line) for line in text.splitlines() if line.strip()]
    return list(csv.DictReader(io.StringIO(text)))
