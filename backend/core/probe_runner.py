"""Send paired probes to an HTTP screener and collect its decisions.

This runs on your machine from the command line (``python -m cli probes run``),
not inside the BIAS-0 server: the server never makes outbound calls to a URL a
user typed, and API keys for the screener stay in your shell.

One POST per probe. The request body is JSON: by default
``{"probe_id", "role", "resume_text"}``, or your own template where any string
``"{{field}}"`` is replaced by that probe field (a string that is exactly one
placeholder keeps the field's type). The decision and score are read from the
response JSON by dotted paths (``result.shortlisted``, ``choices.0.score``).

Modes:

- ``endpoint="mock"``: no network. A built-in seeded screener answers, with a
  configurable penalty on one variant, so the whole loop can be rehearsed and
  tested offline.
- ``dry_run=True``: no network. Each row gets the exact request that would be
  sent (URL and body) so you can check the template before spending API calls.
- otherwise: real calls through ``httpx``; failures are recorded per probe in
  an ``error`` column and the analysis drops incomplete pairs.

The output rows are the probe rows plus ``decision``, ``score``, ``error``
(and ``request`` in a dry run): upload them to ``/paired`` or run
``python -m cli paired``.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import time
from typing import Any, Callable

import httpx

from .outcome_audit import AuditInputError

DEFAULT_TEMPLATE: dict[str, Any] = {
    "probe_id": "{{probe_id}}",
    "role": "{{role}}",
    "resume_text": "{{resume_text}}",
}
_PLACEHOLDER = re.compile(r"\{\{\s*([A-Za-z0-9_]+)\s*\}\}")


def render(template: Any, probe: dict[str, Any]) -> Any:
    """Fill ``{{field}}`` placeholders in a JSON-like template from a probe row."""
    if isinstance(template, dict):
        return {k: render(v, probe) for k, v in template.items()}
    if isinstance(template, list):
        return [render(v, probe) for v in template]
    if isinstance(template, str):
        whole = _PLACEHOLDER.fullmatch(template.strip())
        if whole:
            return _field(probe, whole.group(1))
        return _PLACEHOLDER.sub(lambda m: str(_field(probe, m.group(1))), template)
    return template


def _field(probe: dict[str, Any], key: str) -> Any:
    if key not in probe:
        raise AuditInputError(f"The request template uses {{{{{key}}}}}, which is not a probe field.")
    return probe[key]


def extract(obj: Any, path: str | None) -> Any:
    """Read ``a.b.0.c`` from parsed JSON; None when the path is missing."""
    if not path:
        return None
    cur = obj
    for part in path.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        elif isinstance(cur, list) and part.lstrip("-").isdigit() and -len(cur) <= int(part) < len(cur):
            cur = cur[int(part)]
        else:
            return None
    return cur


def mock_screener(penalised: str | None, penalty: float = 0.6, seed: int = 0) -> Callable[[dict[str, Any]], dict[str, Any]]:
    """A deterministic stand-in screener: scores the resume, docks one variant by ``penalty`` logits."""

    def answer(probe: dict[str, Any]) -> dict[str, Any]:
        years = float(probe.get("years_experience") or 0)
        # Resume quality comes from the shared fields only, so both versions of a pair start equal.
        shared = f"{seed}|{probe.get('pair_id')}|{probe.get('role')}|{probe.get('skills')}|{probe.get('employers')}"
        u = int(hashlib.sha256(shared.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
        noise = int(hashlib.sha256(f"{seed}|{probe.get('probe_id')}".encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
        logit = 0.18 * (years - 7) + 2.4 * (u - 0.5) + 1.6 * (noise - 0.5)
        if penalised is not None and str(probe.get("variant")) == penalised:
            logit -= penalty
        score = 1 / (1 + math.exp(-logit))
        return {"score": round(score, 4), "decision": "yes" if score >= 0.5 else "no"}

    return answer


def run_probes(
    probes: list[dict[str, Any]],
    endpoint: str,
    *,
    template: Any = None,
    decision_path: str = "decision",
    score_path: str | None = "score",
    headers: dict[str, str] | None = None,
    timeout: float = 30.0,
    delay: float = 0.0,
    dry_run: bool = False,
    mock_penalised: str | None = None,
    mock_penalty: float = 0.6,
    client: httpx.Client | None = None,
    on_progress: Callable[[int, int], None] | None = None,
) -> list[dict[str, Any]]:
    template = DEFAULT_TEMPLATE if template is None else template
    mock = endpoint.strip().lower() == "mock"
    if not mock and not re.match(r"^https?://", endpoint.strip(), re.I):
        raise AuditInputError("The endpoint must be an http(s) URL, or 'mock' for the built-in offline screener.")
    answer = mock_screener(mock_penalised, mock_penalty) if mock else None
    own_client = None
    if not (mock or dry_run) and client is None:
        own_client = client = httpx.Client(timeout=timeout, headers=headers or {})
    out: list[dict[str, Any]] = []
    try:
        for i, probe in enumerate(probes):
            body = render(template, probe)
            row = {**probe, "decision": None, "score": None, "error": ""}
            if dry_run:
                row["request"] = json.dumps({"method": "POST", "url": endpoint, "body": body}, ensure_ascii=False)
            elif mock:
                data = answer(probe)
                row["decision"] = data["decision"]
                row["score"] = data["score"]
            else:
                try:
                    res = client.post(endpoint, json=body, headers=headers or None)
                    res.raise_for_status()
                    data = res.json()
                    dec = extract(data, decision_path)
                    if dec is None:
                        row["error"] = f"no '{decision_path}' in the response"
                    else:
                        row["decision"] = dec
                        sc = extract(data, score_path)
                        row["score"] = sc
                except (httpx.HTTPError, ValueError) as exc:
                    row["error"] = f"{type(exc).__name__}: {exc}"[:300]
                if delay:
                    time.sleep(delay)
            out.append(row)
            if on_progress:
                on_progress(i + 1, len(probes))
    finally:
        if own_client is not None:
            own_client.close()
    return out
