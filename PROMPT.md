# PROMPT.md — Unbiased AI Decision Platform
## AI Agentic Development Prompt (for Cursor / VS Code Copilot / Windsurf / Aider)

---

## 0. How to Use This File

This file is the **single source of truth** for the AI coding agent building this project.
- Read this file top‑to‑bottom before writing any code.
- Each section is a **task block**. Complete them in order unless told otherwise.
- Every task block specifies: what to build, what files to create, what libraries to use, and what the acceptance criterion is.
- When a task is done, move to the next one. Do **not** skip ahead.

---

## 1. Project Overview

**Project name:** Unbiased AI Decision  
**One‑line pitch:** A fairness‑guardian platform that audits datasets and ML models for bias, simulates fixes, and monitors fairness after deployment.

**Core user story:**
> A bank data scientist uploads a loan dataset + trained model. The platform tells them *where* bias hides, *how bad* it is, suggests *concrete fixes*, simulates each fix in a sandbox, and keeps watching the deployed model afterward.

**Target domains:** Loan approval · Hiring · Insurance · Healthcare prioritization  
**Tech stack:** Python (FastAPI) backend · React (Vite + TypeScript) frontend · SQLite (dev) / PostgreSQL (prod)

---

## 2. Repository Structure

Bootstrap this exact folder structure before writing any feature code:

```
unbiased-ai/
├── backend/
│   ├── main.py                  # FastAPI app entrypoint
│   ├── requirements.txt
│   ├── core/
│   │   ├── data_audit.py        # Step 2 logic
│   │   ├── feature_intelligence.py  # Step 3 logic
│   │   ├── model_bias.py        # Step 4 logic
│   │   ├── explainability.py    # Step 5 logic
│   │   ├── counterfactual.py    # Step 6 logic
│   │   ├── stress_test.py       # Step 7 logic
│   │   ├── auto_fix.py          # Step 8 logic
│   │   ├── sandbox.py           # Step 8B logic
│   │   └── monitoring.py        # Step 9 logic
│   ├── models/
│   │   ├── schemas.py           # Pydantic request/response models
│   │   └── db.py                # SQLAlchemy models + DB init
│   ├── routers/
│   │   ├── upload.py
│   │   ├── audit.py
│   │   ├── bias.py
│   │   ├── fixes.py
│   │   ├── sandbox.py
│   │   └── monitoring.py
│   ├── utils/
│   │   ├── model_loader.py      # Load .pkl / ONNX / API models
│   │   └── synthetic_data.py    # Generate demo datasets
│   └── tests/
│       └── test_core.py
├── frontend/
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── package.json
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/
│       │   └── client.ts        # Axios/fetch wrappers
│       ├── pages/
│       │   ├── Dashboard.tsx
│       │   ├── Upload.tsx
│       │   ├── AuditReport.tsx
│       │   ├── BiasReport.tsx
│       │   ├── Counterfactual.tsx
│       │   ├── StressTest.tsx
│       │   ├── Sandbox.tsx
│       │   └── Monitoring.tsx
│       ├── components/
│       │   ├── ScoreGauge.tsx
│       │   ├── FairnessTable.tsx
│       │   ├── ProxyRiskCard.tsx
│       │   ├── CounterfactualFlip.tsx
│       │   ├── SandboxComparison.tsx
│       │   ├── MonitoringChart.tsx
│       │   └── Navbar.tsx
│       └── styles/
│           └── globals.css
├── data/
│   ├── demo_loan.csv            # Synthetic loan dataset (generated)
│   └── demo_hiring.csv          # Synthetic hiring dataset (generated)
├── notebooks/
│   └── exploration.ipynb        # Optional: dev/debug notebook
├── context.md                   # Project background (already written)
├── PROMPT.md                    # This file
└── README.md
```

---

## 3. Backend — Task Blocks

### TASK B-0: Project Bootstrap

**Do this first.**

1. Create `backend/requirements.txt` with:
   ```
   fastapi>=0.111
   uvicorn[standard]
   pandas>=2.0
   numpy
   scikit-learn>=1.4
   shap
   fairlearn
   sqlalchemy
   alembic
   pydantic>=2.0
   python-multipart
   joblib
   scipy
   matplotlib
   seaborn
   httpx
   python-dotenv
   ```

2. Create `backend/main.py`:
   - FastAPI app with CORS enabled for `http://localhost:5173`
   - Mount all routers from `backend/routers/`
   - Include a `/health` GET endpoint returning `{"status": "ok"}`

3. Create `backend/models/db.py`:
   - SQLAlchemy engine pointing to `sqlite:///./unbiased_ai.db` (dev)
   - Tables: `Project`, `AuditRun`, `MonitoringEvent`
   - `Project`: id, name, domain, created_at, sensitive_columns (JSON), target_column
   - `AuditRun`: id, project_id, timestamp, fairness_score, risk_level, results_json
   - `MonitoringEvent`: id, project_id, timestamp, fairness_score, alert_triggered, note

**Acceptance:** `uvicorn main:app --reload` starts without errors; `/health` returns 200.

---

### TASK B-1: Synthetic Data Generator

**File:** `backend/utils/synthetic_data.py`

Generate two synthetic datasets that mimic real‑world bias patterns:

**Dataset A — Loan Applications (`demo_loan.csv`)**
- 5,000 rows
- Columns: `age`, `gender` (male/female/non-binary), `caste` (general/obc/sc/st), `income`, `zip_code`, `education` (graduate/postgraduate/high_school), `loan_amount`, `credit_score`, `approved` (0/1)
- Bias baked in:
  - Women approved at 35% rate vs. men at 72%
  - SC/ST approved at 28% rate vs. general at 75%
  - `zip_code` is correlated with caste (proxy leak)
  - `income` is correlated with gender (another proxy)
- 12% missing values in `credit_score`

**Dataset B — Hiring (`demo_hiring.csv`)**
- 3,000 rows
- Columns: `age`, `gender`, `ethnicity`, `years_experience`, `university_tier` (1/2/3), `skills_score`, `interview_score`, `hired` (0/1)
- Bias: Gender and `university_tier` correlated; hiring rate differs by 40% across gender groups

**Expose as a CLI script:** `python utils/synthetic_data.py` writes both CSVs to `../../data/`

**Acceptance:** Both CSV files are valid, loadable with `pd.read_csv`, and contain the described bias patterns (verifiable with a `.groupby` check).

---

### TASK B-2: Data Audit Engine

**File:** `backend/core/data_audit.py`

**Input:** pandas DataFrame, list of sensitive columns, target column name  
**Output:** Python dict (serializable to JSON)

Implement function `run_data_audit(df, sensitive_cols, target_col) -> dict`:

1. **Group stats** — for each sensitive column:
   - Value counts (e.g., gender: male=3200, female=1800)
   - Approval/positive rate per group
   - Missing value rate per group

2. **Class imbalance** — overall label distribution (e.g., `{"approved": 0.55, "rejected": 0.45}`)

3. **Under-representation flags** — if any group is < 20% of total, flag it as `"under_represented": true`

4. **Risk level** — overall data-bias risk:
   - Green if max group-approval-rate gap < 15%
   - Yellow if gap is 15–40%
   - Red if gap > 40%

5. **Missing data summary** — per column, % missing

Return structure:
```json
{
  "group_stats": { "gender": { "male": {...}, "female": {...} } },
  "class_distribution": { "approved": 0.55, "rejected": 0.45 },
  "under_represented_groups": ["non-binary"],
  "missing_data": { "credit_score": 0.12 },
  "risk_level": "Red",
  "risk_reason": "Approval rate gap between gender groups is 37%"
}
```

**Router:** `backend/routers/audit.py`  
- `POST /audit/data` — accepts `project_id`, `file` (CSV upload), `sensitive_cols`, `target_col`
- Saves result to `AuditRun` table
- Returns the dict above

**Acceptance:** Upload `demo_loan.csv`, get back `risk_level: "Red"` and group stats showing gender gap.

---

### TASK B-3: Feature Intelligence Layer (Proxy Detection)

**File:** `backend/core/feature_intelligence.py`

**Input:** DataFrame, sensitive columns  
**Output:** dict

Implement `detect_proxy_features(df, sensitive_cols) -> dict`:

1. **Correlation scan** — for each non‑sensitive feature, compute:
   - Pearson correlation with any numeric-encoded sensitive column
   - Cramér's V for categorical pairs

2. **Proxy score** — weighted average of correlation magnitudes, 0–1

3. **Top 5 proxy-risk features** — sorted by proxy score descending

4. **Warnings** — if proxy_score > 0.4, generate a human-readable warning string

Return structure:
```json
{
  "proxy_features": [
    {
      "feature": "zip_code",
      "proxy_score": 0.78,
      "correlated_with": "caste",
      "correlation": 0.76,
      "warning": "zip_code is strongly correlated with caste (r=0.76). Consider removing or transforming."
    }
  ],
  "safe_features": ["loan_amount", "credit_score"]
}
```

**Router:** Add `POST /audit/proxy` to `audit.py`

**Acceptance:** On `demo_loan.csv`, `zip_code` and `income` should appear in proxy_features for caste/gender respectively.

---

### TASK B-4: Model Bias Analysis Engine

**File:** `backend/core/model_bias.py`

**Input:** DataFrame, sensitive columns, target column, optional model path  
**Output:** dict

Implement `run_model_bias_analysis(df, sensitive_cols, target_col, model_path=None) -> dict`:

1. **Model loading:**
   - If `model_path` is provided: load via `joblib.load()`
   - Otherwise: train a `RandomForestClassifier(n_estimators=100)` on 80% of data

2. **Predictions:** run on 20% hold-out test set

3. **Fairness metrics per group** using `fairlearn.metrics`:
   - Demographic parity difference
   - Equal opportunity difference (TPR gap)
   - False positive rate gap
   - Accuracy per group

4. **Fairness score (0–100):**
   - Start at 100
   - Subtract 30 × demographic_parity_difference
   - Subtract 25 × equal_opportunity_difference
   - Subtract 20 × fpr_gap
   - Clamp to [0, 100]
   - Invert: score = 100 − raw_penalty (higher = fairer)

Return structure:
```json
{
  "overall_accuracy": 0.87,
  "fairness_score": 42,
  "risk_level": "Red",
  "metrics": {
    "demographic_parity_difference": 0.38,
    "equal_opportunity_difference": 0.29,
    "fpr_gap": 0.21
  },
  "group_performance": {
    "gender": {
      "male":   { "approval_rate": 0.80, "tpr": 0.85, "fpr": 0.12, "accuracy": 0.90 },
      "female": { "approval_rate": 0.31, "tpr": 0.56, "fpr": 0.08, "accuracy": 0.84 }
    }
  },
  "model_used": "user_provided | built_in_rf"
}
```

**Router:** `POST /bias/model` in `backend/routers/bias.py`

**Acceptance:** `demo_loan.csv` should produce fairness_score < 50 and demographic_parity_difference > 0.3.

---

### TASK B-5: Explainability Engine

**File:** `backend/core/explainability.py`

**Input:** DataFrame, model, sensitive columns, n_samples=5 (flagged cases)  
**Output:** list of explanations

Implement `explain_flagged_decisions(df, model, sensitive_cols, target_col, n_samples=5) -> list`:

1. **Find flagged cases** — pairs where:
   - Person A and Person B have almost identical features EXCEPT for a sensitive attribute
   - They received different decisions
   - Use: randomly sample test records with different sensitive-attribute values but similar other features (nearest-neighbor style)

2. **SHAP values:**
   - Use `shap.TreeExplainer` for tree models, `shap.LinearExplainer` for linear
   - Get top 3 features by |SHAP value| for each flagged record

3. **Proxy flag** — if any of the top 3 features is a known proxy (from feature intelligence), flag it

Return (list of dicts):
```json
[
  {
    "record_id": 42,
    "decision": "rejected",
    "sensitive_attribute": "gender=female",
    "top_reasons": [
      { "feature": "zip_code", "shap_value": -0.31, "is_proxy_risk": true },
      { "feature": "income",   "shap_value": -0.18, "is_proxy_risk": true },
      { "feature": "credit_score", "shap_value": -0.12, "is_proxy_risk": false }
    ],
    "human_explanation": "This application was rejected primarily due to ZIP code and income, both of which are correlated with gender in this dataset."
  }
]
```

**Router:** `POST /bias/explain` in `bias.py`

---

### TASK B-6: Counterfactual Testing Engine

**File:** `backend/core/counterfactual.py`

**Input:** DataFrame, model, sensitive columns, target column  
**Output:** dict

Implement `run_counterfactual_test(df, model, sensitive_col, target_col) -> dict`:

1. For each unique value of `sensitive_col` (e.g., male/female):
   - For each record where the group is "male": create a copy where gender = "female" (keeping everything else identical)
   - Run both originals and flipped copies through the model
   - Count how many decisions **flipped**

2. Compute:
   - `flip_rate`: % of records where decision changed
   - `flip_breakdown`: which group-to-group flips happened most

3. Counterfactual fairness score:
   - Score = 100 × (1 − flip_rate)

Return:
```json
{
  "sensitive_col": "gender",
  "flip_rate": 0.31,
  "counterfactual_fairness_score": 69,
  "flip_breakdown": {
    "male_to_female": { "flips": 310, "total": 1000, "rate": 0.31 },
    "female_to_male": { "flips": 290, "total": 1000, "rate": 0.29 }
  },
  "interpretation": "In 31% of cases, changing gender alone flips the model decision — indicating the model is not counterfactually fair with respect to gender."
}
```

**Router:** `POST /bias/counterfactual` in `bias.py`

---

### TASK B-7: Bias Stress Testing Module

**File:** `backend/core/stress_test.py`

**Input:** DataFrame, model, sensitive columns, target column  
**Output:** dict

Implement `run_stress_tests(df, model, sensitive_cols, target_col) -> dict`:

Run 3 stress scenarios automatically:

1. **Under-sampling:** Remove 70% of the minority group randomly from test data. Re-run fairness metrics.
2. **Label noise:** Add 10% random noise to the target column for the minority group. Re-train (or re-evaluate). Re-run metrics.
3. **Distribution shift:** Change income distribution so that the minority group's income is shifted down by 20%. Re-evaluate.

For each scenario, record:
- Fairness score before and after
- Accuracy before and after
- Whether fairness dropped more than 20 points (flag as "fragile")

Return:
```json
{
  "baseline": { "fairness_score": 42, "accuracy": 0.87 },
  "scenarios": [
    {
      "name": "Under-sampling minority group (70%)",
      "fairness_score": 28,
      "accuracy": 0.85,
      "fairness_drop": 14,
      "fragile": false,
      "note": "Fairness dropped 14 points under minority under-sampling."
    },
    {
      "name": "Label noise on minority group (10%)",
      "fairness_score": 19,
      "accuracy": 0.83,
      "fairness_drop": 23,
      "fragile": true,
      "note": "Fairness is fragile to label noise — dropped 23 points."
    }
  ],
  "overall_fragility": "High"
}
```

**Router:** `POST /bias/stress` in `bias.py`

---

### TASK B-8: Auto-Fix Recommendation Engine + Sandbox Simulation

**Files:** `backend/core/auto_fix.py`, `backend/core/sandbox.py`

#### Part A — Auto-Fix Recommendations

Implement `generate_fix_recommendations(audit_result, proxy_result, bias_result) -> list`:

Classify the bias into types and suggest targeted fixes:

| Bias Type | Detection Signal | Fixes Suggested |
|---|---|---|
| Proxy leakage | proxy_score > 0.4 for any feature | Remove or PCA-transform the feature |
| Representation bias | under_represented_groups not empty | Re-sample with SMOTE or warn to collect more data |
| Label bias | approval rate gap > 40% | Warn that historical labels may be biased; suggest label audit |
| Threshold bias | fpr_gap > 0.2 | Suggest per-group threshold optimization |

Return list of fix objects:
```json
[
  {
    "fix_id": "remove_zip_code",
    "fix_type": "feature_level",
    "bias_type": "proxy_leakage",
    "description": "Remove zip_code from the feature set",
    "rationale": "zip_code has proxy score 0.78 with caste — removing it may reduce indirect discrimination.",
    "estimated_impact": "Fairness score may improve by ~20 points; accuracy may drop by ~2%."
  },
  {
    "fix_id": "resample_minority",
    "fix_type": "data_level",
    "bias_type": "representation_bias",
    "description": "Oversample the under-represented group using SMOTE",
    "rationale": "SC/ST group is only 8% of approvals; resampling can reduce model bias.",
    "estimated_impact": "Fairness score may improve by ~15 points."
  }
]
```

#### Part B — Sandbox Simulation Engine

**File:** `backend/core/sandbox.py`

Implement `run_sandbox_simulation(df, sensitive_cols, target_col, fixes_to_apply: list) -> dict`:

Always include "original" as scenario 0.

For each fix in `fixes_to_apply`:
1. Apply the transformation to the DataFrame or model training
2. Train a new simple model (RandomForest) on the modified data
3. Compute fairness_score and accuracy on held-out test set

Return:
```json
{
  "scenarios": [
    { "name": "Original",              "accuracy": 0.87, "fairness_score": 42, "risk_level": "Red",    "notes": "Baseline" },
    { "name": "Remove zip_code",       "accuracy": 0.85, "fairness_score": 63, "risk_level": "Yellow", "notes": "Best balance" },
    { "name": "Resample minority",     "accuracy": 0.84, "fairness_score": 71, "risk_level": "Yellow", "notes": "Higher fairness" },
    { "name": "Remove + Resample",     "accuracy": 0.82, "fairness_score": 79, "risk_level": "Green",  "notes": "Highest fairness, -5% accuracy" }
  ],
  "recommendation": "Remove zip_code offers the best accuracy-fairness trade-off."
}
```

**Routers:**
- `POST /fixes/recommend` in `backend/routers/fixes.py`
- `POST /fixes/sandbox` in `backend/routers/sandbox.py`

---

### TASK B-9: Real-Time Monitoring System

**File:** `backend/core/monitoring.py`

**Purpose:** Simulate ongoing fairness tracking after deployment.

Implement:
- `log_monitoring_event(project_id, fairness_score, db_session)` — writes to `MonitoringEvent` table
- `get_monitoring_history(project_id, db_session) -> list` — returns last 30 events
- `check_alert_condition(fairness_score, baseline_score) -> dict` — returns alert if score dropped > 15 points from baseline

**Router:** `backend/routers/monitoring.py`
- `GET /monitoring/{project_id}` — return history + current trend
- `POST /monitoring/{project_id}/simulate` — generate 30 synthetic monitoring events (for demo)

Return for history endpoint:
```json
{
  "project_id": 1,
  "events": [
    { "timestamp": "2025-04-01T10:00:00", "fairness_score": 65, "alert": false },
    { "timestamp": "2025-04-15T10:00:00", "fairness_score": 48, "alert": true, "note": "Score dropped 17 points from baseline." }
  ],
  "current_risk_level": "Yellow",
  "trend": "declining"
}
```

---

## 4. Frontend — Task Blocks

### TASK F-0: Frontend Bootstrap

1. `cd frontend && npm create vite@latest . -- --template react-ts`
2. Install: `npm install axios recharts react-router-dom @radix-ui/react-progress lucide-react`
3. Configure `vite.config.ts` to proxy `/api` → `http://localhost:8000`
4. Set up `src/api/client.ts` — base Axios instance with `baseURL: "/api"`

**Design system (apply globally in `globals.css`):**

```css
:root {
  --bg: #0d0f14;
  --surface: #161b24;
  --surface-raised: #1e2533;
  --border: #2a3347;
  --accent: #4f8ef7;
  --accent-glow: rgba(79, 142, 247, 0.15);
  --green: #22c55e;
  --yellow: #f59e0b;
  --red: #ef4444;
  --text-primary: #f0f4ff;
  --text-secondary: #8b9ab3;
  --font-display: 'DM Serif Display', serif;
  --font-body: 'IBM Plex Mono', monospace;
}
```

Import from Google Fonts: `DM Serif Display` (display) + `IBM Plex Mono` (body/data).

Theme: dark, technical, data-forward. Think Bloomberg terminal meets modern data product.

---

### TASK F-1: Navbar + Routing

**File:** `src/components/Navbar.tsx`

Sidebar navigation (fixed left, 240px wide) with links to:
- Dashboard (home icon)
- Upload (upload icon)
- Data Audit (bar chart)
- Bias Analysis (scale icon)
- Counterfactual (shuffle icon)
- Stress Test (zap icon)
- Sandbox (beaker icon)
- Monitoring (activity icon)

Active route highlighted with `--accent` color + left border.

Set up `react-router-dom` routes in `App.tsx` for all 8 pages.

---

### TASK F-2: Upload Page

**File:** `src/pages/Upload.tsx`

UI elements:
1. **CSV drag-and-drop zone** — accepts `.csv`, shows filename and row count preview on drop
2. **Sensitive columns selector** — multi-select dropdown, auto-populated from CSV headers
3. **Target column selector** — single-select dropdown from CSV headers
4. **Model upload** (optional) — accepts `.pkl` / `.joblib` with a "skip" option
5. **Domain selector** — loan / hiring / insurance / healthcare
6. **"Start Audit" button** — calls `POST /audit/data` + `POST /audit/proxy` sequentially, then routes to `/audit-report`

Show a step indicator at the top: Upload → Audit → Bias → Fix → Monitor

---

### TASK F-3: Audit Report Page

**File:** `src/pages/AuditReport.tsx`

Sections:
1. **Risk Level Banner** — full-width banner: Green/Yellow/Red with risk reason text
2. **Group Stats Cards** — one card per sensitive column showing approval rates as a horizontal bar chart (use Recharts `BarChart`)
3. **Under-represented Groups Alert** — dismissable warning cards (red border) for each flagged group
4. **Missing Data Table** — column name | % missing | severity (color-coded)
5. **Proxy Risk Section** — list of top proxy features as cards with score badge:
   - Feature name
   - Proxy score (0–1 progress bar)
   - Correlated with (tag)
   - Warning text

6. **"Proceed to Bias Analysis" CTA button** at bottom

---

### TASK F-4: Bias Report Page

**File:** `src/pages/BiasReport.tsx`

Sections:
1. **Fairness Score Gauge** — `src/components/ScoreGauge.tsx`
   - A radial gauge (SVG or Recharts RadialBarChart)
   - 0–100 with color zones: 0–50 Red, 50–75 Yellow, 75–100 Green
   - Large number in center: e.g. "42" with label "Fairness Score"
   
2. **Metrics Summary** — 3 metric cards:
   - Demographic Parity Difference (with tooltip explanation)
   - Equal Opportunity Difference
   - FPR Gap

3. **Group Performance Table** — `src/components/FairnessTable.tsx`
   - Rows: each group value (male, female, etc.)
   - Columns: Approval Rate | TPR | FPR | Accuracy
   - Color-code worst values in red

4. **Explainability Section** — list of flagged decisions:
   - Each item: record ID, decision, top 3 SHAP reasons with bar widths
   - Proxy-risk features highlighted in amber

5. **"Run Counterfactual Test" CTA**

---

### TASK F-5: Counterfactual Page

**File:** `src/pages/Counterfactual.tsx`

**Component:** `src/components/CounterfactualFlip.tsx`

Layout:
1. **Sensitive column selector** — pick one sensitive column to test
2. **Run button** → calls `POST /bias/counterfactual`
3. **Result display:**
   - Large stat: "31% of decisions flip when changing gender"
   - Two columns: "Original decision" | "After flipping gender"
   - Flip breakdown bar chart (male→female vs. female→male)
   - Interpretation text (from API)
4. **Counterfactual Fairness Score** mini-gauge (reuse ScoreGauge component)

---

### TASK F-6: Stress Test Page

**File:** `src/pages/StressTest.tsx`

Layout:
1. **Run Stress Tests button** → calls `POST /bias/stress`
2. **Baseline vs. Stressed metric cards** — for each scenario:
   - Card with scenario name
   - Before/After fairness score (with arrow + delta)
   - Fragile badge (red pill) if flagged
3. **Overall Fragility indicator** — large text: Low / Medium / High

---

### TASK F-7: Sandbox Page

**File:** `src/pages/Sandbox.tsx`  
**Component:** `src/components/SandboxComparison.tsx`

Layout:
1. **Fix selection** — checkbox list of recommended fixes from `POST /fixes/recommend`
   - Each fix shows: fix_type tag + description + estimated impact text
2. **"Simulate All Scenarios" button** → calls `POST /fixes/sandbox`
3. **Comparison table** — `SandboxComparison.tsx`:
   - Rows: each scenario
   - Columns: Scenario Name | Accuracy | Fairness Score | Risk Level | Notes
   - Best fairness row highlighted with green border
   - Animated bar fill for fairness score column
4. **"Deploy this configuration" button** (mock) — shows a success toast

---

### TASK F-8: Monitoring Page

**File:** `src/pages/Monitoring.tsx`  
**Component:** `src/components/MonitoringChart.tsx`

Layout:
1. **"Simulate 30 days of monitoring" button** → calls `POST /monitoring/{project_id}/simulate`
2. **Fairness score over time** — Recharts `LineChart`:
   - X-axis: date
   - Y-axis: fairness score 0–100
   - Color zones: fill above 75 green, 50-75 yellow, below 50 red
   - Alert markers: vertical red dashed line where alert=true
3. **Alert log** — list of alert events below the chart
4. **Current status badge** — Green/Yellow/Red with trend arrow

---

### TASK F-9: Dashboard (Home)

**File:** `src/pages/Dashboard.tsx`

Summary view for a logged-in project:
1. **Project selector** (mock: dropdown with 2 demo projects)
2. **Fairness score gauge** (large, center)
3. **4 stat cards:** Accuracy | Demographic Parity Gap | Flip Rate | Stress Fragility
4. **Mini monitoring trend** (last 10 data points, sparkline)
5. **Top 3 recommendations** (from auto-fix engine)
6. **Quick-action buttons:** Re-audit | View Bias Report | Open Sandbox

---

## 5. API Contract Summary

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health check |
| POST | `/audit/data` | Run data audit |
| POST | `/audit/proxy` | Detect proxy features |
| POST | `/bias/model` | Run model bias analysis |
| POST | `/bias/explain` | Get SHAP explanations |
| POST | `/bias/counterfactual` | Run counterfactual test |
| POST | `/bias/stress` | Run stress tests |
| POST | `/fixes/recommend` | Get fix recommendations |
| POST | `/fixes/sandbox` | Run sandbox simulation |
| GET | `/monitoring/{project_id}` | Get monitoring history |
| POST | `/monitoring/{project_id}/simulate` | Generate demo monitoring data |

All responses use `application/json`. All file uploads use `multipart/form-data`.

---

## 6. Data Flow Diagram (text)

```
User
 │
 ▼
Upload Page ──────► POST /audit/data ──────► DataAuditEngine
                 └─► POST /audit/proxy ─────► FeatureIntelligence
                                                      │
                                               AuditReport Page
                                                      │
                                         POST /bias/model ──► ModelBiasEngine
                                         POST /bias/explain ─► ExplainabilityEngine
                                                      │
                                              BiasReport Page
                                                      │
                                         POST /bias/counterfactual ─► CounterfactualEngine
                                         POST /bias/stress ──────────► StressTestEngine
                                                      │
                                         POST /fixes/recommend ─────► AutoFixEngine
                                         POST /fixes/sandbox ───────► SandboxEngine
                                                      │
                                              Sandbox Page
                                           (user picks a fix)
                                                      │
                                         POST /monitoring/simulate ─► MonitoringEngine
                                                      │
                                           Monitoring Page
```

---

## 7. Demo Mode

Implement a **"Load Demo Project"** button on the Upload page that:
1. Loads `demo_loan.csv` from the server (`GET /demo/loan`)
2. Sets sensitive_cols = `["gender", "caste"]`, target = `"approved"`, domain = `"loan"`
3. Runs the full pipeline automatically and navigates to Dashboard

Add `GET /demo/loan` endpoint that returns the synthetic CSV from Task B-1.

This allows judges or users to see the full platform without uploading anything.

---

## 8. Environment Variables

Create `.env` in `backend/`:
```
DATABASE_URL=sqlite:///./unbiased_ai.db
DEMO_DATA_PATH=../data/
MODEL_CACHE_DIR=./model_cache/
```

Create `.env` in `frontend/`:
```
VITE_API_BASE_URL=http://localhost:8000
```

---

## 9. README.md Requirements

After all tasks are complete, write `README.md` with:
1. One-paragraph project description
2. Screenshot placeholder (add after screenshots are taken)
3. Quick start:
   ```bash
   cd backend && pip install -r requirements.txt && python utils/synthetic_data.py && uvicorn main:app --reload
   cd frontend && npm install && npm run dev
   ```
4. Architecture overview (reference the data flow from Section 6)
5. How to use demo mode
6. List of fairness metrics used and their definitions

---

## 10. Implementation Order

Follow this exact order to avoid dependency issues:

1. B-0 Bootstrap + B-1 Synthetic Data
2. B-2 Data Audit + B-3 Feature Intelligence
3. B-4 Model Bias + B-5 Explainability
4. B-6 Counterfactual + B-7 Stress Test
5. B-8 Auto-Fix + Sandbox
6. B-9 Monitoring
7. F-0 Frontend Bootstrap + F-1 Navbar
8. F-2 Upload + F-3 Audit Report
9. F-4 Bias Report + F-5 Counterfactual
10. F-6 Stress Test + F-7 Sandbox
11. F-8 Monitoring + F-9 Dashboard
12. Demo mode + README

---

## 11. Acceptance Criteria (Final)

The project is complete when:

- [ ] `demo_loan.csv` loads and produces `risk_level: "Red"` from the data audit
- [ ] Proxy detection identifies `zip_code` as high-risk
- [ ] Model bias analysis produces `fairness_score < 50` on the demo dataset
- [ ] Counterfactual test shows flip rate > 20%
- [ ] Sandbox simulation shows at least 3 scenarios with different fairness scores
- [ ] Monitoring page shows a declining trend with at least 1 alert
- [ ] Demo mode loads the full pipeline in < 30 seconds
- [ ] All 11 API endpoints return valid JSON with no 500 errors
- [ ] Frontend builds with `npm run build` without TypeScript errors
- [ ] Dashboard shows Fairness Score gauge prominently

---

*End of PROMPT.md*