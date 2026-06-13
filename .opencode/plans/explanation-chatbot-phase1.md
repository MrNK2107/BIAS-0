# Phase 1: LLM Explanation Layer + Chatbot Assistant

## Goal
Build a provider-agnostic LLM layer (swappable via `.env`), then layer on: (A) inline `?` help buttons that explain any metric/chart, and (B) a contextual chatbot panel.

---

## Foundation: LLM Provider Adapter

### `backend/core/llm.py` (NEW)

Generic adapter that reads provider from `LLM_PROVIDER` env var and calls the corresponding API.

```python
# Interface
async def llm_explain(context: dict, question: str) -> str
async def llm_chat(context: dict, question: str, history: list) -> str
```

**Supported providers (env var → config):**
| `LLM_PROVIDER` | Required Env Vars | Behavior |
|---|---|---|
| `gemini` | `GEMINI_API_KEY` | `google-generativeai` SDK, `gemini-2.0-flash` model |
| `openai` | `OPENAI_API_KEY` | `openai` SDK, `gpt-4o-mini` model |
| `ollama` | `OLLAMA_BASE_URL` (default `http://localhost:11434`) | `httpx` POST to `/v1/chat/completions`, model from `LLM_MODEL` (default `llama3`) |
| `mock` | (none) | Returns template-based responses for dev/testing without API keys |

**System prompt:** A shared system prompt is injected automatically — it describes the platform, the available metrics (demographic parity, equal opportunity, SHAP, flip rate, stress scores, etc.), and instructs the LLM to only explain deterministic pipeline outputs, never guess bias.

### `backend/requirements.txt` — Add `google-generativeai`, `openai` (both optional, only imported when their provider is active)

### `.env.example` — Add:
```
LLM_PROVIDER=mock
LLM_MODEL=gemini-2.0-flash
GEMINI_API_KEY=
OPENAI_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434
```

---

## Priority 2: Explanation Layer (Tier 2)

### Backend: `POST /api/explain/metric`

**Request:**
```json
{
  "project_id": "...",
  "module": "model_bias",
  "metric_name": "demographic_parity_difference",
  "metric_value": 0.31,
  "context": {
    "fairness_score": 62,
    "sensitive_columns": ["gender"],
    "groups": {"male": 0.12, "female": 0.43},
    "domain": "loan"
  }
}
```

**Response:**
```json
{
  "explanation": "Demographic parity difference measures whether... A value of 0.31 means...",
  "provider": "gemini"
}
```

The endpoint calls `llm_explain()` with a structured prompt built from the context. Results are **not cached** (explanation is ephemeral, cheap, and re-generated each time for freshness).

### Backend: `POST /api/explain/summary`

Takes full pipeline results, returns an executive summary paragraph. Called once on the results page.

### Backend: Register new router in `main.py`

### Frontend: `frontend/src/components/HelpButton.tsx` (NEW)

```tsx
interface HelpButtonProps {
  module: string;
  metricName: string;
  metricValue?: number;
  context?: Record<string, unknown>;
}
```

- Renders a small `?` circle (16px, copper border, subtle pulse on hover)
- On click: POST to `/api/explain/metric`, shows result in a floating tooltip/popover below the button
- States: idle → loading (spinner) → showing (markdown-rendered text) → error (retry)
- Popover auto-closes on click-away

### Frontend: Integrate `HelpButton` into pages

| Page | Component | Metrics to annotate |
|---|---|---|
| `Step3DataAudit` | Group stats table, risk badge, missing data section | `group_stats`, `risk_level` |
| `Step4ModelBias` | Fairness score display, DP/EO gaps, TPR/FPR per group | `fairness_score`, `demographic_parity_difference`, `equal_opportunity_difference` |
| `Step5Explanations` | SHAP waterfall | `shap_values`, `feature_importance` |
| `Step6Counterfactual` | Flip rate card | `flip_rate` |
| `Step7StressTest` | Fragility rating, scenario tables | `overall_fragility`, `scenario_accuracy` |
| `Step8Sandbox` | Before/after comparison | `fairness_delta`, `accuracy_delta` |
| `Step9Monitoring` | Drift scores | `data_drift_score`, `prediction_drift_score` |

---

## Priority 3: Chatbot Assistant (Tier 3)

### Backend: `POST /api/chat/query`

**Request:**
```json
{
  "project_id": "...",
  "question": "Why is this demographic parity score bad?",
  "context": {
    "page": "model_bias",
    "metric_name": "demographic_parity_difference",
    "metric_value": 0.31,
    "groups": {...},
    "latest_results": {...}
  },
  "history": [
    {"role": "user", "content": "What does fairness score mean?"},
    {"role": "assistant", "content": "The fairness score is..."}
  ]
}
```

**Response:**
```json
{
  "answer": "A demographic parity difference of 0.31 means...",
  "suggestions": ["What should I fix first?", "Which group is most affected?"]
}
```

The endpoint:
1. Builds the full prompt from `context` + `history`
2. Calls `llm_chat()` with the conversation history
3. Returns the answer + 2-3 follow-up question suggestions

Session management is **stateless on the backend** — the client sends the full history each time (`history` array). The backend only uses the context to ground the answer.

### Frontend: `frontend/src/components/chatbot/ChatbotContext.tsx` (NEW)

React context that manages:
- `messages: Message[]` — current session's conversation
- `isOpen: boolean` — open/close state
- `context: ChatContext` — current page's context (auto-updated via a `useEffect` that watches the route/page)
- `sendMessage(question: string) -> Promise<string>` — calls `/api/chat/query`
- `clearSession()` — reset messages
- Session memory is stored in React state (lost on page refresh → intentional, lightweight)

```tsx
interface ChatContextValue {
  messages: Message[];
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  sendMessage: (question: string) => Promise<void>;
  clearSession: () => void;
  focusedSection: string | null;  // set by ? button clicks
}
```

### Frontend: `frontend/src/components/chatbot/ChatbotPanel.tsx` (NEW)

Right-side slide-out panel:
- Animated slide-in from right (framer-motion, 280px wide)
- Header: "Fairness Assistant" + close button
- Message list: user messages (right-aligned) and assistant messages (left-aligned, markdown-rendered)
- Follow-up suggestion chips below each assistant message
- Input bar: text input + send button, disabled while loading
- Empty state: "Ask me about any metric or finding on this page."
- Scrolls to bottom on new message

### Frontend: `frontend/src/components/chatbot/ChatButton.tsx` (NEW)

Floating action button:
- Positioned bottom-right, fixed (z-index high)
- Copper-colored circular button with `MessageCircle` icon
- Badge count if unread is non-zero
- Pulse animation if there's a `focusedSection` (prompting user to click `?`)

### Frontend: Integrate into `WorkflowShell`

- Add `ChatbotProvider` wrapping the app
- Render `ChatButton` and `ChatbotPanel` at the `WorkflowShell` level (visible on all pages)
- Each page registers its context via `useChatbotContext().setContext(...)` in a `useEffect`

### Frontend: `?` button → Chatbot integration

When a `HelpButton` is clicked:
1. The tooltip/popover shows a brief explanation
2. A "Ask more in chat" link/button appears at the bottom of the popover
3. Clicking it opens the chatbot panel and pre-fills context with the specific metric
4. The chatbot's `focusedSection` is set to the metric name
5. User can follow up with questions

---

## Files Changed/Added

### Backend (5 files)
| File | Action |
|---|---|
| `backend/core/llm.py` | NEW — provider-agnostic LLM adapter |
| `backend/routers/explain.py` | NEW — `/api/explain/metric`, `/api/explain/summary` |
| `backend/routers/chat.py` | NEW — `/api/chat/query` |
| `backend/main.py` | Register `explain` and `chat` routers |
| `backend/requirements.txt` | Add `google-generativeai`, `openai` |

### Frontend (~10 files)
| File | Action |
|---|---|
| `frontend/src/components/HelpButton.tsx` | NEW — `?` button with popover |
| `frontend/src/components/chatbot/ChatbotContext.tsx` | NEW — chat state management |
| `frontend/src/components/chatbot/ChatbotPanel.tsx` | NEW — slide-out panel |
| `frontend/src/components/chatbot/ChatButton.tsx` | NEW — floating FAB |
| `frontend/src/components/WorkflowShell.tsx` | Add ChatButton + ChatbotPanel |
| `frontend/src/pages/workflow/Step3DataAudit.tsx` | Add `?` to relevant metrics |
| `frontend/src/pages/workflow/Step4ModelBias.tsx` | Add `?` to relevant metrics |
| `frontend/src/pages/workflow/Step5Explanations.tsx` | Add `?` to SHAP charts |
| `frontend/src/pages/workflow/Step6Counterfactual.tsx` | Add `?` to flip rate |
| `frontend/src/pages/workflow/Step7StressTest.tsx` | Add `?` to fragility/accuracy |

---

## Design Decisions

1. **Stateless backend** — Chat history is sent by the client on each request. This avoids server-side session storage, scales horizontally, and keeps the backend simple. The LLM adapter always reconstructs the conversation from the provided history array.

2. **System prompt is hardcoded** — The LLM's behavior (only explain, never guess bias) is encoded in the system prompt, not in application logic. This keeps the code clean and the prompt auditable.

3. **`mock` provider** — Essential for development. Returns plausible-sounding template answers without any API key or dependency. The provider is activated by `LLM_PROVIDER=mock` (the default in `.env.example`).

4. **`?` button shows inline popover, not just opens chatbot** — Two-tier: a quick explanation inline for immediate understanding, plus a "chat about this" link for deeper follow-up. This avoids forcing users into a full chat for every simple question.

5. **Chatbot is global, not page-specific** — Rendered once in `WorkflowShell`, visible from any page. Context is passed via a React context, not via route params. This keeps the component structure clean and avoids re-mounting the chatbot on navigation.

---

## Acceptance Criteria

- [ ] `LLM_PROVIDER=mock` works without any API keys — returns sensible explanations
- [ ] `LLM_PROVIDER=gemini` with valid `GEMINI_API_KEY` returns real Gemini responses
- [ ] `LLM_PROVIDER=openai` with valid `OPENAI_API_KEY` returns real OpenAI responses
- [ ] `LLM_PROVIDER=ollama` with running local Ollama instance returns local model responses
- [ ] `?` button appears next to all major metrics on Step3, Step4, Step5, Step6, Step7
- [ ] `?` button shows a loading spinner, then a formatted explanation popover
- [ ] Popover has "Ask more in chat" link that opens the chatbot pre-contextualized
- [ ] Chatbot panel slides in from the right, shows conversation history, accepts input
- [ ] Chatbot shows 2-3 suggestion chips after each assistant response
- [ ] Chatbot context auto-updates when navigating between pages
- [ ] TypeScript check passes, production build succeeds
- [ ] Backend tests pass
