import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { driftChartData, num, toneOf, type DriftSeries, type PeriodStatus } from "../../utils/assurance";

const DOT: Record<string, string> = {
  bad: "var(--verdict-bad)",
  warn: "var(--verdict-warn)",
  good: "var(--verdict-good)",
  muted: "var(--text-muted)",
};

interface Row {
  period: string;
  n: number;
  status: PeriodStatus;
  impact_ratio: number | null;
  band: [number, number] | null;
}

function DriftTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="az-tooltip">
      <div><b>{r.period}</b> · n={r.n}</div>
      {r.impact_ratio === null ? (
        <div>Not enough decisions per group</div>
      ) : (
        <div>
          Impact ratio {num(r.impact_ratio)} (95% CI {num(r.band?.[0])}–{num(r.band?.[1])})
        </div>
      )}
      <div style={{ color: DOT[toneOf(r.status)] }}>{r.status}</div>
    </div>
  );
}

export default function DriftChart({
  series,
  threshold,
  label,
  marker,
}: {
  series: DriftSeries;
  threshold: number;
  label: string;
  /** A detected change (e.g. a model version) drawn as a vertical rule at its period. */
  marker?: { period: string; label: string };
}) {
  const data = driftChartData(series.points);
  return (
    <div role="img" aria-label={label} style={{ width: "100%", height: 190 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="rgba(243,242,241,0.05)" vertical={false} />
          <XAxis
            dataKey="period"
            tick={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: "var(--font-mono)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            interval="preserveStartEnd"
            minTickGap={18}
          />
          <YAxis
            domain={[0.3, 1.05]}
            ticks={[0.4, 0.6, 0.8, 1.0]}
            tick={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: "var(--font-mono)" }}
            tickLine={false}
            axisLine={false}
            allowDataOverflow
          />
          <Tooltip content={<DriftTooltip />} cursor={{ stroke: "var(--border-strong)" }} />
          <Area
            type="linear"
            dataKey="band"
            stroke="none"
            fill="var(--accent)"
            fillOpacity={0.18}
            connectNulls={false}
            isAnimationActive={false}
          />
          <ReferenceLine y={threshold} stroke="var(--verdict-bad)" strokeDasharray="4 3" />
          {marker && (
            <ReferenceLine
              x={marker.period}
              stroke="var(--accent)"
              strokeWidth={1.2}
              label={{ value: marker.label, position: "insideTopLeft", fill: "var(--accent)", fontSize: 10, fontFamily: "var(--font-mono)" }}
            />
          )}
          <Line
            type="linear"
            dataKey="impact_ratio"
            stroke="var(--text-primary)"
            strokeWidth={1.6}
            connectNulls={false}
            isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; index?: number; payload?: Row }) => {
              const { cx, cy, index, payload } = props;
              if (cx === undefined || cy === undefined || !payload || payload.impact_ratio === null) {
                return <g key={`d-${index}`} />;
              }
              return <circle key={`d-${index}`} cx={cx} cy={cy} r={3.6} fill={DOT[toneOf(payload.status)]} stroke="none" />;
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
