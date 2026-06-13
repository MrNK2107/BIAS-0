import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import {
  BarChart,
  Bar,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Line,
  AreaChart,
  Area,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Search,
  Target,
  Fingerprint,
  Zap,
  Activity,
  History,
  FolderPlus,
  ArrowUp,
  ArrowRight,
  Shield,
  GitCompare,
  Play,
  Sparkles,
  TrendingUp,
  Brain,
} from "lucide-react";
import { api } from "../api/client";
import EmptyState from "../components/EmptyState";
import HelpButton from "../components/HelpButton";
import GuidedTour, {
  useGuidedTour,
  DEFAULT_STEPS,
} from "../components/GuidedTour";
import { downloadAuditReport } from "../utils/reportExport";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
  },
};

export default function Dashboard() {
  const { pipelineResults, projectId, projects, projectsLoaded } =
    useAppContext();
  const [comparisons, setComparisons] = useState<
    Array<{
      run_id: number;
      fairness_score: number;
      accuracy: number;
      decision: string;
      timestamp: string;
    }>
  >([]);
  const navigate = useNavigate();
  const tour = useGuidedTour("main-tour");

  useEffect(() => {
    if (tour.isActive) return;
    if (projectId) {
      api
        .get(`/project/${projectId}/compare`)
        .then((res) => setComparisons(res.data));
    }
     
  }, [projectId, pipelineResults, tour.isActive]);

  // Wait for Firestore to respond before deciding what to show.
  // Don't show "Start Audit Sequence" until we know the project exists.
  if (!projectsLoaded) {
    return (
      <div
        className="fade-in"
        style={{ maxWidth: 880, margin: "0 auto", paddingTop: 80 }}
      >
        <div className="dashboard-intro">
          <div className="kicker">Intelligence Workspace</div>
          <h1 className="page-title" style={{ marginBottom: 18 }}>
            Forensic AI Hub
          </h1>
        </div>
        <div
          style={{
            width: 28,
            height: 28,
            border: "2px solid var(--border)",
            borderTopColor: "var(--accent)",
            borderRadius: "50%",
            margin: "40px auto 12px",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <p className="helper" style={{ textAlign: "center" }}>
          Loading projects...
        </p>
      </div>
    );
  }

  // Only consider a project valid if it exists in the Firestore-backed list.
  const projectExists =
    projectId !== null &&
    projects.some((p) => String(p.id) === String(projectId));

  if (!pipelineResults) {
    if (!projectExists) {
      return (
        <div
          className="fade-in"
          style={{ maxWidth: 880, margin: "0 auto", paddingTop: 80 }}
        >
          <div className="dashboard-intro">
            <div className="kicker">Intelligence Workspace</div>
            <h1 className="page-title" style={{ marginBottom: 18 }}>
              Forensic AI Hub
            </h1>
            <p
              className="page-subtitle"
              style={{ margin: "0 auto", textAlign: "center" }}
            >
              {projects.length === 0
                ? "Create your first project to start auditing a model for bias."
                : "Pick a project from the selector at the top of the page, or create a new one."}
            </p>
          </div>

          {projects.length === 0 ? (
            <EmptyState
              icon={<FolderPlus size={20} />}
              kicker="Step 1"
              title="Create your first project"
              description="Projects let you organize audits by dataset, domain, and team. Click 'Select Project' in the top bar, then choose 'New Project' to set one up."
              primaryAction={{
                label: "Open Project Selector",
                to: "#open-selector",
              }}
            />
          ) : (
            <EmptyState
              icon={<ArrowUp size={20} />}
              kicker="Pick a project"
              title="Select a project to continue"
              description={`You have ${projects.length} project${projects.length === 1 ? "" : "s"} on file. Click “Select Project” at the top of the page to choose one and begin auditing.`}
              primaryAction={{
                label: "Select Project to Start",
                to: "#open-selector",
              }}
            />
          )}
        </div>
      );
    }

    return (
      <div
        className="fade-in"
        style={{ maxWidth: 880, margin: "0 auto", paddingTop: 80 }}
      >
        <div className="dashboard-intro">
          <div className="kicker">
            Project:{" "}
            {projects.find((p) => String(p.id) === String(projectId))?.name ??
              "Active"}
          </div>
          <h1 className="page-title" style={{ marginBottom: 18 }}>
            Ready for Audit
          </h1>
          <p
            className="page-subtitle"
            style={{ margin: "0 auto", textAlign: "center" }}
          >
            Upload a dataset in Step 1 and run the full analysis in Step 2. The
            dashboard will populate with fairness scores, counterfactual
            findings, and remediation steps as soon as the pipeline completes.
          </p>
        </div>

        <EmptyState
          icon={<Search size={20} />}
          kicker="Next Move"
          title="Run an audit to see results"
          description="The forensic engine will execute eight sequential analyses: data audit, proxy detection, model bias, SHAP explainability, counterfactual testing, stress testing, and auto-generated remediation."
          primaryAction={{
            label: "Start Audit Sequence",
            to: "/workflow/step-1",
          }}
          secondaryAction={{ label: "Switch Project", to: "/profile" }}
        />
      </div>
    );
  }

  if (!pipelineResults?.scores) return null;

  const scores = pipelineResults.scores;
  const fairness_score = pipelineResults.fairness_score ?? 0;
  const decision = pipelineResults.decision ?? "UNKNOWN";
  const recommendations = pipelineResults.recommendations ?? [];
  const chartData = [
    { name: "Data", score: scores.data_bias_score ?? 0 },
    { name: "Model", score: scores.model_bias_score ?? 0 },
    { name: "Proxy", score: scores.proxy_risk_score ?? 0 },
    { name: "Contrast", score: scores.counterfactual_score ?? 0 },
    { name: "Stress", score: scores.stress_test_score ?? 0 },
  ];

  const getScoreColor = (score: number) => {
    if (score < 50) return "#A24A46";
    if (score < 75) return "#C89D7C";
    return "#8FA89B";
  };

  const decisionConfig = {
    "HIGH RISK": {
      color: "#A24A46",
      icon: ShieldAlert,
      bg: "rgba(162, 74, 70, 0.1)",
      label: "High Risk",
    },
    "MODERATE RISK": {
      color: "#C89D7C",
      icon: AlertTriangle,
      bg: "rgba(200, 157, 124, 0.1)",
      label: "Moderate Risk",
    },
    "LOW RISK": {
      color: "#8FA89B",
      icon: CheckCircle2,
      bg: "rgba(143, 168, 155, 0.1)",
      label: "Low Risk",
    },
  };

  const config =
    decisionConfig[decision as keyof typeof decisionConfig] ||
    decisionConfig["MODERATE RISK"];
  const DecisionIcon = config.icon;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      style={{ maxWidth: 1240, margin: "0 auto", paddingBottom: 60 }}
    >
      <GuidedTour steps={DEFAULT_STEPS} tourKey="main-tour" />
      <motion.header
        variants={itemVariants}
        className="page-header"
        style={{ borderBottom: "none", paddingBottom: 0, marginBottom: 32 }}
      >
        <div>
          <div className="kicker">
            <Sparkles size={12} /> Audit Intelligence
          </div>
          <h1 className="page-title">Forensic Findings</h1>
          <p className="page-subtitle">
            Comprehensive fairness assessment across all eight forensic stages.
          </p>
        </div>
        <motion.div
          className="dashboard-decision-badge"
          style={{ borderColor: config.color, background: config.bg }}
          whileHover={{ scale: 1.02 }}
        >
          <DecisionIcon size={18} color={config.color} />
          <strong
            style={{
              color: config.color,
              letterSpacing: 1,
              fontSize: "0.78rem",
            }}
          >
            {decision}
          </strong>
        </motion.div>
      </motion.header>

      <motion.div variants={itemVariants} className="dashboard-hero">
        <motion.div
          className="dashboard-hero-score card"
          whileHover={{ y: -2, transition: { duration: 0.2 } }}
        >
          <div className="stat-label" style={{ marginBottom: 28 }}>
            Unified Fairness Score
            <HelpButton
              module="dashboard"
              metricName="fairness_score"
              metricValue={fairness_score}
            />
          </div>
          <div
            style={{
              position: "relative",
              display: "inline-block",
              margin: "0 auto",
            }}
          >
            <svg width="220" height="220" viewBox="0 0 100 100">
              <defs>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                stroke="rgba(255,255,255,0.04)"
                strokeWidth="4"
              />
              <motion.circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                stroke={getScoreColor(fairness_score)}
                strokeWidth="4"
                strokeDasharray="276"
                initial={{ strokeDashoffset: 276 }}
                animate={{ strokeDashoffset: 276 - fairness_score * 2.76 }}
                transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
                filter="url(#glow)"
              />
              <motion.circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                stroke={getScoreColor(fairness_score)}
                strokeWidth="2"
                strokeDasharray="276"
                initial={{ strokeDashoffset: 276 }}
                animate={{
                  strokeDashoffset: 276 - fairness_score * 2.76,
                  opacity: [0.3, 0.6, 0.3],
                }}
                transition={{
                  duration: 2,
                  ease: [0.16, 1, 0.3, 1],
                  opacity: { duration: 3, repeat: Infinity },
                }}
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
              />
            </svg>
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                textAlign: "center",
              }}
            >
              <motion.div
                className="dashboard-hero-number"
                style={{ color: getScoreColor(fairness_score) }}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                {Math.round(fairness_score)}
              </motion.div>
              <div className="stat-label" style={{ fontSize: "0.6rem" }}>
                Forensic Index
              </div>
            </div>
          </div>
          <p
            className="helper"
            style={{
              marginTop: 28,
              fontSize: "0.82rem",
              padding: "0 12px",
              maxWidth: 220,
            }}
          >
            Aggregate score across all eight forensic stages.
          </p>
        </motion.div>

        <div className="dashboard-hero-metrics card">
          <div className="dashboard-hero-header">
            <h3 className="section-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <TrendingUp size={14} />
              Forensic Metrics
              <HelpButton
                module="dashboard"
                metricName="forensic_metrics_overview"
              />
            </h3>
            <div className="pill" style={{ fontSize: "0.6rem" }}>
              Stages 1–5
            </div>
          </div>

          <div className="dashboard-metric-row">
            {[
              {
                label: "Data",
                score: scores.data_bias_score,
                icon: Search,
                to: "/workflow/step-3",
              },
              {
                label: "Model",
                score: scores.model_bias_score,
                icon: Target,
                to: "/workflow/step-4",
              },
              {
                label: "Proxy",
                score: scores.proxy_risk_score,
                icon: Fingerprint,
                to: "/workflow/step-2",
              },
              {
                label: "Contrast",
                score: scores.counterfactual_score,
                icon: Zap,
                to: "/workflow/step-6",
              },
              {
                label: "Stress",
                score: scores.stress_test_score,
                icon: Activity,
                to: "/workflow/step-7",
              },
            ].map((m, idx) => {
              const Icon = m.icon;
              return (
                <motion.button
                  key={m.label}
                  className="dashboard-metric-cell"
                  onClick={() => navigate(m.to)}
                  type="button"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + idx * 0.08 }}
                  whileHover={{ y: -3, borderColor: "var(--accent)" }}
                  whileTap={{ scale: 0.97 }}
                >
                  <Icon size={15} className="dashboard-metric-icon" />
                <div
                  className="dashboard-metric-score"
                  style={{ color: getScoreColor(m.score ?? 0) }}
                >
                  {m.score}
                </div>
                <div className="dashboard-metric-label">{m.label}</div>                </motion.button>
              );
            })}
          </div>

          <motion.div
            className="dashboard-chart"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 12, right: 0, left: 0, bottom: 0 }}
              >
                <Bar dataKey="score" radius={[3, 3, 0, 0]} barSize={50}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={getScoreColor(entry.score)}
                      fillOpacity={0.5}
                    />
                  ))}
                </Bar>
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.02)" }}
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: "0.78rem",
                    color: "var(--text-primary)",
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        </div>
      </motion.div>

      {comparisons.length > 1 && (
        <motion.section variants={itemVariants} className="card section-gap">
          <div
            className="section-title"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 28,
            }}
          >
            <History size={18} color="var(--accent)" />
            Audit History & Comparative Performance
          </div>
          <div className="grid-2" style={{ gap: 24 }}>
            <div className="card-inset">
              <div className="stat-label" style={{ marginBottom: 16 }}>
                Trend Analysis
              </div>
              <div style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={[...comparisons].reverse()}>
                    <defs>
                      <linearGradient id="fairnessGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="fairness_score"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      fill="url(#fairnessGrad)"
                      dot={{ fill: "var(--accent)", r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="accuracy"
                      stroke="var(--text-muted)"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: "0.78rem",
                        color: "var(--text-primary)",
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  marginTop: 16,
                  fontSize: "0.7rem",
                  color: "var(--text-muted)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      background: "var(--accent)",
                      borderRadius: "50%",
                    }}
                  /> Fairness
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      border: "1px dashed var(--text-muted)",
                      borderRadius: "50%",
                    }}
                  /> Accuracy
                </div>
              </div>
            </div>

            <div className="dashboard-history-table">
              <table className="table">
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Fairness</th>
                    <th>Accuracy</th>
                    <th>Decision</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisons.map((run, idx) => (
                    <motion.tr
                      key={run.run_id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      <td style={{ color: "var(--text-muted)" }}>#{run.run_id}</td>
                      <td
                        style={{
                          fontWeight: 600,
                          color: getScoreColor(run.fairness_score),
                        }}
                      >
                        {run.fairness_score}
                      </td>
                      <td>{Math.round((run.accuracy ?? 0) * 100)}%</td>
                      <td>
                        <span
                          className={`pill ${run.decision === "LOW RISK" ? "green" : run.decision === "HIGH RISK" ? "red" : "yellow"}`}
                        >
                          {run.decision}
                        </span>
                      </td>
                      <td style={{ color: "var(--text-muted)" }}>
                        {new Date(run.timestamp).toLocaleDateString()}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.section>
      )}

      <motion.div variants={itemVariants}>
        <div
          className="card"
          style={{
            marginBottom: 24,
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span className="section-title" style={{ margin: 0, marginRight: 12 }}>
            <Zap size={13} style={{ marginRight: 6 }} />
            Quick Actions
          </span>
          <motion.button
            className="btn btn-small"
            onClick={() => tour.startTour()}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Play size={13} /> Guided Tour
          </motion.button>
          <motion.button
            className="btn btn-small"
            onClick={() => navigate("/compliance")}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Shield size={13} /> Compliance
          </motion.button>
          <motion.button
            className="btn btn-small"
            onClick={() => navigate("/versions")}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <GitCompare size={13} /> Version History
          </motion.button>
          <motion.button
            className="btn btn-small"
            disabled={!pipelineResults}
            onClick={() =>
              pipelineResults && downloadAuditReport(pipelineResults)
            }
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <History size={13} /> Export Report
          </motion.button>
        </div>
      </motion.div>

      <motion.section variants={itemVariants} className="card">
        <div
          className="section-title"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 28,
          }}
        >
          <Brain size={16} color="var(--accent)" />
          Remediation Insights
        </div>
        <div className="stack stack-md">
          {recommendations && recommendations.length > 0 ? (
            <AnimatePresence mode="wait">
              {recommendations.map((rec, i: number) => {
                const issue = (rec as { issue?: string }).issue;
                const description = (rec as { description?: string }).description;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="dashboard-recommendation"
                    whileHover={{ x: 4 }}
                  >
                    <div className="dashboard-recommendation-num">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div>
                      <div className="dashboard-recommendation-issue">
                        {issue || "Audit Insight"}
                      </div>
                      <div className="dashboard-recommendation-fix">
                        {description || "Continue monitoring."}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          ) : (
            <motion.p
              className="helper"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ padding: "12px 0" }}
            >
              No critical recommendations found. Your model shows strong
              alignment with fairness goals.
            </motion.p>
          )}
        </div>
        {recommendations && recommendations.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            style={{
              marginTop: 28,
              paddingTop: 24,
              borderTop: "1px solid var(--border-faint)",
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <motion.button
              type="button"
              className="btn"
              onClick={() => navigate("/workflow/step-8")}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Open in Sandbox
              <ArrowRight size={15} />
            </motion.button>
            <motion.button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                pipelineResults && downloadAuditReport(pipelineResults)
              }
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <History size={14} /> Export Audit Report
            </motion.button>
          </motion.div>
        )}
      </motion.section>
    </motion.div>
  );
}
