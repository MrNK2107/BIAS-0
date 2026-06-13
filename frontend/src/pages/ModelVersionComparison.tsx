import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  History,
  TrendingUp,
  TrendingDown,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  RotateCcw,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { api } from "../api/client";
import { useToast } from "../context/ToastContext";
import EmptyState from "../components/EmptyState";
import HelpButton from "../components/HelpButton";

interface CompareRun {
  run_id: number;
  fairness_score: number;
  accuracy: number;
  decision: string;
  timestamp: string;
}

const getScoreColor = (score: number) => {
  if (score < 50) return "#A24A46";
  if (score < 75) return "#C89D7C";
  return "#8FA89B";
};

export default function ModelVersionComparison() {
  const { projectId, pipelineResults } = useAppContext();
  const [runs, setRuns] = useState<CompareRun[]>([]);
  const [selectedRuns, setSelectedRuns] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  useToast();

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    api
      .get(`/project/${projectId}/compare`)
      .then((res) => {
        const data = res.data as CompareRun[];
        setRuns(data);
        if (data.length >= 2) {
          setSelectedRuns([
            data[data.length - 2].run_id,
            data[data.length - 1].run_id,
          ]);
        } else if (data.length === 1) {
          setSelectedRuns([data[0].run_id]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId, pipelineResults]);

  const toggleRun = (id: number) => {
    setSelectedRuns((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const sortedRuns = [...runs].sort((a, b) => a.run_id - b.run_id);
  const selectedData = runs.filter((r) => selectedRuns.includes(r.run_id));

  if (!projectId) {
    return (
      <div style={{ maxWidth: 880, margin: "0 auto", paddingTop: 60 }}>
        <EmptyState
          icon={<History size={22} />}
          kicker="Version Comparison"
          title="Select a project to compare model versions"
          description="Run multiple audits on the same project to see how fairness scores change over time. Each audit is stored as a version."
          primaryAction={{ label: "Go to Dashboard", to: "/dashboard" }}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          paddingTop: 60,
          textAlign: "center",
        }}
      >
        <Activity
          size={36}
          className="animate-spin"
          style={{
            color: "var(--accent)",
            margin: "0 auto 20px",
            opacity: 0.5,
          }}
        />
        <p className="helper">Loading version history...</p>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div style={{ maxWidth: 880, margin: "0 auto", paddingTop: 60 }}>
        <div
          className="page-header"
          style={{ borderBottom: "none", paddingBottom: 0 }}
        >
          <div>
            <div className="kicker">Version Comparison</div>
            <h1 className="page-title">Audit History</h1>
            <p className="page-subtitle">
              Complete at least two audits to compare model versions and track
              fairness evolution.
            </p>
          </div>
        </div>
        <EmptyState
          icon={<RotateCcw size={22} />}
          kicker="No Versions Yet"
          title="Run multiple audits to track changes"
          description="Each time you run a full analysis, it's saved as a version. Compare versions to see how changes affect fairness."
          primaryAction={{ label: "Run First Audit", to: "/workflow/step-1" }}
        />
      </div>
    );
  }

  const diff =
    selectedData.length >= 2
      ? {
          fairness:
            selectedData[1].fairness_score - selectedData[0].fairness_score,
          accuracy:
            ((selectedData[1].accuracy ?? 0) -
              (selectedData[0].accuracy ?? 0)) *
            100,
        }
      : null;

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", paddingBottom: 60 }}>
      <header
        className="page-header"
        style={{ borderBottom: "none", paddingBottom: 0, marginBottom: 32 }}
      >
        <div>
          <div className="kicker">Model Versions</div>
          <h1 className="page-title">Version Comparison</h1>
          <p className="page-subtitle">
            Compare fairness metrics across audit runs. Select two versions
            below to see the diff.
          </p>
        </div>
        <div className="pill">
          <History size={14} />
          {runs.length} version{runs.length !== 1 ? "s" : ""}
        </div>
      </header>

      {/* Version selector chips */}
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 28 }}
      >
        {sortedRuns.map((run) => {
          const isSelected = selectedRuns.includes(run.run_id);
          return (
            <button
              key={run.run_id}
              onClick={() => toggleRun(run.run_id)}
              className={`btn btn-small ${isSelected ? "btn-primary" : ""}`}
              style={{
                padding: "6px 14px",
                fontSize: "0.78rem",
                opacity: selectedRuns.length >= 2 && !isSelected ? 0.6 : 1,
              }}
            >
              #{run.run_id}
              <span style={{ opacity: 0.6 }}>
                {new Date(run.timestamp).toLocaleDateString()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Diff Summary */}
      {selectedData.length >= 2 && diff && (
        <motion.div
          className="card card-primary"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ marginBottom: 24, padding: "24px 28px" }}
        >
          <div className="section-title" style={{ marginBottom: 16 }}>
            Version Delta
            <HelpButton
              module="versions"
              metricName="version_delta"
            />
          </div>
          <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
            <div>
              <div className="stat-label" style={{ marginBottom: 6 }}>
                Fairness Score Change
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "2.2rem",
                    fontWeight: 700,
                    color: diff.fairness >= 0 ? "#8FA89B" : "#A24A46",
                  }}
                >
                  {diff.fairness >= 0 ? "+" : ""}
                  {diff.fairness.toFixed(1)}
                </div>
                {diff.fairness >= 0 ? (
                  <TrendingUp size={22} color="#8FA89B" />
                ) : (
                  <TrendingDown size={22} color="#A24A46" />
                )}
              </div>
            </div>
            <div>
              <div className="stat-label" style={{ marginBottom: 6 }}>
                Accuracy Change
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "2.2rem",
                    fontWeight: 700,
                    color: diff.accuracy >= 0 ? "#8FA89B" : "#A24A46",
                  }}
                >
                  {diff.accuracy >= 0 ? "+" : ""}
                  {diff.accuracy.toFixed(1)}%
                </div>
                {diff.accuracy >= 0 ? (
                  <ArrowUpRight size={22} color="#8FA89B" />
                ) : (
                  <ArrowDownRight size={22} color="#A24A46" />
                )}
              </div>
            </div>
            <div>
              <div className="stat-label" style={{ marginBottom: 6 }}>
                Decision Change
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {selectedData[0].decision !== selectedData[1].decision ? (
                  <>
                    <span className="pill" style={{ fontSize: "0.7rem" }}>
                      {selectedData[0].decision}
                    </span>
                    <span style={{ color: "var(--text-muted)" }}>→</span>
                    <span
                      className="pill"
                      style={{
                        fontSize: "0.7rem",
                        borderColor:
                          selectedData[1].decision === "LOW RISK"
                            ? "rgba(143,168,155,0.4)"
                            : "rgba(162,74,70,0.4)",
                        color:
                          selectedData[1].decision === "LOW RISK"
                            ? "#8FA89B"
                            : "#A24A46",
                      }}
                    >
                      {selectedData[1].decision}
                    </span>
                  </>
                ) : (
                  <span className="pill green" style={{ fontSize: "0.7rem" }}>
                    No change
                  </span>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
          marginBottom: 24,
        }}
      >
        {/* Side-by-side score cards */}
        {selectedData.map((run, i) => (
          <motion.div
            key={run.run_id}
            className="card"
            initial={{ opacity: 0, x: i === 0 ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <div className="section-title" style={{ margin: 0 }}>
                Version #{run.run_id}
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {new Date(run.timestamp).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
              }}
            >
              <div
                style={{
                  textAlign: "center",
                  padding: "16px 8px",
                  background: "var(--surface-inset)",
                  borderRadius: 8,
                }}
              >
                <div className="stat-label" style={{ marginBottom: 6 }}>
                  Fairness
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "2rem",
                    fontWeight: 700,
                    color: getScoreColor(run.fairness_score),
                  }}
                >
                  {Math.round(run.fairness_score)}
                </div>
              </div>
              <div
                style={{
                  textAlign: "center",
                  padding: "16px 8px",
                  background: "var(--surface-inset)",
                  borderRadius: 8,
                }}
              >
                <div className="stat-label" style={{ marginBottom: 6 }}>
                  Accuracy
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "2rem",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                  }}
                >
                  {Math.round((run.accuracy ?? 0) * 100)}%
                </div>
              </div>
              <div
                style={{
                  textAlign: "center",
                  padding: "16px 8px",
                  background: "var(--surface-inset)",
                  borderRadius: 8,
                }}
              >
                <div className="stat-label" style={{ marginBottom: 6 }}>
                  Status
                </div>
                <div>
                  <span
                    className={`pill ${run.decision === "LOW RISK" ? "green" : run.decision === "HIGH RISK" ? "red" : "yellow"}`}
                    style={{ fontSize: "0.65rem" }}
                  >
                    {run.decision}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Full History Chart */}
      {runs.length >= 2 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div
            className="section-title"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <Activity size={16} color="var(--accent)" />
            Fairness Score History
          </div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={[...sortedRuns].map((r) => ({
                  name: `#${r.run_id}`,
                  fairness: r.fairness_score,
                  accuracy: (r.accuracy ?? 0) * 100,
                }))}
              >
                <defs>
                  <linearGradient id="areaFairness" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#C89D7C" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#C89D7C" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.04)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  stroke="var(--text-muted)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  stroke="var(--text-muted)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#141312",
                    border: "1px solid rgba(200,157,124,0.2)",
                    borderRadius: 12,
                    color: "#fff",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="fairness"
                  stroke="#C89D7C"
                  fill="url(#areaFairness)"
                  strokeWidth={2}
                  dot={{ r: 5, fill: "#C89D7C" }}
                />
                <Line
                  type="monotone"
                  dataKey="accuracy"
                  stroke="#DFB99B"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ r: 4, fill: "#DFB99B" }}
                />
                <Legend
                  formatter={(value: string) => (
                    <span
                      style={{
                        color: "var(--text-secondary)",
                        fontSize: "0.78rem",
                      }}
                    >
                      {value === "fairness" ? "Fairness Score" : "Accuracy (%)"}
                    </span>
                  )}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Runs Table */}
      <div className="card">
        <div className="section-title" style={{ marginBottom: 20 }}>
          All Audit Runs
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Date</th>
                <th>Fairness</th>
                <th>Accuracy</th>
                <th>Decision</th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {sortedRuns.map((run, idx) => {
                const prev = idx > 0 ? sortedRuns[idx - 1] : null;
                const trend = prev
                  ? run.fairness_score > prev.fairness_score
                    ? "up"
                    : run.fairness_score < prev.fairness_score
                      ? "down"
                      : "stable"
                  : "—";
                return (
                  <tr key={run.run_id}>
                    <td style={{ fontWeight: 600, color: "var(--accent)" }}>
                      #{run.run_id}
                    </td>
                    <td style={{ color: "var(--text-muted)" }}>
                      {new Date(run.timestamp).toLocaleDateString()}
                    </td>
                    <td
                      style={{
                        fontWeight: 700,
                        color: getScoreColor(run.fairness_score),
                      }}
                    >
                      {Math.round(run.fairness_score)}
                    </td>
                    <td>{Math.round((run.accuracy ?? 0) * 100)}%</td>
                    <td>
                      <span
                        className={`pill ${run.decision === "LOW RISK" ? "green" : run.decision === "HIGH RISK" ? "red" : "yellow"}`}
                        style={{ fontSize: "0.65rem" }}
                      >
                        {run.decision}
                      </span>
                    </td>
                    <td>
                      {trend === "up" && (
                        <TrendingUp size={15} color="#8FA89B" />
                      )}
                      {trend === "down" && (
                        <TrendingDown size={15} color="#A24A46" />
                      )}
                      {trend === "stable" && (
                        <Minus size={15} color="var(--text-muted)" />
                      )}
                      {trend === "—" && (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
