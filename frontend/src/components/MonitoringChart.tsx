import { Line, ComposedChart, ReferenceLine, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Area, Legend, Dot } from 'recharts';

type EventPoint = {
  timestamp: string;
  fairness_score: number;
  alert: boolean;
  note?: string;
  group_breakdown?: Record<string, Record<string, number>>;
};

type IncidentMarker = {
  timestamp: string;
  label: string;
  type: 'incident' | 'drift' | 'flag';
};

interface MonitoringChartProps {
  events: EventPoint[];
  viewMode: 'overall' | 'group';
  incidents?: IncidentMarker[];
  onDotClick?: (event: EventPoint) => void;
}

const CustomDot = (props: any) => {
  const { cx, cy, payload, onDotClick } = props;
  if (!payload.alert) return null;
  return (
    <g onClick={() => onDotClick?.(payload)} style={{ cursor: 'pointer' }}>
      <circle cx={cx} cy={cy} r={8} fill="rgba(239,68,68,0.25)" stroke="none" />
      <circle cx={cx} cy={cy} r={4} fill="#ef4444" stroke="#fff" strokeWidth={1.5} />
    </g>
  );
};

export default function MonitoringChart({ events, viewMode, incidents = [], onDotClick }: MonitoringChartProps) {
  const groupLines: string[] = [];
  const transformedData = events.map(event => {
    const point: any = { ...event };
    if (event.group_breakdown) {
      Object.entries(event.group_breakdown).forEach(([attr, values]) => {
        Object.entries(values).forEach(([val, rate]) => {
          const key = `${attr}: ${val}`;
          point[key] = Math.round(rate * 100);
          if (!groupLines.includes(key)) groupLines.push(key);
        });
      });
    }
    return point;
  });

  const colors = ['#4f8ef7', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#f43f5e'];

  // Find alert zones (consecutive alerts)
  const alertZones: { start: string; end: string }[] = [];
  let zoneStart: string | null = null;
  events.forEach((e, i) => {
    if (e.alert && !zoneStart) zoneStart = e.timestamp;
    if (!e.alert && zoneStart) {
      alertZones.push({ start: zoneStart, end: events[i - 1].timestamp });
      zoneStart = null;
    }
  });
  if (zoneStart) alertZones.push({ start: zoneStart, end: events[events.length - 1].timestamp });

  return (
    <div style={{ width: '100%', height: 340 }}>
      <ResponsiveContainer>
        <ComposedChart data={viewMode === 'overall' ? events : transformedData}>
          <defs>
            <linearGradient id="monitorGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#4f8ef7" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#4f8ef7" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="alertZoneGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
          <XAxis dataKey="timestamp" tick={{ fill: '#8b9ab3', fontSize: 11 }} tickFormatter={(val) => new Date(val).toLocaleDateString([], { month: 'short', day: 'numeric' })} />
          <YAxis domain={[0, 100]} tick={{ fill: '#8b9ab3', fontSize: 12 }} />
          <Tooltip
            contentStyle={{ background: '#161b24', border: '1px solid #2a3347', borderRadius: 12, color: '#f0f4ff' }}
            labelFormatter={(val) => new Date(val).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
            formatter={(value: any, name: string) => {
              if (name === 'Overall Fairness') return [`${value}`, name];
              return [typeof value === 'number' ? `${value}%` : value, name];
            }}
          />
          <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '0.85rem', color: '#8b9ab3' }} />

          {/* Alert zones */}
          {viewMode === 'overall' && alertZones.map((zone, i) => (
            <ReferenceArea key={`zone-${i}`} x1={zone.start} x2={zone.end} fill="rgba(239,68,68,0.08)" stroke="none" />
          ))}

          {/* Incident reference lines */}
          {viewMode === 'overall' && incidents.filter(m => m.type === 'incident').map((m, i) => (
            <ReferenceLine key={`inc-${i}`} x={m.timestamp} stroke="#ef4444" strokeDasharray="6 4" strokeWidth={1.5} label={{ value: '⚠', position: 'top', fill: '#ef4444', fontSize: 14 }} />
          ))}

          {/* Drift reference lines */}
          {viewMode === 'overall' && incidents.filter(m => m.type === 'drift').map((m, i) => (
            <ReferenceLine key={`drift-${i}`} x={m.timestamp} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: '↕', position: 'top', fill: '#f59e0b', fontSize: 14 }} />
          ))}

          {/* Threshold line */}
          {viewMode === 'overall' && (
            <ReferenceLine y={70} stroke="rgba(34,197,94,0.4)" strokeDasharray="8 6" label={{ value: 'Fair threshold', position: 'right', fill: '#22c55e', fontSize: 11 }} />
          )}

          {viewMode === 'overall' ? (
            <>
              <Area type="monotone" dataKey="fairness_score" stroke="transparent" fill="url(#monitorGradient)" />
              <Line
                name="Overall Fairness"
                type="monotone"
                dataKey="fairness_score"
                stroke="#4f8ef7"
                strokeWidth={3}
                dot={<CustomDot onDotClick={onDotClick} />}
                activeDot={{ r: 6, fill: '#4f8ef7', stroke: '#fff', strokeWidth: 2 }}
              />
            </>
          ) : (
            groupLines.map((key, i) => (
              <Line
                key={key}
                name={key}
                type="monotone"
                dataKey={key}
                stroke={colors[i % colors.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
