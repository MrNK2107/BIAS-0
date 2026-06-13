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

export interface DataAuditResult {
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
  tpr: number;
  fpr: number;
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
