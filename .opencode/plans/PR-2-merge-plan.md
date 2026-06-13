# PR #2 Merge Plan — Selective Upgrade Only (Revised v2)

## Guiding Principle
The current codebase already has sound architecture. Only accept changes that are **clear upgrades**. Reject PR changes that are subjective restyling or downgrade existing sophistication.

## Key Correction vs v1

**XGBoost default — REJECTED.** Current codebase already does it better:
- `models.py:_recommend_model_type()` — intelligently picks RF vs XGB based on dataset size/cardinality
- `models.py:train_multiple_models()` — trains RF + XGB + Linear, model_bias.py picks best by accuracy
- Pipeline passes best model as `shared_model` to all engines — they don't retrain
- PR's `DEFAULT_MODEL_TYPE = "xgb"` would force XGB on small datasets where RF is safer
- PR's simplified single-model approach drops the multi-model comparison — that's a downgrade

## Phase 1: Backend Core Upgrades

### 1a. Update `backend/core/common.py`
Keep current re-export pattern. ADD new utility functions only:
- `validate_target_column()` — fail-fast binary target check
- `resolve_positive_label()` — smart favorable-outcome detection (tokens, polarity, override)
- `positive_rate()` — consistent rate calculation used by data_audit
- `fit_classifier()` — XGBoost early stopping via validation split (for when XGB IS explicitly used)
- `overfit_assessment()` — train-vs-test accuracy gap analysis
- `get_metric_weights()` — shared metric weight resolution (extracted from pipeline.py)
- `MIN_SUBGROUP_SIZE = 30` — statistical reliability threshold
- Updated `group_metrics()` — adds `sample_size`, `low_confidence` flags
- Updated `fairness_gaps()` — cleaner stats, includes ALL groups (never silently drops minorities)

**DO NOT** add inline `build_classifier()` — use existing one from `models.py` (which has RF default)
**DO NOT** change `prepare_split()` — keep current behavior (it's already solid)

### 1b. Update `backend/core/data_audit.py`
**Changes:**
- Add `positive_label` parameter → resolve favorable outcome once up front via `resolve_positive_label()`
- Use `_rate()` helper for consistent approval-rate calculation across all groups
- This is a strict upgrade: fixes inconsistent positive-label guessing per group

### 1c. Update `backend/core/counterfactual.py`
**Changes:**
- Import `fit_classifier` from common
- Fallback path (when `model is None`): `build_classifier(X_train)` → `fit_classifier(pipeline, X, y)` instead of `.fit()`
  - Behavior unchanged for RF (just calls `.fit()`)
  - Adds early stopping if XGBoost is explicitly used
- Import list update only

### 1d. Update `backend/core/explainability.py`
**Changes:**
- Import `fit_classifier`
- Same fallback pattern as counterfactual: `build_classifier()` + `fit_classifier()` instead of explicit RF

### 1e. Update `backend/core/model_bias.py`
**Changes:**
- **KEEP** current multi-model `train_multiple_models()` approach (better than PR's simplification)
- ADD: `overfit_assessment()` call for the best model (train-vs-test gap)
- ADD: `low_confidence_subgroups` tracking using `MIN_SUBGROUP_SIZE`
- ADD: Replace hardcoded `20` in intersectional bias with `MIN_SUBGROUP_SIZE`
- ADD: `overfit`, `low_confidence_subgroups`, `min_subgroup_size` to output dict
- Import: add `fit_classifier`, `overfit_assessment`, `MIN_SUBGROUP_SIZE` from common

### 1f. Update `backend/core/stress_test.py`
**Changes:**
- Import `fit_classifier`
- Fallback path: `build_classifier()` + `fit_classifier()` instead of `.fit()`

### 1g. Update `backend/core/sandbox.py`
**Changes:**
- Import `fit_classifier`
- NaN-safe SMOTE fix (drop NaN rows before applying)
- Use `fit_classifier()` for model training in fix scenarios

### 1h. Update `backend/core/monitoring.py`
**Changes:**
- Minor cleanup only (remove unused import)

## Phase 1b: Backend New Modules

### Create `backend/core/dataset_loader.py`
**What:** NEW — loads UCI Adult Income and COMPAS datasets from `data/` dir
- `DatasetInfo` dataclass with metadata
- `list_datasets()` / `load_dataset(name)`

### Create `backend/data_prep.py`
**What:** NEW — one-time download script for real datasets

### Create `backend/routers/colab.py`
**What:** NEW — `/api/colab/export` (generates Jupyter notebook from results)

### Create `backend/routers/datasets.py`
**What:** NEW — `/api/datasets` endpoints (list, download, load datasets)

### Create `backend/routers/gemini_narrative.py`
**What:** NEW — `/api/narrative/generate` (AI executive summaries via Gemini)

## Phase 1c: Backend Config Upgrades

### Update `backend/routers/pipeline.py`
**Changes:**
- Thread-safe task store (`threading.Lock` with `_store_get`/`_store_set`)
- Rename `model_file` → `custom_model_file`
- Add `positive_label` parameter, pass to all engines
- Fail-fast validation: validate target is binary before background task starts
- Use `get_metric_weights()` from common instead of inline function
- Replace `print()` with `logger`
- Better error handling with `logger.exception()`

### Update `backend/main.py`
**Changes:**
- Auto-load `.env` from backend dir
- Suppress Pydantic protected-namespace warnings
- Add new routers: `datasets`, `colab`, `gemini_narrative`
- Keep existing `/api` prefix pattern

### Update `backend/models/db.py`
**Changes:**
- Add `inspect`, `text` imports
- Add `FairnessFlag` model (record_id, reason, flagged_by, resolved)
- Add `_add_missing_columns()` — auto-migration for SQLite schema evolution

### Update `backend/models/schemas.py`
**Changes:**
- Clean up unused Pydantic schema classes
- Keep only `ProjectCreate` with `sensitive_columns` as list

### Update `backend/migrate_db.py`
**Changes:**
- Fix hardcoded `d:/BIAS-0/backend/...` → relative `Path(__file__)`

### Update `backend/requirements.txt`
**Changes:**
- Add `xgboost>=2.0` (if not already present)
- Add `google-genai`
- Add `nbformat`

### Create `backend/requirements-dev.txt`
**What:** NEW — `pytest`, `ruff`, `mypy`, `httpx`, `pytest-cov`

### Create `backend/.env.example`
**What:** NEW — template for `GEMINI_API_KEY`, `CORS_ALLOW_ALL`

## Phase 1d: Router Alignment

### Update `backend/routers/audit.py`, `bias.py`, `fixes.py`, `sandbox.py`, `monitoring.py`, `project.py`
**Changes (each):**
- Pass `positive_label` through to engine functions
- Align imports with new common.py exports
- Minor result schema alignment

### Update `backend/tests/test_core.py`
- Update tests for new engine signatures (added `positive_label` param)
- Update expectations for `low_confidence`, `sample_size` in group metrics

### Create `backend/tests/test_new_modules.py`
**What:** NEW — tests for dataset loading, Colab export, Gemini prompt building

---

## Phase 2: Frontend New Files

### Create `frontend/src/types.ts`
**What:** NEW — 217 lines of comprehensive TypeScript interfaces
- All pipeline result types (DataAuditResult, ProxyResult, ModelBiasResult, etc.)
- Replaces all `any` types across the frontend

### Create `frontend/src/components/ErrorBoundary.tsx`
**What:** NEW — React error boundary with fallback UI

### Create `frontend/src/components/DisparityBar.tsx`
**What:** NEW — animated fairness disparity visualization component

---

## Phase 3: Frontend Typing-Only Upgrades

### Update `frontend/src/context/AppContext.tsx`
- Replace ALL `any` with specific types from `types.ts`
- ADD: `modelFile`, `positiveLabel` state
- ADD: `positive_label` and `custom_model_file` to pipeline FormData
- Typed `setResultsFromPipeline(data: PipelineFullResult)`
- Typed error handling (no `err: any`)
- ADD: project validation (remove stale projectId)

### Update ALL Step Components (Step1–Step9) + Dashboard + Monitoring
- Replace `any` with typed interfaces ONLY
- Step2Config: add `positiveLabel` config field (UI upgrade)
- Step4ModelBias: add overfit assessment display (UI upgrade)

### Update Shared Components
- `FairnessTable.tsx`: typed `GroupMetricValue`, show `sample_size`/`low_confidence`
- `FairnessMetricsPanel.tsx`, `HiddenBiasExplorer.tsx`, `MonitoringChart.tsx`
- `SandboxComparison.tsx`, `ProjectSelector.tsx`, `Navbar.tsx`
- All: type-only changes, NO style modifications

---

## Phase 4: Frontend Feature Upgrades

### Update `frontend/src/App.tsx`
- Code splitting via `React.lazy()` for all routes
- `<Suspense>` with existing scanning skeleton as fallback
- `<ErrorBoundary>` wrapper
- ADD: `/workflow/step-9` route (already has Step9Monitoring.tsx component)
- ADD: `/monitoring` route
- KEEP: `<BackgroundGrid>` for non-root routes
- KEEP: all current page imports as lazy alternatives
- Fix: auto-resume supports step 9, avoid redirect loops

### Update `frontend/src/components/WorkflowShell.tsx`
- ADD: Step 9 (Monitor) to workflow navigation rail
- KEEP: "Unbiased AI" branding (NOT "BIAS LAB")
- KEEP: current icon/logo

### Update `frontend/src/components/CounterfactualFlip.tsx`
- Timer fix: `useRef` for timer cleanup (prevents leaks on re-render)
- REJECT: color value changes (keep #22c55e / #ef4444)
- REJECT: any other style modifications

### Update `frontend/package.json`
- Update dependency versions (framer-motion 12, react-router-dom 7.1)
- KEEP: firebase 12, three, @react-three/fiber, @react-three/drei
- KEEP: all existing dependencies

### Update `frontend/index.html`
- ADD: OG meta tags, favicon links, font preloads (SEO upgrade)

### `frontend/vite.config.ts`
**Status:** NO CHANGES NEEDED — already correct

---

## Phase 5: Root & Config

### Update `.gitignore`
- Add internal/dev doc patterns, presentation/, *.html, graphify-out/

### Create `.github/workflows/ci.yml`
**What:** NEW — CI pipeline (ruff + mypy + pytest + tsc + build)

### Create `LICENSE`
**What:** NEW — MIT License

### Create `frontend/eslint.config.js`
**What:** NEW — ESLint flat config for TS/React rules

### Create Frontend Public Assets
- Favicons (favicon.ico, 16x16, 32x32, 96x96)
- Apple touch icon, Android Chrome icons (192, 512)
- Open Graph images (og-image, og-square, twitter-image)
- logo.png, sitemap.xml, robots.txt, llms.txt
- `.env.example` with `VITE_GA_MEASUREMENT_ID`

### Delete Files (accepted from PR)
- `PROMPT.md`, `context.md` — dev docs, keep local
- `data/demo_loan.csv`, `data/demo_hiring.csv` — replaced by real datasets
- `ui-sample-asset/` (7 jpegs) — mockup screenshots

---

## EXPRESSLY REJECTED (keep current)

| File | PR Change | Reason Rejected |
|---|---|---|
| `frontend/src/styles/globals.css` | Full theme swap (copper→cyan, Cinzel→Geist) | Preserve current design system |
| `hero/hero.css` | Color/font swap | Same |
| `hero/ExperienceScene.tsx` | Particles 3000→1200, colors changed | Keep current particle density and palette |
| `hero/UIOverlay.tsx` | Add LiveBiasFeed, ForensicBento | Keep current UI overlay |
| `animations/BackgroundGrid.tsx` | Deleted | Keep it |
| `animations/DataFlowEffect.tsx` | Deleted | Keep it |
| `animations/AnalysisLoading.tsx` | New file replacing BackgroundGrid | Don't create |
| `components/landing/*` (8 files) | New landing page sections | Don't create |
| `core/common.py` inline `build_classifier()` | Duplicates models.py, changes default to XGB | Use existing from models.py (RF default, multi-model) |
| `DEFAULT_MODEL_TYPE = "xgb"` | XGBoost as default model | Keep RF as default; current code already intelligently picks model type |
| `model_bias.py` simplification | Drops multi-model training | Current multi-model comparison is superior |
| Frontend branding | "Unbiased AI" → "BIAS LAB" | Keep "Unbiased AI" |

## Verification

```bash
cd backend && python -m pytest tests/ -v
cd frontend && npx tsc --noEmit && npm run build
```
