# Project Context: Unbiased AI Decision Platform

Last updated: 2026-04-26

## 1) Project Overview & Objective

The Unbiased AI Decision Platform is a premium Enterprise SaaS application designed for data science and compliance teams. Its core objective is to provide a robust, end-to-end fairness assurance workflow for AI-assisted decision systems. 

**Key Design Philosophies:**
- **Fully Dynamic:** The platform strictly requires user-provided data. There are no hardcoded demos or pre-configured datasets. Users must upload a `.csv` and manually configure the columns.
- **Unified Precomputation Pipeline:** Rather than a fragmented, step-by-step loading process, the backend handles *all* mathematical bias analysis (data auditing, proxy detection, model training, SHAP explainability, counterfactual testing, stress testing, and auto-fix generation) in a single massive compute sweep.
- **Dark Editorial Aesthetic:** The UI is stripped of clutter, utilizing "Exaggerated Minimalism". Critical metrics are displayed in massive typography (`text-8xl`), framed by Deep Charcoal (`#0F1115`) backgrounds and Burnished Copper (`#D4A373`) accents.
- **Immersive 3D Feedback:** Utilizing React Three Fiber and Framer Motion, the application provides spatial, interactive data visualizations (e.g., node network graphs) right on the landing page to establish technical authority.

## 2) Deep Architecture & Data Flow

The platform relies on a React 18 frontend communicating with a Python FastAPI backend via REST. Data persistence is handled by an SQLite database with SQLAlchemy ORM.

### End-to-End Data Flow (The "Happy Path")
1. **Ingestion (Frontend `Step1Upload.tsx`)**: The user drops a `.csv` file. The frontend locally parses the first few lines to extract header names.
2. **Configuration (Frontend `Step2Config.tsx`)**: The user selects `sensitive_columns` (e.g., gender, race), `target_col` (the decision label), and metric priorities. 
3. **Execution (API Call)**: Clicking "Start Full Analysis" triggers a `FormData` POST request containing the raw `.csv` and configuration string arrays to `POST /pipeline/run-all`.
4. **Backend Unified Pipeline (`backend/routers/pipeline.py`)**: 
   - The file is converted to a Pandas DataFrame.
   - The data is split into train/test sets. A default scikit-learn `RandomForestClassifier` is built and fitted.
   - **8 distinct ML engines** are run sequentially on the dataframe and model.
   - The results are aggregated into a massive JSON payload.
   - An `AuditRun` record is persisted to the SQLite database.
   - The JSON payload is returned to the frontend.
5. **Frontend State Population (`AppContext.tsx`)**: The massive JSON payload is destructured into individual state buckets (e.g., `auditResult`, `biasResult`, `stressResult`).
6. **Visualization (Steps 3-7)**: The user navigates through the workflow tabs instantly, as all data is already pre-fetched and stored in React Context.

## 3) Database Schema (`backend/models/db.py`)

The application uses SQLAlchemy to manage 4 primary tables in `unbiased_ai.db`.

1. **`Project`**: The top-level container for a specific dataset/domain.
   - `id` (Integer, PK)
   - `name` (String)
   - `domain` (String)
   - `sensitive_columns` (JSON List)
   - `target_column` (String)
   - *Relationships*: 1-to-many with `AuditRun` and `MonitoringEvent`.
2. **`AuditRun`**: Represents a single execution of the `/pipeline/run-all` endpoint.
   - `id` (Integer, PK)
   - `project_id` (ForeignKey)
   - `timestamp` (DateTime)
   - `fairness_score` (Float) - *The aggregate score across DP and EO metrics.*
   - `risk_level` (String) - *Usually "Green", "Yellow", or "Red" based on representation gaps.*
   - `results_json` (JSON) - *Stores the entire 8-stage analysis payload for historical recall.*
3. **`MonitoringEvent`**: Represents simulated post-deployment checks for data drift.
   - `id`, `project_id`, `timestamp`, `fairness_score`
   - `alert_triggered` (Boolean)
   - `note` (String)
   - `group_breakdown` (JSON)
4. **`FairnessFlag`**: Manually or automatically flagged individual records that require review.
   - `id`, `project_id`, `record_id`, `reason`, `flagged_by`, `resolved` (Boolean)

## 4) Backend Components & Unified Pipeline (`backend/routers/pipeline.py`)

When `POST /pipeline/run-all` is hit, it executes the following core modules in order:

### 1. `backend/core/data_audit.py` (`run_data_audit`)
- **Inputs**: DataFrame, sensitive columns, target column.
- **Mechanics**: Computes raw class distributions, missing data rates, and positive/approval rates per demographic group. Identifies under-represented groups (e.g., < 20% of the population).
- **Outputs**: `data_audit` dict containing `group_stats`, `missing_data`, and `risk_level`.

### 2. `backend/core/feature_intelligence.py` (`detect_proxy_features`)
- **Inputs**: DataFrame, sensitive columns.
- **Mechanics**: Detects features that act as "proxies" for sensitive attributes (e.g., Zip Code acting as a proxy for Race). Uses two methods: Cramer's V correlation for categorical features, and KMeans clustering purity checks.
- **Outputs**: `proxy` dict containing `proxy_candidates` (features to drop/fix) and `safe_features`.

### 3. `backend/core/model_bias.py` (`run_model_bias_analysis`)
- **Inputs**: DataFrame, sensitive columns, target column, `shared_model`, `metric_weights`.
- **Mechanics**: Uses `fairlearn` to calculate Demographic Parity and Equal Opportunity differences. Generates TPR (True Positive Rate) and FPR (False Positive Rate) per group.
- **Outputs**: `model_bias` dict containing `fairness_score`, `metrics_by_group`, and `fairness_gaps`.

### 4. `backend/core/explainability.py` (`explain_flagged_decisions`, `generate_narrative_summary`)
- **Inputs**: DataFrame, `shared_model`, sensitive columns, target column.
- **Mechanics**: Selects a sample of "rejected" records. Runs SHAP (`TreeExplainer`) to determine the top contributing features to the rejection. Also generates nearest-neighbor counterfactuals (e.g., "If credit score was +50, they would be approved"). The `generate_narrative_summary` function turns these mathematical SHAP values into an English paragraph.
- **Outputs**: `explanations` list and `explain_summary` string.

### 5. `backend/core/counterfactual.py` (`run_counterfactual_test`)
- **Inputs**: DataFrame, `shared_model`, primary sensitive column, target column.
- **Mechanics**: Creates a cloned test set where the sensitive attribute is artificially flipped (e.g., all Males set to Females). Re-runs the model predictions. Calculates the "Flip Rate" (how many decisions changed purely based on the demographic flip).
- **Outputs**: `counterfactual` dict containing `flip_rate` and `flip_direction_breakdown`.

### 6. `backend/core/stress_test.py` (`run_stress_tests`)
- **Inputs**: DataFrame, `shared_model`, sensitive columns, target column.
- **Mechanics**: Subjects the model to extreme simulated conditions: 
  - *Minority Under-sampling*: Drops 50% of the minority class to see if accuracy tanks.
  - *Label Noise*: Randomly flips the target label on 10% of the minority class.
  - *Distribution Shift*: Artificially lowers numerical values (like income) for minority groups.
- **Outputs**: `stress` dict detailing baseline vs scenario accuracy/fairness and an `overall_fragility` rating.

### 7. `backend/core/auto_fix.py` (`generate_fix_recommendations`)
- **Inputs**: The results from `data_audit`, `proxy`, and `model_bias`.
- **Mechanics**: A rule-based heuristic engine. If FPR gap is high, it recommends Threshold Tuning. If proxy features exist, it recommends dropping/bucketing them. If data is heavily imbalanced, it recommends SMOTE.
- **Outputs**: `recommendations` list of actionable UI objects.

## 5) Frontend State Architecture (`frontend/src/context/AppContext.tsx`)

The React frontend utilizes a global Context Provider to prevent prop-drilling and allow the user to jump between analysis steps without losing data.

### Input Configurations (Set by User in Steps 1 & 2)
- `file: File | null`: The raw CSV.
- `sensitiveCols: string[]`: Array of selected column names.
- `targetCol: string`: The decision column.
- `domain: string`: The business context (e.g., "loan", "hiring").
- `metricPriority: string`: "balanced", "equal_opportunity_first", etc. 
- `modelType: 'file' | 'api'`: *(Note: API and custom model upload logic is built into the UI but not fully integrated into the backend's `/pipeline/run-all` endpoint, which defaults to an internal Random Forest).*

### Output Slices (Populated by `runFullAnalysis()`)
When `/pipeline/run-all` returns the giant JSON blob, `AppContext` dissects it:
- `auditResult`, `proxyResult`, `biasResult`, `explainResult`, `explainSummary`, `counterfactualResult`, `stressResult`, `recommendResult`.
- `pipelineResults`: The raw full JSON.
- `isAnalyzing`: Boolean driving the fake loading screen in Step 2.

## 6) Immersive UI & Rendering Ecosystem

### 3D React Three Fiber Implementation (`frontend/src/components/hero/`)
The landing page relies on advanced 3D rendering to establish an "Enterprise Intelligence" feel.
- **`BiasNetworkHero.tsx`**: The main container. Wraps the canvas.
- **`ExperienceScene.tsx`**: The R3F component. It dynamically calculates procedural node positions (a network graph). The nodes pulse in colors based on the CSS tokens (Copper for safe, Red for biased). It uses `useFrame` for continuous rotation and a spring physics system for mouse-parallax camera movement. Instanced rendering is heavily implied for 60fps performance.
- **`ScrollExperience.tsx`**: Uses `framer-motion` to tie the scroll position of the page to opacity and Y-axis translations, allowing the user to "scroll through" the 3D network.

### Dark Editorial Design System (`frontend/src/styles/globals.css`)
- **Color Tokens**:
  - `--background`: `#0F1115` (Deep Charcoal)
  - `--surface`: `#1A1D23` (Elevated Card)
  - `--accent`: `#D4A373` (Burnished Copper - used for primary CTAs and active states)
  - `--warning`: `#BC4749` (Muted Red - used for highlighting bias/flags)
- **Typography**: `Cinzel` (Headers) and `Josefin Sans` (Body).
- **Custom Overrides**: We override native HTML elements drastically. `select[multiple]` elements have custom thin scrollbars. `<input type="radio">` are replaced with custom CSS circles that glow copper when checked. The standard `<input type="file">` is completely hidden and triggered via a stylized `<label>` button.

## 7) Development Runbook

### Backend Start
```bash
cd backend
python -m venv venv
source venv/bin/activate  # (Windows: venv\Scripts\activate)
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

### Frontend Start
```bash
cd frontend
npm install
npm run dev
```

## 8) Known Limitations & Next Steps
1. **Custom Model Upload Disconnect**: In `Step2Config.tsx`, users can choose "Built-in / File Upload" and browse for a `.pkl` model. However, `backend/routers/pipeline.py` currently calls `build_classifier()` to train a new Random Forest from scratch. To support custom models, `pipeline.py` must deserialize the uploaded `.pkl` and pass it to the analysis modules instead of `build_classifier()`.
2. **Route Shadowing**: The `/fixes/sandbox` endpoint exists in both `fixes.py` and `sandbox.py`. This needs to be deduplicated.
3. **Synchronous Compute Scaling**: The `/pipeline/run-all` endpoint executes heavily synchronous math. For massive datasets (e.g., >500k rows), this will cause HTTP timeouts. A future iteration should move this endpoint to a Celery/Redis worker queue and use WebSockets or polling for the UI.
