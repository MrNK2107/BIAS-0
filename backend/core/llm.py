from __future__ import annotations

import json
import logging
import os
import time
from typing import Any

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a fairness auditing assistant. Your role is to explain bias metrics, fairness scores, and audit results in plain language.

Rules:
- Only explain the provided metrics — never guess or infer bias that isn't shown.
- Be concise (2-4 sentences for metric explanations, 1 paragraph for summaries).
- Use simple language accessible to non-technical users.
- Mention specific groups and values when available.
- When the user asks what to do, suggest options from the platform's existing toolkit (reweight, threshold tuning, remove proxy features, rebalance dataset).
- Never recommend deleting data as a mitigation strategy.
- If the data is insufficient to draw a conclusion, say so."""

_MOCK_EXPLANATIONS: dict[str, str] = {
    "fairness_score": (
        "The fairness score is an aggregate metric (0–100) that combines demographic "
        "parity and equal opportunity differences. A higher score means fairer outcomes. "
        "Scores below 70 typically indicate moderate bias that should be investigated."
    ),
    "demographic_parity_difference": (
        "Demographic parity measures whether approval rates are similar across groups. "
        "A difference of {value:.2f} means the approval rate for one group is "
        "{delta:.1f}% different from another. Values above 0.10 are generally "
        "considered a concern."
    ),
    "equal_opportunity_difference": (
        "Equal opportunity compares true positive rates across groups — whether "
        "qualified candidates from all groups are approved at similar rates. "
        "A gap of {value:.2f} suggests one group's qualified members are "
        "{delta:.1f}% less likely to be approved."
    ),
    "flip_rate": (
        "The flip rate shows what percentage of decisions would change if the "
        "sensitive attribute were hypothetically flipped. A rate of {value:.1f}% "
        "means that many decisions are influenced by the sensitive attribute, "
        "suggesting potential bias."
    ),
    "overall_fragility": (
        "The fragility rating measures how much the model's fairness degrades under "
        "stress conditions (label noise, under-sampling, distribution shift). "
        "Higher fragility means the model's fairness is brittle and may not "
        "generalize well to real-world conditions."
    ),
    "data_drift_score": (
        "Data drift measures how much the distribution of features has changed "
        "between the training data and the current data. A score above 0.2 "
        "suggests the model may be operating on data it wasn't trained for, "
        "which can degrade both accuracy and fairness."
    ),

    # ── Table-level metric mocks ──────────────────────────────────────

    "overall_accuracy": (
        "Overall accuracy measures the proportion of correct predictions across all "
        "groups. While important, accuracy alone doesn't capture fairness — a model "
        "can be highly accurate overall but still biased against a specific group. "
        "Cross-reference this with the demographic parity and equal opportunity gaps "
        "to assess whether accuracy is evenly distributed."
    ),
    "approval_rate": (
        "The approval rate is the proportion of applicants in a group who receive "
        "a positive outcome (e.g., loan approved, hire accepted). Comparing approval "
        "rates across groups is the basis for demographic parity analysis. A large "
        "spread between the highest and lowest group rates suggests disparate impact."
    ),
    "tpr": (
        "True Positive Rate (TPR) measures how many actually qualified individuals "
        "from a group were correctly approved. A low TPR for one group means "
        "qualified members of that group are being unfairly denied. This is also "
        "called the Equal Opportunity metric."
    ),
    "fpr": (
        "False Positive Rate (FPR) measures how many unqualified individuals from "
        "a group were incorrectly approved. Large differences in FPR across groups "
        "can indicate that the model is treating one group's mistakes differently "
        "from another's, which raises fairness concerns."
    ),
    "accuracy": (
        "Accuracy is the percentage of correct predictions (both approvals and "
        "denials) for a group. When accuracy varies significantly between groups, "
        "it means the model performs better for some demographic groups than others, "
        "which is a form of algorithmic bias."
    ),

    # ── Dashboard / overview mocks ────────────────────────────────────

    "forensic_metrics_overview": (
        "The forensic metrics overview summarizes the full audit across all "
        "detection modules — data bias, model bias, proxy risk, counterfactual "
        "robustness, and stress tolerance. Review individual scores below to "
        "identify which areas need the most attention."
    ),
    "risk_level": (
        "The risk level is a qualitative label (Green / Yellow / Red) assigned "
        "based on the fairness score and gap analysis. Green means low risk, "
        "Yellow means moderate risk that should be monitored, and Red means "
        "significant bias requiring immediate remediation."
    ),

    # ── Summary / page-level mocks ───────────────────────────────────

    "explain_summary": (
        "The Manager Summary provides a high-level overview of the audit findings, "
        "highlighting the most critical bias signals detected, the groups most "
        "affected, and recommended next steps. It's designed for stakeholders who "
        "need the bottom line without diving into individual metrics."
    ),
    "event_timeline": (
        "The event timeline shows how the model's fairness score has changed over "
        "time. Each data point represents a monitoring check. A downward trend "
        "indicates the model is becoming less fair in production, which may require "
        "retraining or threshold adjustment."
    ),
    "version_delta": (
        "Version delta compares the current model's fairness and accuracy metrics "
        "against a previous version. Positive deltas mean improvement; negative "
        "deltas mean regression. Use this to evaluate whether a model update has "
        "actually improved fairness."
    ),
}

# ── In-memory cache ───────────────────────────────────────────────────
_explain_cache: dict[str, tuple[float, str]] = {}
CACHE_TTL = 300  # 5 minutes


def _cache_key(context: dict[str, Any]) -> str:
    extra = {k: v for k, v in context.items() if k != "_extra"}
    return f"{context.get('metric_name')}:{context.get('metric_value')}:{json.dumps(extra, sort_keys=True, default=str)}"


# ── Helpers ───────────────────────────────────────────────────────────

def _get_env(key: str, default: str = "") -> str:
    return os.getenv(key, default)


def _detect_provider() -> str:
    return _get_env("LLM_PROVIDER", "mock").lower().strip()


def _format_context(context: dict[str, Any]) -> str:
    parts: list[str] = []
    module = context.get("module", "unknown")
    metric = context.get("metric_name", "unknown")
    value = context.get("metric_value")

    parts.append(f"Module: {module}")
    parts.append(f"Metric: {metric}")
    if value is not None:
        parts.append(f"Value: {value}")
    domain = context.get("domain")
    if domain:
        parts.append(f"Domain: {domain}")

    extra = context.get("_extra", {})
    if isinstance(extra, dict):
        for k, v in extra.items():
            if v is not None:
                label = k.replace("_", " ").title()
                if isinstance(v, float):
                    parts.append(f"{label}: {v:.4f}")
                else:
                    parts.append(f"{label}: {v}")
    return "\n".join(parts)


# ── Provider implementations ──────────────────────────────────────────

async def _call_gemini(prompt: str, context: dict[str, Any]) -> str:
    import google.generativeai as genai

    genai.configure(api_key=_get_env("GEMINI_API_KEY"))
    model = genai.GenerativeModel(
        _get_env("LLM_MODEL", "gemini-2.0-flash"),
        system_instruction=SYSTEM_PROMPT,
    )
    resp = await model.generate_content_async(prompt)
    return resp.text


async def _call_openai(prompt: str, context: dict[str, Any]) -> str:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=_get_env("OPENAI_API_KEY"))
    resp = await client.chat.completions.create(
        model=_get_env("LLM_MODEL", "gpt-4o-mini"),
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
    )
    return resp.choices[0].message.content or ""


async def _call_ollama(prompt: str, context: dict[str, Any]) -> str:
    base_url = _get_env("OLLAMA_BASE_URL", "http://localhost:11434")
    model = _get_env("LLM_MODEL", "qwen2.5:7b")
    import httpx

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{base_url}/v1/chat/completions",
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                "stream": False,
            },
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


def _build_mock_explanation(prompt: str, context: dict[str, Any]) -> str:
    metric = context.get("metric_name", "")
    value = context.get("metric_value")
    template = _MOCK_EXPLANATIONS.get(metric)
    if template and value is not None:
        if metric == "flip_rate":
            return template.format(value=value * 100)
        if metric in ("demographic_parity_difference", "equal_opportunity_difference"):
            return template.format(value=value, delta=value * 100)
        return template
    if value is not None and template:
        return template
    if value is not None:
        return (
            f"The {metric.replace('_', ' ')} value is {value:.4f}. "
            f"This metric is used to evaluate fairness in the "
            f"{context.get('domain', 'specified')} domain."
        )
    return template if template else (
        f"The {metric.replace('_', ' ')} metric is used to evaluate fairness in the "
        f"{context.get('domain', 'specified')} domain."
    )


# ── Public API ────────────────────────────────────────────────────────

async def llm_explain(
    context: dict[str, Any], question: str | None = None
) -> str:
    provider = _detect_provider()

    # Check cache (skip for mock — already instant)
    if provider != "mock":
        key = _cache_key(context)
        if key in _explain_cache:
            ts, text = _explain_cache[key]
            if time.time() - ts < CACHE_TTL:
                logger.debug("LLM explain cache hit — metric=%s", context.get("metric_name"))
                return text

    formatted = _format_context(context)
    prompt = f"Context:\n{formatted}\n\n"
    if question:
        prompt += f"Question: {question}\nExplain this metric in simple terms."
    else:
        prompt += "Explain this metric in simple terms."

    logger.info(
        "LLM explain request — provider=%s, metric=%s",
        provider,
        context.get("metric_name"),
    )

    try:
        if provider == "gemini":
            explanation = await _call_gemini(prompt, context)
        elif provider == "openai":
            explanation = await _call_openai(prompt, context)
        elif provider == "ollama":
            explanation = await _call_ollama(prompt, context)
        else:
            explanation = _build_mock_explanation(prompt, context)
            return explanation
    except Exception as exc:
        logger.warning(
            "LLM provider %s failed for explain: %s. Falling back to mock explanation.",
            provider,
            exc,
            exc_info=True,
        )
        explanation = _build_mock_explanation(prompt, context)
        return explanation

    # Cache the response
    key = _cache_key(context)
    _explain_cache[key] = (time.time(), explanation)
    return explanation


async def llm_chat(
    context: dict[str, Any],
    question: str,
    history: list[dict[str, str]] | None = None,
) -> tuple[str, list[str]]:
    provider = _detect_provider()

    history = history or []
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for entry in history:
        messages.append(
            {"role": entry.get("role", "user"), "content": entry.get("content", "")}
        )
    formatted = _format_context(context)
    messages.append({
        "role": "user",
        "content": f"Current page context:\n{formatted}\n\nQuestion: {question}",
    })

    logger.info(
        "LLM chat request — provider=%s, history_len=%d",
        provider,
        len(history),
    )

    try:
        if provider == "gemini":
            import google.generativeai as genai

            genai.configure(api_key=_get_env("GEMINI_API_KEY"))
            model = genai.GenerativeModel(
                _get_env("LLM_MODEL", "gemini-2.0-flash"),
                system_instruction=SYSTEM_PROMPT,
            )
            chat = model.start_chat(history=history)
            resp = await chat.send_message_async(
                f"Current page context:\n{formatted}\n\nQuestion: {question}"
            )
            answer = resp.text
        elif provider == "openai":
            from openai import AsyncOpenAI

            client = AsyncOpenAI(api_key=_get_env("OPENAI_API_KEY"))
            resp = await client.chat.completions.create(
                model=_get_env("LLM_MODEL", "gpt-4o-mini"),
                messages=messages,
            )
            answer = resp.choices[0].message.content or ""
        elif provider == "ollama":
            base_url = _get_env("OLLAMA_BASE_URL", "http://localhost:11434")
            model = _get_env("LLM_MODEL", "qwen2.5:7b")
            import httpx

            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{base_url}/v1/chat/completions",
                    json={"model": model, "messages": messages, "stream": False},
                    timeout=60,
                )
                resp.raise_for_status()
                answer = resp.json()["choices"][0]["message"]["content"]
        else:
            answer = _build_mock_explanation(
                question,
                {**context, "metric_name": context.get("metric_name", "metric")},
            )
    except Exception as exc:
        logger.warning(
            "LLM provider %s failed for chat: %s. Falling back to mock explanation.",
            provider,
            exc,
            exc_info=True,
        )
        answer = _build_mock_explanation(
            question,
            {**context, "metric_name": context.get("metric_name", "metric")},
        )

    suggestions = [
        "What should I fix first?",
        "Which group is most affected?",
        "Is this result serious?",
    ]
    return answer, suggestions
