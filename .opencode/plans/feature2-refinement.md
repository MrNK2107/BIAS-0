# Feature #2 Refinement: LLM Explanation Layer

## Problem
1. Multiple inline popovers on the same page overlap and feel cramped.
2. No cache — repeated LLM calls for the same metric.
3. Prompt is bare JSON — missing structured metric context.
4. Summary endpoint exists but isn't wired to any page.
5. Loading UX is just text ("Loading explanation...").

## Changes

### Backend

#### `core/llm.py` — Cache layer + richer prompt

**Cache (in-memory dict, no new deps):**
```python
_explain_cache: dict[str, tuple[float, str]] = {}  # key -> (timestamp, text)
CACHE_TTL = 300  # 5 minutes

def _cache_key(context: dict) -> str:
    return f"{context.get('metric_name')}:{context.get('metric_value')}:{json.dumps(context.get('_extra', {}), sort_keys=True)}"

# In llm_explain(), before calling the provider:
key = _cache_key(context)
if key in _explain_cache:
    ts, text = _explain_cache[key]
    if time.time() - ts < CACHE_TTL:
        return text

# After getting response:
_explain_cache[key] = (time.time(), explanation)
```

Cache is skipped when `LLM_PROVIDER=mock` (already instant, no need).

**Richer prompt formatting:**
Replace the raw `json.dumps(context)` with a structured text block:

```python
def _format_context(context: dict) -> str:
    parts = [f"Module: {context.get('module', 'unknown')}"]
    parts.append(f"Metric: {context.get('metric_name', 'unknown')}")
    if context.get('metric_value') is not None:
        parts.append(f"Value: {context['metric_value']}")
    if context.get('domain'):
        parts.append(f"Domain: {context['domain']}")
    extra = context.get('_extra', {})
    for k, v in extra.items():
        if v is not None:
            parts.append(f"{k.replace('_', ' ').title()}: {v}")
    return "\n".join(parts)
```

The frontend HelpButton already passes context — the backend now formats it properly instead of dumping raw JSON.

#### `core/llm.py` — Import `time`

#### File summary: `llm.py` gets cache dict + `_format_context()` + `time` import. `llm_chat` is unchanged (chatbot is feature 3).

---

### Frontend

#### `components/ExplainContext.tsx` (NEW)

```tsx
interface ExplainContextValue {
  isOpen: boolean;
  module: string | null;
  metricName: string | null;
  metricValue: number | null | undefined;
  explanation: string | null;
  loading: boolean;
  open: (module: string, metricName: string, metricValue?: number, context?: Record<string, unknown>) => void;
  close: () => void;
}
```

The `open()` function:
1. Sets `loading=true`, `module/metricName/metricValue`, stores additional context
2. POSTs to `/api/explain/metric`
3. Sets `explanation` with the response, `loading=false`

If the same metric+value is clicked again while cached, the backend returns immediately so the frontend just shows the cached response.

#### `components/ExplainPanel.tsx` (NEW)

Right-side drawer that slides in from the right:

```tsx
export default function ExplainPanel() {
  const { isOpen, close, module, metricName, metricValue, explanation, loading } = useExplain();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          // Same animation as ChatbotPanel
        >
          {/* Header */}
          <div>metricName.replace(/_/g, ' ') + close button</div>

          {/* Body */}
          {loading ? <Skeleton /> : <FormattedText>{explanation}</FormattedText>}

          {/* Footer */}
          <button onClick={() => { close(); openChatbot(metricName, metricValue); }}>
            Ask the chatbot about this →
          </button>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
```

**Skeleton component:** 3-4 pulsing lines (framer-motion opacity animation, same color as existing skeletons in the app).

**FormattedText:** Splits explanation by double-newlines into paragraphs, wraps in `<p>` tags. Bold numbers/metric names (simple regex for `\b\d+\b` and `metric_name`).

#### `components/HelpButton.tsx` — Refactor

Remove all popover logic (open state, explanation state, loading, popover div). Simplifies to:

```tsx
export default function HelpButton({ module, metricName, metricValue, context }: HelpButtonProps) {
  const { open } = useExplain();

  return (
    <button
      type="button"
      onClick={() => open(module, metricName, metricValue, context)}
      // ...styling stays the same (copper circle ?)
    >
      ?
    </button>
  );
}
```

No more `onChatOpen` prop, no more `fetchExplanation`, no more popover. Just a trigger button.

#### `main.tsx` — Add wrapper

```tsx
<ExplainProvider>
  <ChatbotProvider>
    <App />
  </ChatbotProvider>
</ExplainProvider>
```

#### `WorkflowShell.tsx` — Add ExplainPanel

```tsx
<ExplainPanel />
<ChatButton />
<ChatbotPanel />
```

The ExplainPanel has a higher z-index than ChatbotPanel (1001 vs 1000) so they don't conflict.

#### Pages (Step3-7) — Minor updates

Each page that uses `<HelpButton>` needs `context` updated to pass more data. The `context` prop is forwarded through HelpButton → ExplainContext → `/api/explain/metric` → `llm_explain()`:

| Page | Current context | Updated context |
|---|---|---|
| Step3 (risk_level) | `{risk_level, domain}` | `{domain, _extra: {risk_level, risk_reason}}` |
| Step3 (fairness_score) | `{risk_level, domain}` | `{domain, _extra: {risk_level}}` |
| Step4 (fairness_score) | `{dp_diff, eo_diff}` | `{_extra: {demographic_parity_difference, equal_opportunity_difference, fairness_score}}` |
| Step5 (explain_summary) | `{domain}` | `{domain}` |
| Step6 (flip_rate) | none | `{_extra: {sensitive_col}}` |
| Step7 (fragility) | none | none |

The `_extra` key is used by `_format_context()` to render key-value pairs in the prompt. The `domain` stays at the top level for direct access.

### Files changed

| File | Action |
|---|---|
| `backend/core/llm.py` | Add cache + `_format_context()` + `time` import |
| `frontend/src/components/ExplainContext.tsx` | NEW |
| `frontend/src/components/ExplainPanel.tsx` | NEW |
| `frontend/src/components/HelpButton.tsx` | Rewrite — remove popover, use ExplainContext |
| `frontend/src/main.tsx` | Add `<ExplainProvider>` wrapper |
| `frontend/src/components/WorkflowShell.tsx` | Add `<ExplainPanel />` |
| `frontend/src/pages/workflow/Step3DataAudit.tsx` | Update `context` prop |
| `frontend/src/pages/workflow/Step4ModelBias.tsx` | Update `context` prop |
| `frontend/src/pages/workflow/Step6Counterfactual.tsx` | Update `context` prop |

### Files untouched

- `backend/routers/explain.py` — unchanged (cache is transparent)
- `backend/routers/chat.py` — unchanged (chatbot is feature 3)
- `backend/main.py` — unchanged
- `Step5Explanations.tsx`, `Step7StressTest.tsx` — HelpButton stays, context unchanged
- `frontend/src/components/chatbot/*` — unchanged
