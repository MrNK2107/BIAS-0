import { useMemo } from "react";
import {
  AlertTriangle,
  Flag,
  Activity,
  Info,
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import HelpButton from "./HelpButton";
import type { FairnessFlag } from "../types";

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

interface MonitoringEvent {
  timestamp: string;
  fairnessScore: number;
  alert: boolean;
  note?: string;
  group_breakdown?: Record<string, Record<string, number>>;
}

interface TimelineEvent {
  id: string;
  timestamp: number;
  dateStr: string;
  type: string;
  title: string;
  description: string;
  fairness_score?: number;
  details: Record<string, unknown>;
}

interface TimelineProps {
  events: MonitoringEvent[] | undefined;
  flags: FairnessFlag[];
  driftReport: DriftReportData | null;
  selectedEventId: string | null;
  filterType: string;
  onSelectEvent: (id: string | null) => void;
  onFilterChange: (type: string) => void;
  onResolveFlag: (id: number) => void;
}

const COLORS: Record<string, string> = {
  alert: "#A24A46",
  drift_alert: "#A24A46",
  flag: "#C89D7C",
  info: "#C89D7C",
};

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ICONS: Record<string, React.ReactNode> = {
  alert: <AlertTriangle size={13} color="#fff" />,
  drift_alert: <Activity size={13} color="#fff" />,
  flag: <Flag size={13} color="#fff" />,
  info: <Info size={13} color="#fff" />,
};

const S = {
  tlCard: {
    maxHeight: 780,
    overflowY: "auto",
    padding: "20px 16px",
  } as React.CSSProperties,
  tlLine: {
    position: "relative",
    paddingLeft: 28,
    marginLeft: 14,
    borderLeft: "1px solid var(--border)",
  } as React.CSSProperties,
  tlNode: {
    position: "absolute",
    left: -37,
    top: 0,
    width: 24,
    height: 24,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 0 0 4px var(--bg)",
  } as React.CSSProperties,
  tlContent: {
    cursor: "pointer",
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid transparent",
    transition: "all 0.2s",
  } as React.CSSProperties,
  tlContentSel: {
    backgroundColor: "rgba(79,142,247,0.06)",
    border: "1px solid rgba(79,142,247,0.2)",
  } as React.CSSProperties,
  tlTitle: {
    fontWeight: 600,
    color: "#f0f4ff",
    fontSize: "0.92rem",
  } as React.CSSProperties,
  tlDate: {
    fontSize: "0.78rem",
    color: "var(--text-secondary)",
  } as React.CSSProperties,
  tlDesc: {
    fontSize: "0.85rem",
    color: "var(--text-secondary)",
    marginTop: 4,
  } as React.CSSProperties,
  detail: {
    marginTop: 10,
    marginLeft: 12,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    border: "0.5px solid var(--border)",
    fontSize: "0.88rem",
    color: "var(--text-primary)",
    animation: "fadeIn 0.2s ease-out",
  } as React.CSSProperties,
  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "5px 0",
    borderBottom: "0.5px solid var(--border)",
  } as React.CSSProperties,
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 10px",
    borderRadius: 999,
    fontSize: "0.72rem",
    fontWeight: 600,
  } as React.CSSProperties,
};

export default function MonitoringTimeline({
  events,
  flags,
  driftReport,
  selectedEventId,
  filterType,
  onSelectEvent,
  onFilterChange,
  onResolveFlag,
}: TimelineProps) {
  const timelineEvents = useMemo(() => {
    const all: TimelineEvent[] = [];
    const now = Date.now();
    const monEvents = events ?? [];
    monEvents.forEach((e, i) => {
      const ts = new Date(e.timestamp).getTime();
      all.push({
        id: `evt-${i}`,
        timestamp: ts,
        dateStr: formatTimestamp(ts),
        type: e.alert ? "alert" : "info",
        title: e.alert ? "Warning Incident Detected" : "Monitoring Check",
        description: e.alert
          ? `Fairness dropped to ${(e.fairnessScore ?? 0).toFixed(1)}`
          : `Score: ${(e.fairnessScore ?? 0).toFixed(1)}`,
        fairness_score: e.fairnessScore,
        details: e.group_breakdown as Record<string, unknown>,
      });
    });
    (flags as (FairnessFlag & { timestamp: string })[]).forEach((f) => {
      const ts = new Date(f.timestamp).getTime();
      all.push({
        id: `flag-${f.id}`,
        timestamp: ts,
        dateStr: formatTimestamp(ts),
        type: "flag",
        title: `Flagged Record #${f.record_id}`,
        description: `Reason: ${f.reason}`,
        details: { ...f } as Record<string, unknown>,
      });
    });
    if (driftReport) {
      all.push({
        id: "drift-latest",
        timestamp: now,
        dateStr: formatTimestamp(now),
        type: driftReport.drift_alert ? "drift_alert" : "info",
        title: driftReport.drift_alert
          ? "Drift Warning"
          : "Drift Check - Clear",
        description: driftReport.drift_message || "",
        details: driftReport as Record<string, unknown>,
      });
    }
    return all.sort((a, b) => b.timestamp - a.timestamp);
  }, [events, flags, driftReport]);

  const filteredEvents =
    filterType === "all"
      ? timelineEvents
      : timelineEvents.filter((e) => e.type === filterType);

  const filters = [
    { k: "all", l: "All" },
    { k: "alert", l: "Incidents" },
    { k: "drift_alert", l: "Drift" },
    { k: "flag", l: "Flags" },
    { k: "info", l: "Checks" },
  ];

  return (
    <div className="card" style={S.tlCard}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          paddingLeft: 8,
        }}
      >
        <div className="section-title" style={{ marginBottom: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <Clock size={16} />
          Event Timeline
          <HelpButton
            module="monitoring"
            metricName="event_timeline"
          />
        </div>
        <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
          {filteredEvents.length} events
        </span>
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          paddingLeft: 8,
          marginBottom: 20,
        }}
      >
        {filters.map((f) => (
          <button
            key={f.k}
            onClick={() => onFilterChange(f.k)}
            style={{
              ...S.badge,
              background:
                filterType === f.k
                  ? "rgba(79,142,247,0.15)"
                  : "rgba(255,255,255,0.04)",
              border: `0.5px solid ${filterType === f.k ? "rgba(200, 157, 124,0.65)" : "var(--border)"}`,
              color:
                filterType === f.k ? "var(--accent)" : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            {f.l}
          </button>
        ))}
      </div>

      {filteredEvents.length === 0 ? (
        <div className="helper" style={{ paddingLeft: 8 }}>
          No events match this filter.
        </div>
      ) : (
        <div style={S.tlLine}>
          {filteredEvents.map((ev, idx) => {
            const sel = selectedEventId === ev.id;
            const col = COLORS[ev.type] || "#3b82f6";
            return (
              <div
                key={ev.id}
                style={{
                  position: "relative",
                  marginBottom: idx === filteredEvents.length - 1 ? 0 : 28,
                }}
              >
                <div style={{ ...S.tlNode, backgroundColor: col }}>
                  {ICONS[ev.type]}
                </div>
                <div
                  style={{ ...S.tlContent, ...(sel ? S.tlContentSel : {}) }}
                  onClick={() => onSelectEvent(sel ? null : ev.id)}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div style={S.tlTitle}>{ev.title}</div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <span style={S.tlDate}>{ev.dateStr}</span>
                      {sel ? (
                        <ChevronUp size={14} color="var(--text-secondary)" />
                      ) : (
                        <ChevronDown size={14} color="var(--text-secondary)" />
                      )}
                    </div>
                  </div>
                  <div style={S.tlDesc}>{ev.description}</div>
                </div>

                {sel && (
                  <div style={S.detail}>
                    {ev.type === "flag" && (
                      <div>
                        <div style={{ marginBottom: 8 }}>
                          <strong>Flagged by:</strong>{" "}
                          {ev.details.flagged_by as string}
                        </div>
                        <button
                          className="btn btn-small"
                          onClick={() => onResolveFlag(ev.details.id as number)}
                          style={{ marginTop: 8 }}
                        >
                          <CheckCircle size={14} /> Mark Resolved
                        </button>
                      </div>
                    )}
                    {(ev.type === "drift_alert" ||
                      (ev.type === "info" && ev.title.includes("Drift"))) && (
                      <div>
                        {((ev.details.drifted_features as string[] | undefined)
                          ?.length ?? 0) > 0 && (
                          <div style={{ marginBottom: 10 }}>
                            <strong>Drifted features:</strong>{" "}
                            {(
                              ev.details.drifted_features as
                                | string[]
                                | undefined
                            )?.join(", ")}
                          </div>
                        )}
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>
                          Distribution Shifts:
                        </div>
                        {Object.entries(
                          (ev.details.sensitive_distribution_shift as
                            | Record<string, number>
                            | undefined) || {},
                        ).map(([col, shift]) => (
                          <div key={col} style={S.detailRow}>
                            <span>{col}</span>
                            <span
                              style={{
                                fontWeight: 600,
                                color: shift > 0.1 ? "#f59e0b" : "#22c55e",
                              }}
                            >
                              {(shift * 100).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(ev.type === "alert" || ev.type === "info") &&
                      !ev.title.includes("Drift") &&
                      ev.details && (
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: 8 }}>
                            Group Breakdown:
                          </div>
                          {Object.entries(ev.details).map(([attr, values]) => (
                            <div key={attr} style={{ marginBottom: 12 }}>
                              <div
                                style={{
                                  fontSize: "0.8rem",
                                  color: "var(--text-secondary)",
                                  marginBottom: 4,
                                  textTransform: "uppercase",
                                }}
                              >
                                {attr}
                              </div>
                              {Object.entries(
                                values as Record<string, number>,
                              ).map(([val, rate]) => (
                                <div key={val} style={S.detailRow}>
                                  <span>{val}</span>
                                  <span style={{ fontWeight: 600 }}>
                                    {(rate * 100).toFixed(1)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
