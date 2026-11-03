// ── Data Audit ─────────────────────────────────────────────────────────

export interface DatasetQuality {
  is_sufficient: boolean;
  n_rows: number;
  n_features: number;
  min_class_size: number;
  min_group_size: number | null;
  warnings: string[];
}

export interface GroupStatDetail {
  count: number;
  positive_rate: number;
  missing_rate: number;
  under_represented: boolean;
  representation_ratio?: number;
}

export interface TargetBinarisation {
  method: "two_class" | "one_vs_rest" | "median_threshold" | "unsupported";
  n_classes: number;
  note: string | null;
  threshold?: number;
  positive?: string | number | boolean;
}

export interface DataAuditResult {
  /** how a multi-valued target was binarised (null note = plain two classes) */
  target_binarisation?: TargetBinarisation | null;
  warnings?: string[];
  group_stats: Record<string, Record<string, GroupStatDetail>>;
  class_distribution: { approved: number; rejected: number };
  under_represented_groups: string[];
  missing_data: Record<string, number>;
  risk_level: string;
  risk_reason?: string;
  max_gap?: number;
  dataset_quality?: DatasetQuality;
  balanced_attributes?: string[];
  imbalanced_attributes?: string[];
}

// ── Proxy Detection ────────────────────────────────────────────────────

export interface ProxyCandidate {
  feature: string;
  proxy_score?: number;
  cluster_proxy_score?: number;
  combined_score?: number;
  correlated_with?: string;
  related_sensitive?: string;
  correlation?: number;
  p_value?: number;
  mutual_information?: number;
  significance?: string;
  warning?: string;
  detection_method?: string;
  confidence?: string;
  purity?: number;
}

export interface ProxyResult {
  proxy_features: ProxyCandidate[];
  safe_features: string[];
  proxy_score: number;
}

// ── Model Bias ─────────────────────────────────────────────────────────

export interface FairnessGaps {
  demographic_parity_difference: number;
  equal_opportunity_difference: number;
  fpr_gap: number;
  fnr_gap: number;
}

export interface PValues {
  demographic_parity_difference: number;
  equal_opportunity_difference: number;
  fpr_gap: number;
  fnr_gap: number;
}

export interface ModelSummary {
  overall_accuracy: number;
  fairness_score: number;
  risk_level: string;
  metrics: FairnessGaps;
  p_values?: PValues;
}

export interface GroupMetricValue {
  approval_rate: number;
  tpr: number | null;
  fpr: number | null;
  accuracy: number;
}

export interface HiddenBiasEntry {
  id: string;
  definition: string;
  attributes: Record<string, string>;
  metricDifference: string;
  metricValue: number;
  sampleSize: number;
  metricName: string;
}

export interface ModelBiasResult {
  fairness_score: number;
  risk_level: string;
  overall_accuracy: number;
  metrics: FairnessGaps;
  p_values?: PValues;
  group_performance: Record<string, Record<string, GroupMetricValue>>;
  model_used: string;
  hidden_bias?: HiddenBiasEntry[];
  all_models?: Record<string, ModelSummary>;
  statistical_rigour?: StatisticalRigour;
  /** NYC LL144 rates on the test set (backend core.model_bias._ll144_block) */
  ll144?: {
    selection?: Ll144Rates;
    /** null when the model has no score (predict_proba) */
    scoring?: Ll144Rates | null;
  };
}

export interface Ll144Rates {
  rate_type: "selection" | "scoring";
  rates: Record<string, Record<string, number>>;
  counts: Record<string, Record<string, number>>;
}

// ── Statistical rigour (Backend: core/rigour.py) ─────────────────────────

export interface GapWithCI {
  point: number;
  ci_lower: number | null;
  ci_upper: number | null;
  se: number | null;
}

export interface RigourGroup {
  count: number;
  positives: number;
  negatives: number;
  selection_rate: number | null;
  selection_rate_ci: [number, number];
  tpr: number | null;
  fpr: number | null;
  fnr: number | null;
  reliable: boolean;
  warnings: string[];
}

export interface CalibrationSummary {
  n: number;
  ece: number | null;
  mce: number | null;
  brier: number | null;
  reliable?: boolean;
  bins: {
    lower: number;
    upper: number;
    count: number;
    mean_predicted: number;
    observed_rate: number;
  }[];
}

export interface RigourAttribute {
  n_rows: number;
  n_groups: number;
  n_reliable_groups: number;
  gaps_scope: "all_groups" | "reliable_groups";
  gaps: Record<string, GapWithCI>;
  groups: Record<string, RigourGroup>;
  groups_omitted: number;
  n_small_groups: number;
  small_groups: { group: string; count: number }[];
  unreliable: boolean;
  columns?: string[];
  calibration?: {
    overall: CalibrationSummary;
    by_group: Record<string, CalibrationSummary>;
    ece_gap: number | null;
  };
}

export interface StatisticalRigour {
  config: {
    n_boot: number;
    seed: number;
    ci_level: number;
    min_group_size: number;
    min_rate_denominator: number;
    calibration_bins: number;
    ci_method: string;
  };
  per_attribute: Record<string, RigourAttribute>;
  intersectional: Record<string, RigourAttribute>;
  warnings: string[];
}

// ── Explanations (Backend: explain_flagged_decisions) ───────────────────

export interface ShapReason {
  feature: string;
  shap_value: number;
  is_proxy_risk: boolean;
}

export interface ExplanationRecord {
  record_id: number | string;
  decision: string; // "approved" | "rejected"
  sensitive_attribute: string;
  top_reasons: ShapReason[];
  human_explanation: string;
  explanation_type: string; // "contrastive" | "individual"
}

// ── Counterfactual (Backend: run_counterfactual_test) ───────────────────

export interface FlipBreakdownEntry {
  flips: number;
  total: number;
  rate: number;
}

export interface CounterfactualSample {
  record_id: number;
  original_value: string;
  flipped_value: string;
  original_decision: string;
  flipped_decision: string;
}

export interface CounterfactualResult {
  sensitive_col: string;
  flip_rate: number;
  counterfactual_fairness_score: number;
  flip_breakdown: Record<string, FlipBreakdownEntry>;
  sample_flips: CounterfactualSample[];
  interpretation: string;
  baseline: { fairness_score: number; accuracy: number };
}

// ── Stress Test (Backend: run_stress_tests) ─────────────────────────────

export interface StressScenario {
  name: string;
  fairness_score: number;
  accuracy: number;
  fairness_drop: number;
  fragile: boolean;
  statistically_significant?: boolean | null;
  /** demographic parity difference with a stratified bootstrap CI (core.rigour) */
  dpd_ci?: GapWithCI | null;
  baseline_dpd_ci?: GapWithCI | null;
  note: string;
  baseline_fairness_score: number;
  baseline_accuracy: number;
}

export interface StressTestResult {
  baseline: { fairness_score: number; accuracy: number };
  scenarios: StressScenario[];
  overall_fragility: string;
}

// ── Fix Recommendations (Backend: generate_fix_recommendations) ─────────

export interface MitigationOption {
  option: string;
  rationale: string;
}

export interface FixRecommendation {
  fix_id: string;
  fix_type: string; // "feature_level" | "data_level" | "model_level" | "policy_level"
  issue: string;
  description: string;
  estimated_impact: string;
  mitigation_options: MitigationOption[];
  type: string; // "feature_removal" | "data_rebalancing" | "adversarial_training" | etc
}

// ── Sandbox (Backend: run_sandbox_simulation) ──────────────────────────

export interface SandboxScenario {
  name: string;
  accuracy: number;
  fairness_score: number;
  risk_level: string;
  notes: string;
}

export interface SandboxResult {
  scenarios: SandboxScenario[];
  recommendation: string;
}

// ── Scores & Pipeline ──────────────────────────────────────────────────

export interface Scores {
  data_bias_score?: number;
  model_bias_score?: number;
  proxy_risk_score?: number;
  counterfactual_score?: number;
  stress_test_score?: number;
}

export interface PipelineFullResult {
  scores?: Scores;
  fairness_score?: number;
  decision?: string;
  recommendations?: FixRecommendation[];
  data_audit?: DataAuditResult;
  proxy?: ProxyResult;
  model_bias?: ModelBiasResult;
  explanations?: ExplanationRecord[];
  explain_summary?: string;
  counterfactual?: CounterfactualResult;
  stress?: StressTestResult;
  model_used?: string;
  /** what was audited and how (Backend: core/evidence.py); absent on older runs */
  provenance?: Provenance;
}

export interface Provenance {
  schema_version: string;
  generated_at: string;
  input: {
    /** name the file was uploaded under (schema >= 1.1.0); older runs stored the storage object name here */
    filename: string;
    /** storage object the bytes were read from ("<uuid hex>_<name>"); null for direct uploads, absent before 1.1.0 */
    stored_name?: string | null;
    sha256: string;
    size_bytes: number;
    n_rows: number;
    n_columns: number;
    columns: string[];
  };
  model: { used: string; sha256: string | null };
  config: {
    sensitive_cols: string[];
    target_col: string;
    /** positive (selected) class of the target; schema >= 1.2.0 (absent before) */
    positive_label?: { value: string | number | boolean | null; source: "user" | "inferred" } | null;
    /** how the target became 0/1; schema >= 1.3.0 (backend core.data.describe_target_binarisation) */
    target_binarisation?: TargetBinarisation | null;
    /** NYC LL144 rate type from the project setting; schema >= 1.4.0 */
    ll144_rate_type?: { value: "selection" | "scoring"; source: "project" | "default" } | null;
    domain: string;
    metric_weights: Record<string, number>;
    unified_score_weights: Record<string, number>;
    statistical_rigour: Partial<StatisticalRigour["config"]>;
  };
  versions: {
    bias0: string;
    metrics: Record<string, string>;
    libraries: Record<string, string | null>;
  };
}

// Wrapper types for endpoint-specific responses
export interface PipelineStatusResponse {
  status: string; // "complete" | "error" | "processing" | "queued"
  result?: PipelineFullResult;
  error?: string;
}

export interface PipelineResultResponse {
  status: string;
  fairness_score?: number;
  decision?: string;
  scores?: Scores;
  recommendations?: FixRecommendation[];
  details?: PipelineFullResult;
}

export interface ProjectLatestResponse {
  status: string;
  result?: PipelineFullResult;
  fairness_score?: number;
  accuracy?: number;
}

// ── Monitoring (Backend: GET /monitoring/{project_id}) ─────────────────

export interface MonitoringEvent {
  timestamp: string;
  fairnessScore: number;
  alert: boolean;
  note?: string;
  group_breakdown?: Record<string, Record<string, number>>;
}

export interface MonitoringAlert {
  alert: boolean;
  drop: number;
  message: string;
}

export interface MonitoringHistoryResponse {
  project_id: string;
  events: MonitoringEvent[];
  current_risk_level: string;
  trend: string;
  alert: MonitoringAlert;
}

// ── Drift Detection (Backend: detect_data_drift) ───────────────────────

export interface DriftRootCause {
  feature: string;
  change: number;
  p_value?: number;
  psi?: number;
  js_divergence?: number;
  is_sensitive?: boolean;
}

export interface DriftReport {
  drift_alert: boolean;
  drift_message: string;
  root_cause: DriftRootCause[];
  affected_groups?: string[];
  recommended_actions?: string[];
  sensitive_distribution_shift?: Record<string, number>;
}

// ── Monitoring Project Endpoints ───────────────────────────────────────

export interface MonitorData {
  drift_detected: boolean;
  trend?: Array<{ score: number; timestamp?: string }>;
}

export interface TrendData {
  trend: string;
  stability_score: number;
  degradation_detected: boolean;
  recent_scores?: number[];
}

export interface AlertRecord {
  id: number;
  type: string;
  message: string;
  severity: string;
  timestamp: string;
}

// ── Fairness Flags (Backend: POST /monitoring/flag) ────────────────────

export interface FairnessFlag {
  id: number;
  record_id: string;
  reason: string;
  flagged_by: string;
  timestamp?: string;
  resolved?: boolean;
}

// ── Monitoring Logs ────────────────────────────────────────────────────

export interface MonitoringLogEntry {
  id: string;
  timestamp: string;
  fairness_score: number;
  data_drift_score: number;
  prediction_drift_score: number;
  key_metrics: Record<string, unknown>;
}

// ── Projects ───────────────────────────────────────────────────────────

export interface ProjectRecord {
  id: number;
  name: string;
  domain: string;
  sensitive_columns: string[];
  target_column: string;
  max_step: number;
  /** NYC LL144 rate type (6 RCNY 5-301(b) selection / (c) scoring); recorded in provenance */
  ll144_rate_type?: "selection" | "scoring";
}

export interface ProjectCompareRun {
  run_id: number;
  fairness_score: number;
  accuracy: number;
  decision: string;
  timestamp: string;
}

// ── Custom Stress Scenario ─────────────────────────────────────────────

export interface CustomScenario {
  name: string;
  type: string; // "undersample" | "label_noise" | "shift"
  sensitive_col: string;
  target_group: string;
  magnitude: number;
}

// ── Ingest Predictions ─────────────────────────────────────────────────

export interface IngestPrediction {
  record_id: number;
  prediction: number;
  sensitive_attrs: Record<string, string>;
  timestamp: string;
}

export interface IngestPayload {
  project_id: string;
  predictions: IngestPrediction[];
}
