import { Shield, TrendingUp, TrendingDown, Activity } from "lucide-react";

interface StatsRowProps {
  fairnessScore: number;
  trend: string | undefined;
  alertCount: number;
  driftCount: number;
  stabilityScore: number | undefined;
  status: string;
  trendData?: {
    stability_score: number;
    degradation_detected: boolean;
    trend?: string;
  } | null;
}

const statCardStyle: React.CSSProperties = {
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const statLabelStyle: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "var(--text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.12em",
};

const statValStyle: React.CSSProperties = {
  fontSize: "1.8rem",
  fontWeight: 700,
  lineHeight: 1.1,
};

export default function MonitoringStatsRow({
  fairnessScore,
  trend,
  alertCount,
  driftCount,
  stabilityScore,
  status,
  trendData: _trendData,
}: StatsRowProps) {
  const trendIcon =
    trend === "improving" ? (
      <TrendingUp size={16} color="var(--accent)" />
    ) : trend === "declining" ? (
      <TrendingDown size={16} color="var(--warning)" />
    ) : (
      <Activity size={16} color="var(--text-secondary)" />
    );

  const trendColor =
    trend === "improving"
      ? "var(--accent)"
      : trend === "declining"
        ? "var(--warning)"
        : "var(--text-secondary)";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5,1fr)",
        gap: 16,
        marginBottom: 24,
      }}
    >
      <div className="card" style={statCardStyle}>
        <div style={statLabelStyle}>Current Score</div>
        <div
          style={{
            ...statValStyle,
            color: fairnessScore >= 70 ? "var(--accent)" : "var(--warning)",
          }}
        >
          {fairnessScore.toFixed(1)}
        </div>
        <div
          style={{
            fontSize: "0.82rem",
            color: "var(--text-secondary)",
            marginTop: 2,
          }}
        >
          out of 100
        </div>
      </div>
      <div className="card" style={statCardStyle}>
        <div style={statLabelStyle}>Trend</div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 4,
          }}
        >
          {trendIcon}
          <span
            style={{
              ...statValStyle,
              fontSize: "1.4rem",
              color: trendColor,
              textTransform: "capitalize",
            }}
          >
            {trend || "stable"}
          </span>
        </div>
      </div>
      <div className="card" style={statCardStyle}>
        <div style={statLabelStyle}>Incidents</div>
        <div
          style={{
            ...statValStyle,
            color: alertCount > 0 ? "var(--warning)" : "var(--accent)",
          }}
        >
          {alertCount}
        </div>
        <div
          style={{
            fontSize: "0.82rem",
            color: "var(--text-secondary)",
            marginTop: 2,
          }}
        >
          {driftCount} drift warning{driftCount !== 1 ? "s" : ""}
        </div>
      </div>
      <div className="card" style={statCardStyle}>
        <div style={statLabelStyle}>Stability Score</div>
        <div
          style={{
            ...statValStyle,
            color:
              (stabilityScore ?? 0) > 85 ? "var(--accent)" : "var(--warning)",
          }}
        >
          {stabilityScore ? stabilityScore.toFixed(1) : "--"}
        </div>
        <div
          style={{
            fontSize: "0.82rem",
            color: "var(--text-secondary)",
            marginTop: 2,
          }}
        >
          Reliability metric
        </div>
      </div>
      <div className="card" style={statCardStyle}>
        <div style={statLabelStyle}>Risk Status</div>
        <div style={{ marginTop: 6 }}>
          <span
            className={`pill ${status.toLowerCase()}`}
            style={{ fontSize: "1rem", padding: "6px 16px" }}
          >
            <Shield size={14} /> {status}
          </span>
        </div>
      </div>
    </div>
  );
}
