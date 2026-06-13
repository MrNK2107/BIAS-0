import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import MonitoringChart from "../../components/MonitoringChart";
import MonitoringStatsRow from "../../components/MonitoringStatsRow";
import MonitoringTimeline from "../../components/MonitoringTimeline";
import { useAppContext } from "../../context/AppContext";
import { useToast } from "../../context/ToastContext";
import { formApi, api } from "../../api/client";
import { AlertTriangle, CheckCircle, Activity, Zap } from "lucide-react";
import type { FairnessFlag } from "../../types";
import EmptyState from "../../components/EmptyState";

interface DriftReportData {
  drift_alert?: boolean;
  drift_message?: string;
  root_cause?: Array<{ feature: string; change: number }>;
  affected_groups?: string[];
  recommended_actions?: string[];
  status?: string;
  predicted_fairness?: number;
  drift_results?: {
    drift_alert?: boolean;
    drift_message?: string;
    root_cause?: Array<{ feature: string; change: number }>;
  };
}
interface MonitorData {
  drift_detected: boolean;
  trend?: Array<{ score: number; timestamp?: string }>;
}
interface TrendData {
  degradation_detected: boolean;
  stability_score: number;
  trend?: string;
}

const S: Record<string, React.CSSProperties> = {
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 22,
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 380px",
    gap: 24,
    alignItems: "start",
  },
  leftCol: { display: "flex", flexDirection: "column", gap: 24 },
  driftBox: { display: "flex", gap: 16, alignItems: "flex-start" },
};

export default function Step9Monitoring() {
  const {
    file,
    sensitiveCols,
    targetCol,
    monitoringResult,
    getMonitoringData,
    runMonitoringSimulation,
    projectId,
  } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [driftFile, setDriftFile] = useState<File | null>(null);
  const [simFile, setSimFile] = useState<File | null>(null);
  const [driftReport, setDriftReport] = useState<DriftReportData | null>(null);
  const [driftLoading, setDriftLoading] = useState(false);
  const [flags, setFlags] = useState<FairnessFlag[]>([]);
  const [viewMode, setViewMode] = useState<"overall" | "group">("overall");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [monitorData, setMonitorData] = useState<MonitorData | null>(null);
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const fetchFlags = useCallback(async () => {
    try {
      const r = await api.get(`/monitoring/flags/${projectId}`);
      setFlags(r.data);
    } catch (err) {
      console.warn("Failed to fetch flags:", err);
    }
  }, [projectId]);
  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);
  const resolveFlag = async (id: number) => {
    try {
      await api.patch(`/monitoring/flag/${id}`);
      fetchFlags();
      showToast("Flag resolved successfully.", "success");
    } catch (err) {
      console.warn("Failed to resolve flag:", err);
      showToast("Could not resolve flag.", "error");
    }
  };

  const fetchMonitorData = useCallback(async () => {
    if (projectId) {
      try {
        const [mon, trn] = await Promise.all([
          api.get(`/monitoring/project/${projectId}/monitor`),
          api.get(`/monitoring/project/${projectId}/trend`),
        ]);
        setMonitorData(mon.data);
        setTrendData(trn.data);
      } catch (err) {
        console.warn("Failed to fetch monitoring data:", err);
      }
    }
  }, [projectId]);
  useEffect(() => {
    fetchMonitorData();
  }, [fetchMonitorData, monitoringResult]);

  const runDriftCheck = async () => {
    if (!driftFile || !file) return;
    setDriftLoading(true);
    const fd = new FormData();
    fd.append("project_id", projectId ?? "");
    fd.append("baseline_file", file);
    fd.append("current_file", driftFile);
    fd.append("sensitive_cols", sensitiveCols.join(","));
    fd.append("target_col", targetCol);
    try {
      const r = await formApi.post("/monitoring/drift", fd);
      setDriftReport(r.data);
    } finally {
      setDriftLoading(false);
    }
  };

  useEffect(() => {
    if (!monitoringResult && !loading) {
      setLoading(true);
      getMonitoringData().finally(() => setLoading(false));
    }
  }, [monitoringResult, loading, getMonitoringData]);

  const handleSimulate = useCallback(async () => {
    setSimulating(true);
    await runMonitoringSimulation();
    setSimulating(false);
  }, [runMonitoringSimulation]);

  // NOTE: Auto-simulate was removed because it silently destroys existing monitoring data.
  // Users must click the "Simulate Monitoring Data" button explicitly.

  const handleLiveIngestion = async () => {
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const rows = lines.slice(1);
    const chunkSize = Math.ceil(rows.length / 5);
    for (let i = 0; i < 5; i++) {
      const chunk = rows.slice(i * chunkSize, (i + 1) * chunkSize);
      const predictions = chunk.map((r) => {
        const [record_id, prediction, sensitive_attrs, timestamp] =
          r.split(",");
        let attrs: Record<string, unknown>;
        try {
          attrs = JSON.parse(sensitive_attrs);
        } catch {
          attrs = {};
        }
        return {
          record_id: Number(record_id),
          prediction: Number(prediction),
          sensitive_attrs: attrs,
          timestamp,
        };
      });
      await api.post("/monitoring/ingest", {
        project_id: projectId ?? "0",
        predictions,
      });
      await getMonitoringData();
      await new Promise((r) => setTimeout(r, 500));
    }
  };

  const chartIncidents = (monitoringResult?.events ?? [])
    .filter((e) => e.alert)
    .map((e) => ({
      timestamp: e.timestamp,
      label: "Incident",
      type: "incident" as const,
    }));

  // No file guard — allow viewing if monitoring data already exists
  if (!file && !monitoringResult && !loading) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="kicker">Step 9 of 9</div>
            <h1 className="page-title">Continuous Monitoring</h1>
          </div>
        </div>
        <EmptyState
          compact
          kicker="Step 9"
          title="No dataset uploaded"
          description="Upload a CSV in Step 1 to start tracking fairness over time and detect drift."
          primaryAction={{ label: "Go to Upload", to: "/workflow/step-1" }}
        />
      </div>
    );
  }

  // Loading guard
  if (loading || !monitoringResult) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="kicker">Step 9 of 9</div>
            <h1 className="page-title">Continuous Monitoring</h1>
          </div>
        </div>
        <EmptyState
          compact
          kicker="Step 9"
          title="Loading monitoring data..."
          description="Fetching historical performance and tracking alerts. This should only take a moment."
        />
      </div>
    );
  }

  const {
    events,
    current_risk_level: riskLevel,
    trend,
  } = monitoringResult ?? {};
  const status = riskLevel || "Green";
  const current = events?.[events.length - 1] || {
    fairnessScore: 0,
    alert: false,
  };
  const driftDetected = monitorData?.drift_detected;
  const degradationDetected = trendData?.degradation_detected;

  return (
    <div>
      {(driftDetected || degradationDetected) && (
        <div
          style={{
            background: "rgba(162, 74, 70,0.15)",
            border: "1px solid #bc4749",
            borderRadius: 12,
            padding: "12px 20px",
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <AlertTriangle color="#bc4749" size={24} />
          <div>
            <strong style={{ color: "#bc4749", fontSize: "1.05rem" }}>
              {degradationDetected
                ? "Sequential Performance Degradation"
                : "Critical Score Drift Detected"}
            </strong>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: "0.88rem",
                color: "var(--text-secondary)",
              }}
            >
              {degradationDetected
                ? "The fairness score has dropped consistently over the last 3 runs. Investigate recent model or data changes."
                : "The fairness score has dropped by more than 15% since the last monitoring check. Immediate audit recommended."}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={S.header}>
        <div>
          <div className="kicker">Step 9 of 9</div>
          <h1 className="page-title">Continuous Monitoring</h1>
          <p className="helper" style={{ marginTop: 8 }}>
            Track fairness over time. Detect drift. Investigate incidents.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="btn btn-secondary"
            onClick={handleLiveIngestion}
            disabled={simulating}
          >
            {simulating ? "Ingesting..." : "Simulate Live Ingestion"}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSimulate}
            disabled={simulating}
          >
            <Zap size={16} />{" "}
            {simulating ? "Simulating..." : "Simulate 30 Days"}
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <MonitoringStatsRow
        fairnessScore={current.fairnessScore}
        trend={trend}
        alertCount={
          (monitoringResult?.events ?? []).filter((e) => e.alert).length
        }
        driftCount={driftReport?.drift_alert ? 1 : 0}
        stabilityScore={trendData?.stability_score}
        status={status}
        trendData={trendData}
      />

      {/* Main layout: chart + timeline */}
      <div style={S.mainGrid}>
        <div style={S.leftCol}>
          {/* Chart */}
          <div className="card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <div className="section-title" style={{ marginBottom: 0 }}>
                Fairness Score Over Time
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  background: "var(--surface-raised)",
                  padding: 4,
                  borderRadius: 8,
                  border: "0.5px solid var(--border)",
                }}
              >
                {(["overall", "group"] as const).map((m) => (
                  <button
                    key={m}
                    className={`btn btn-small ${viewMode === m ? "btn-primary" : ""}`}
                    style={{ padding: "6px 12px", fontSize: "0.82rem" }}
                    onClick={() => setViewMode(m)}
                  >
                    {m === "overall" ? "Overall Score" : "By Group"}
                  </button>
                ))}
              </div>
            </div>
            {events?.length > 0 ? (
              <MonitoringChart
                events={events ?? []}
                viewMode={viewMode}
                incidents={chartIncidents}
                onDotClick={(evt) => {
                  const idx = (events ?? []).findIndex(
                    (e) => e.timestamp === evt.timestamp,
                  );
                  if (idx >= 0) setSelectedEventId(`evt-${idx}`);
                }}
              />
            ) : (
              <div className="helper">No monitoring events recorded yet.</div>
            )}
          </div>

          {/* Drift Detection */}
          <div className="card">
            <div className="section-title">Data Drift Detection</div>
            <p className="helper" style={{ marginBottom: 16 }}>
              Compare recent production data against the baseline to detect
              distribution shifts.
            </p>
            <div style={S.driftBox}>
              <div style={{ flex: 1 }}>
                <input
                  type="file"
                  className="input"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setDriftFile(e.target.files?.[0] || null)
                  }
                  accept=".csv"
                />
                <button
                  className="btn btn-secondary"
                  style={{ marginTop: 12 }}
                  onClick={runDriftCheck}
                  disabled={!driftFile || driftLoading}
                >
                  <Activity size={14} />{" "}
                  {driftLoading ? "Analyzing..." : "Check for Drift"}
                </button>
              </div>
              {driftReport && (
                <div
                  style={{
                    flex: 1,
                    padding: 16,
                    borderRadius: 12,
                    border: `0.5px solid ${driftReport.drift_alert ? "rgba(162, 74, 70,0.45)" : "rgba(200, 157, 124,0.45)"}`,
                    background: driftReport.drift_alert
                      ? "rgba(162, 74, 70,0.1)"
                      : "rgba(200, 157, 124,0.1)",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      marginBottom: 8,
                      color: driftReport.drift_alert
                        ? "#ef4444"
                        : "var(--accent)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {driftReport.drift_alert ? (
                      <AlertTriangle size={16} />
                    ) : (
                      <CheckCircle size={16} />
                    )}
                    {driftReport.drift_alert
                      ? "Significant Drift Detected"
                      : "No Significant Drift"}
                  </div>
                  <div
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--text-secondary)",
                      marginBottom: 12,
                    }}
                  >
                    {driftReport.drift_message}
                  </div>

                  {driftReport.root_cause &&
                    driftReport.root_cause.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div
                          style={{
                            fontSize: "0.75rem",
                            textTransform: "uppercase",
                            letterSpacing: 1,
                            color: "var(--text-muted)",
                            marginBottom: 6,
                          }}
                        >
                          Top Drift Drivers
                        </div>
                        {driftReport.root_cause.map(
                          (
                            rc: { feature: string; change: number },
                            idx: number,
                          ) => (
                            <div
                              key={idx}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                fontSize: "0.8rem",
                                padding: "4px 0",
                              }}
                            >
                              <span>{rc.feature}</span>
                              <span style={{ fontWeight: 600 }}>
                                {(rc.change * 100).toFixed(1)}% shift
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                    )}

                  {driftReport.affected_groups &&
                    driftReport.affected_groups.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div
                          style={{
                            fontSize: "0.75rem",
                            textTransform: "uppercase",
                            letterSpacing: 1,
                            color: "var(--text-muted)",
                            marginBottom: 6,
                          }}
                        >
                          Potentially Impacted Groups
                        </div>
                        <div
                          style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
                        >
                          {driftReport.affected_groups.map(
                            (g: string, idx: number) => (
                              <span
                                key={idx}
                                className="pill yellow"
                                style={{ fontSize: "0.7rem" }}
                              >
                                {g}
                              </span>
                            ),
                          )}
                        </div>
                      </div>
                    )}

                  {driftReport.recommended_actions &&
                    driftReport.recommended_actions.length > 0 && (
                      <div
                        style={{
                          marginTop: 16,
                          paddingTop: 12,
                          borderTop: "1px solid rgba(255,255,255,0.05)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.75rem",
                            textTransform: "uppercase",
                            letterSpacing: 1,
                            color: "var(--text-muted)",
                            marginBottom: 8,
                          }}
                        >
                          Next Steps
                        </div>
                        {driftReport.recommended_actions.map(
                          (action: string, idx: number) => (
                            <div
                              key={idx}
                              style={{
                                display: "flex",
                                gap: 8,
                                alignItems: "flex-start",
                                marginBottom: 6,
                              }}
                            >
                              <div
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: "50%",
                                  background: "var(--accent)",
                                  marginTop: 6,
                                  flexShrink: 0,
                                }}
                              />
                              <div
                                style={{ fontSize: "0.85rem", color: "#fff" }}
                              >
                                {action}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                </div>
              )}
            </div>
          </div>

          {/* What-if Simulation Sandbox */}
          <div className="card">
            <div className="section-title">What-if Fairness Sandbox</div>
            <p className="helper" style={{ marginBottom: 16 }}>
              Upload a potential future dataset to simulate drift and predict
              fairness impacts without affecting your production logs.
            </p>
            <div style={S.driftBox}>
              <div style={{ flex: 1 }}>
                <input
                  type="file"
                  className="input"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setSimFile(e.target.files?.[0] || null)
                  }
                  accept=".csv"
                />
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 12 }}
                  onClick={async () => {
                    if (!simFile) return;
                    setDriftLoading(true);
                    const fd = new FormData();
                    fd.append("file", simFile);
                    try {
                      const r = await formApi.post(
                        `/monitoring/project/${projectId}/simulate-data`,
                        fd,
                      );
                      setDriftReport(r.data);
                    } finally {
                      setDriftLoading(false);
                    }
                  }}
                  disabled={!simFile || driftLoading}
                >
                  <Activity size={14} />{" "}
                  {driftLoading ? "Simulating..." : "Run Simulation"}
                </button>
              </div>
              {driftReport && driftReport.status === "simulation_complete" && (
                <div
                  style={{
                    flex: 1,
                    padding: 16,
                    borderRadius: 12,
                    border: `0.5px solid ${driftReport.drift_results?.drift_alert ? "rgba(162, 74, 70,0.45)" : "rgba(200, 157, 124,0.45)"}`,
                    background: driftReport.drift_results?.drift_alert
                      ? "rgba(162, 74, 70,0.1)"
                      : "rgba(200, 157, 124,0.1)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        color: driftReport.drift_results?.drift_alert
                          ? "#ef4444"
                          : "var(--accent)",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      {driftReport.drift_results?.drift_alert ? (
                        <AlertTriangle size={16} />
                      ) : (
                        <CheckCircle size={16} />
                      )}
                      Simulation Result
                    </div>
                    <div
                      className="pill"
                      style={{
                        background: "var(--bg)",
                        color: "var(--accent)",
                        fontWeight: 800,
                      }}
                    >
                      Pred. Fairness: {driftReport.predicted_fairness}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--text-secondary)",
                      marginBottom: 12,
                    }}
                  >
                    {driftReport.drift_results?.drift_message}
                  </div>

                  {(driftReport.drift_results?.root_cause?.length ?? 0) > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          textTransform: "uppercase",
                          letterSpacing: 1,
                          color: "var(--text-muted)",
                          marginBottom: 6,
                        }}
                      >
                        Predicted Drift Drivers
                      </div>
                      {driftReport.drift_results?.root_cause?.map(
                        (
                          rc: { feature: string; change: number },
                          idx: number,
                        ) => (
                          <div
                            key={idx}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: "0.8rem",
                              padding: "4px 0",
                            }}
                          >
                            <span>{rc.feature}</span>
                            <span style={{ fontWeight: 600 }}>
                              {(rc.change * 100).toFixed(1)}% shift
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Timeline sidebar */}
        <MonitoringTimeline
          events={monitoringResult?.events}
          flags={flags}
          driftReport={driftReport}
          selectedEventId={selectedEventId}
          filterType={filterType}
          onSelectEvent={setSelectedEventId}
          onFilterChange={setFilterType}
          onResolveFlag={resolveFlag}
        />
      </div>


    </div>
  );
}
