export interface GroupStat {
  group: string;
  count: number;
  percentage: number;
  approval_rate: number;
}

export interface DataAuditResult {
  group_stats: GroupStat[];
  missing_data: Record<string, number>;
  risk_level: string;
}

export interface ProxyCandidate {
  feature: string;
  correlation: number;
  method: string;
}

export interface ProxyResult {
  proxy_candidates: ProxyCandidate[];
  safe_features: string[];
}

export interface MetricsByGroup {
  group: string;
  demographic_parity: number;
  equal_opportunity: number;
  tpr: number;
  fpr: number;
}

export interface FairnessGaps {
  demographic_parity_difference: number;
  equal_opportunity_difference: number;
  fpr_gap: number;
  fnr_gap: number;
}

export interface ModelBiasResult {
  fairness_score: number;
  risk_level: string;
  overall_accuracy: number;
  metrics: FairnessGaps;
  group_performance: Record<string, Record<string, GroupMetricValue>>;
  model_used: string;
  hidden_bias?: HiddenBiasEntry[];
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

export interface ExplanationRecord {
  index: number;
  feature_contributions: Record<string, number>;
  top_features: string[];
  rejected_reasons?: string[];
  is_proxy_risk?: boolean;
  proxy_reasons?: string[];
}

export interface FlipBreakdown {
  approved_to_rejected: number;
  rejected_to_approved: number;
  unchanged: number;
}

export interface CounterfactualResult {
  flip_rate: number;
  flip_direction_breakdown: FlipBreakdown;
  sample_flips?: Array<{ index: number; original: number; flipped: number }>;
}

export interface StressScenario {
  name: string;
  accuracy: number;
  fairness_score: number;
  risk_level: string;
  notes: string;
}

export interface StressTestResult {
  baseline: StressScenario;
  scenarios: StressScenario[];
  overall_fragility: string;
}

export interface FixRecommendation {
  fix_id: string;
  title: string;
  description: string;
  category: 'data' | 'model' | 'policy';
  priority: 'high' | 'medium' | 'low';
}

export interface SandboxScenarioResult {
  fix_id: string;
  accuracy: number;
  fairness_score: number;
  risk_level: string;
  notes: string;
}

export interface SandboxResult {
  results: SandboxScenarioResult[];
}

export interface PipelineFullResult {
  data_audit?: DataAuditResult;
  proxy?: ProxyResult;
  model_bias?: ModelBiasResult;
  explanations?: ExplanationRecord[];
  explain_summary?: string;
  counterfactual?: CounterfactualResult;
  stress?: StressTestResult;
  recommendations?: FixRecommendation[];
  sandbox?: SandboxResult;
  scores?: Record<string, number>;
}

export interface MonitoringEvent {
  id: number;
  timestamp: string;
  fairness_score: number;
  alert_triggered: boolean;
  note: string;
  group_breakdown: Record<string, number>;
}

export interface FairnessFlag {
  id: number;
  record_id: string;
  reason: string;
  flagged_by: string;
  resolved: boolean;
}

export interface DriftRootCause {
  feature: string;
  importance: number;
  description: string;
}

export interface DriftReport {
  drift_detected: boolean;
  drift_score: number;
  root_cause: DriftRootCause[];
  drift_results: {
    root_cause: DriftRootCause[];
  };
}

export interface TrendDataPoint {
  date: string;
  score: number;
}

export interface MonitorDataPoint {
  date: string;
  value: number;
}

export interface MonitoringPayload {
  events: MonitoringEvent[];
  flags: FairnessFlag[];
  drift_report?: DriftReport;
  trend_data?: TrendDataPoint[];
  monitor_data?: MonitorDataPoint[];
}

export interface ProjectRecord {
  id: number;
  name: string;
  domain: string;
  sensitive_columns: string[];
  target_column: string;
  max_step: number;
}

export interface CustomScenario {
  name: string;
  type: string;
  params: Record<string, string | number>;
}
