# Project Context: Unbiased AI Decision Platform

Last updated: 2026-04-24

## 1) Project Overview

This repository implements an end-to-end fairness assurance workflow for AI-assisted decision systems.

Primary use case:
- A team uploads tabular data and evaluates whether model outcomes are unfair across sensitive groups.
- The platform runs data-level diagnostics, model-level fairness metrics, explainability checks, counterfactual checks, stress tests, and mitigation simulations.
- Monitoring endpoints support post-deployment fairness trend tracking and incident flagging.

Current domains represented by generated demo data:
- Loan approval
- Hiring

Core characteristics:
- Full-stack app with Python FastAPI backend and React + TypeScript frontend
- Local persistence via SQLite using SQLAlchemy models
- Built-in synthetic datasets with intentionally embedded bias patterns
- User workflow optimized for rapid fairness investigations rather than long-running MLOps pipelines

## 2) High-Level Architecture

### Backend
- Framework: FastAPI
- Language/runtime: Python 3.10+
- Main entrypoint: backend/main.py
- Responsibilities:
	- Serve fairness analysis APIs
	- Handle CSV uploads and form payloads
	- Run fairness and explainability engines
	- Persist projects, audit runs, monitoring events, and fairness flags

### Frontend
- Framework: React 18 + TypeScript + Vite
- Main entrypoint: frontend/src/main.tsx
- App shell and routing: frontend/src/App.tsx
- Responsibilities:
	- Guide users through upload -> audit -> bias analysis -> mitigation -> monitoring
	- Store transient pipeline state in React context
	- Render fairness metrics, charts, recommendations, and explainability outputs

### Data and storage
- Demo datasets: data/demo_loan.csv and data/demo_hiring.csv
- Database: SQLite file backend/unbiased_ai.db
- ORM: SQLAlchemy declarative models in backend/models/db.py

## 3) Backend Structure and Responsibilities

### 3.1 API wiring
backend/main.py performs the following:
- Configures CORS for http://localhost:5173
- Includes routers from:
	- backend/routers/upload.py
	- backend/routers/audit.py
	- backend/routers/bias.py
	- backend/routers/fixes.py
	- backend/routers/sandbox.py
	- backend/routers/monitoring.py
- Creates DB tables on startup
- Seeds one default project if database is empty:
	- name: Demo Loan Project
	- domain: loan
	- sensitive_columns: ["gender", "caste"]
	- target_column: approved

Health endpoint:
- GET /health -> {"status": "ok"}

### 3.2 Database models
Defined in backend/models/db.py:

Project:
- id, name, domain, created_at, sensitive_columns (JSON), target_column

AuditRun:
- id, project_id, timestamp, fairness_score, risk_level, results_json

MonitoringEvent:
- id, project_id, timestamp, fairness_score, alert_triggered, note, group_breakdown (JSON)

FairnessFlag:
- id, project_id, record_id, reason, flagged_by, timestamp, resolved

### 3.3 Core analytics modules

backend/core/data_audit.py
- run_data_audit(df, sensitive_cols, target_col)
- Produces:
	- group stats per sensitive column (count, positive_rate, missing_rate, under_represented)
	- class distribution
	- under-represented groups list (<20%)
	- missing data rates per column
	- risk level based on max inter-group approval gap

backend/core/feature_intelligence.py
- detect_proxy_features(df, sensitive_cols)
- Two detection mechanisms:
	- Correlation/Cramer's V based proxy scoring
	- KMeans clustering purity based proxy detection
- Merges both methods and returns top proxy-risk features and safe features

backend/core/model_bias.py
- run_model_bias_analysis(df, sensitive_cols, target_col, model_path=None, metric_weights=None)
- Behavior:
	- Creates train/test split
	- Uses provided model (joblib) or trains built-in RF classifier
	- Computes fairness gaps and score
	- Computes grouped metrics (approval rate, TPR, FPR, accuracy)
	- Adds Fairlearn MetricFrame outputs by sensitive attribute

backend/core/explainability.py
- explain_flagged_decisions(...)
- Behavior:
	- Trains model if not supplied
	- Uses SHAP (TreeExplainer/LinearExplainer when possible)
	- Attempts nearest-neighbor contrastive case comparison
	- Returns top reasons and proxy-risk tagging
- generate_narrative_summary(...)
	- Produces manager-readable summary text from flagged decisions

backend/core/counterfactual.py
- run_counterfactual_test(...)
- Behavior:
	- Flips sensitive attribute values for test records
	- Measures decision flip rate and per-direction breakdown
	- Computes counterfactual fairness score and baseline metrics

backend/core/stress_test.py
- run_stress_tests(...)
- Behavior:
	- Runs scenario-based perturbations:
		- minority under-sampling
		- label noise on minority group
		- distribution shift on income-like fields
	- Compares baseline vs scenario fairness/accuracy
	- Returns overall fragility label

backend/core/auto_fix.py
- generate_fix_recommendations(audit_result, proxy_result, bias_result)
- Produces mitigation options including:
	- feature-level proxy handling (remove/bucket/PCA)
	- rebalancing (SMOTE)
	- threshold tuning
	- fairness-constrained training
	- process/data collection interventions

backend/core/sandbox.py
- run_sandbox_simulation(df, sensitive_cols, target_col, fixes_to_apply, metric_weights=None)
- Applies selected fixes in simulation and reports scenario fairness/accuracy/risk

backend/core/monitoring.py
- detect_data_drift(baseline_df, current_df, sensitive_cols, target_col)
- log_monitoring_event(...)
- get_monitoring_history(...)
- check_alert_condition(...)

### 3.4 Common ML utilities
backend/core/common.py centralizes:
- train/test split handling
- classifier construction (RF or logistic)
- fairness gap calculations
- fairness score calculation from weighted penalties
- grouped confusion-derived metrics
- risk bucketing from score/gap

## 4) API Surface (Current)

### Demo/project bootstrap
- GET /demo/loan
	- Returns generated loan CSV payload as text
- GET /demo/projects
	- Lists projects from DB

### Audit endpoints
- POST /audit/data
	- Multipart form: project_id, sensitive_cols, target_col, file
	- Returns data audit result and stores AuditRun
- POST /audit/proxy
	- Multipart form: sensitive_cols, file
	- Returns proxy feature analysis
- POST /audit/summary
	- Form-encoded JSON strings of prior outputs
	- Returns inferred primary bias type

### Bias endpoints
- POST /bias/model
	- Multipart form: sensitive_cols, target_col, file, optional model_path, metric_priority
- POST /bias/model-from-api
	- Uses external prediction API via request template substitution
- POST /bias/explain
	- Returns flagged decision explanations
- POST /bias/explain-summary
	- JSON body: flagged_list, sensitive_cols, domain
	- Returns natural-language summary
- POST /bias/counterfactual
	- Multipart form: sensitive_col, target_col, file, metric_priority
- POST /bias/stress
	- Multipart form: sensitive_cols, target_col, file, optional custom_scenarios

### Fix/sandbox endpoints
- POST /fixes/recommend
- POST /fixes/sandbox

### Monitoring endpoints
- GET /monitoring/{project_id}
- POST /monitoring/{project_id}/simulate
- POST /monitoring/ingest
- POST /monitoring/drift
- POST /monitoring/flag
- GET /monitoring/flags/{project_id}
- PATCH /monitoring/flag/{flag_id}

## 5) Frontend Architecture and Flow

### 5.1 Routing and screens
Routes in frontend/src/App.tsx:
- /
	- Dashboard summary and navigation hub
- /upload
	- CSV upload and pipeline setup
- /audit-report
	- Data-level bias report
- /bias-report
	- Model fairness metrics + explainability
- /counterfactual
	- Counterfactual fairness visualization
- /stress-test
	- Robustness/fragility stress outcomes
- /sandbox
	- Mitigation strategy simulation
- /monitoring
	- Fairness trend and drift/alert view

### 5.2 Shared state and orchestration
frontend/src/context/AppContext.tsx is the central orchestrator.

State buckets:
- Input config: file, sensitive cols, target col, domain, metric priority
- Model source config: file or API endpoint mode
- Pipeline outputs: audit, proxy, bias, explainability, counterfactual, stress, recommendations, sandbox, monitoring

Orchestration methods:
- runDataAudit()
- runModelBias(customStressScenarios?)
- runRecommendFixes()
- runSandboxSimulation(fixes)
- runMonitoringSimulation()
- getMonitoringData()

### 5.3 API integration setup
frontend/src/api/client.ts:
- api: JSON requests to /api (Vite proxy rewrites to backend root)
- formApi: multipart requests to /api

frontend/vite.config.ts:
- Dev server on port 5173
- Proxy /api -> http://localhost:8000

### 5.4 UI design system characteristics
frontend/src/styles/globals.css defines:
- Dark, high-contrast visual theme
- CSS variables for semantic colors and typography
- Sidebar + content shell layout
- Reusable card, table, banner, pill, and button primitives

## 6) Data Assets and Synthetic Bias Design

Generator script: backend/utils/synthetic_data.py

Loan dataset profile:
- Columns include demographics, financial variables, and approval label
- Intentional bias patterns:
	- lower approval for female vs male
	- lower approval for SC/ST vs general caste categories
	- proxy behavior through zip_code and income correlations
	- missingness intentionally introduced in credit_score

Hiring dataset profile:
- Includes demographics, experience, scores, and hired label
- Intentional correlations between gender and university tier
- Intentional inter-group hiring disparity

Script command:
- python utils/synthetic_data.py

Outputs:
- data/demo_loan.csv
- data/demo_hiring.csv

## 7) Local Development and Runbook

### Backend
1. cd backend
2. Create and activate Python environment
3. pip install -r requirements.txt
4. Optional: generate synthetic datasets
	 - python utils/synthetic_data.py
5. Start server
	 - python -m uvicorn main:app --reload

### Frontend
1. cd frontend
2. npm install
3. npm run dev

Assumed ports:
- Frontend: 5173
- Backend: 8000

## 8) Testing Status

Unit-style backend test:
- backend/tests/test_core.py
- Verifies:
	- audit risk level on synthetic loan data
	- proxy detection returns candidates
	- model fairness score is below threshold on biased data

E2E script note:
- e2e_test.py exists but includes hardcoded paths that reference a different folder layout and is currently not a reliable out-of-box smoke test.

## 9) Current Implementation Caveats (Important)

The following are code-level caveats observed in the current implementation and should be considered part of project context:

1. Duplicate sandbox route registration
- Both backend/routers/fixes.py and backend/routers/sandbox.py define POST /fixes/sandbox.
- This creates route overlap and can make behavior ambiguous depending on registration/match order.

2. Potential import mismatch in fixes sandbox handler
- backend/routers/fixes.py imports upload_file_to_dataframe from core.common, but that function is defined in backend/utils/data_io.py.
- This can break /fixes/sandbox in that router implementation.

3. Payload mismatch for recommendations endpoint
- backend/routers/fixes.py expects form fields (Form(...)) containing JSON strings.
- frontend/src/context/AppContext.tsx currently sends JSON body object via api.post('/fixes/recommend', payload).
- This can lead to 422 validation errors unless backend or frontend contract is aligned.

4. Stress robustness naming mismatch
- Dashboard expects stressResult.overall_robustness, while backend stress output uses overall_fragility.
- UI may show incomplete/placeholder stress status.

5. Model upload control in UI is currently non-functional
- Upload page has model file input but selected model is not wired into context and not sent as model_path or file upload to bias endpoints.

## 10) Strategic Next Improvements

Near-term priorities for stabilizing the platform:
- Resolve route duplication and unify sandbox endpoint behavior.
- Normalize request contracts (JSON vs multipart/form) across frontend/backend.
- Align field naming conventions across backend outputs and dashboard expectations.
- Wire model upload path end-to-end (frontend input -> backend loading).
- Add integration tests for complete upload-to-monitoring pipeline.
- Add API contract documentation (OpenAPI examples for each route).

## 11) Summary

This project is a substantial fairness engineering prototype with real, modular analysis engines and a structured analyst-facing UI workflow. The architecture is clear and extensible, and most major fairness analysis stages are implemented. The main blockers to production-readiness are interface-contract inconsistencies and a small set of endpoint wiring conflicts, not missing core capability.
