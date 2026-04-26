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
      <circle cx={cx} cy={cy} r={10} fill="rgba(188,71,73,0.22)" stroke="none" />
      <circle cx={cx} cy={cy} r={4} fill="#BC4749" stroke="#F1F1F1" strokeWidth={1.5} />
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

  const colors = ['#D4A373', '#BC4749', '#E8C6A0', '#A56C40', '#9F3E40', '#F1F1F1', '#CDA47A', '#7F848A'];

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
              <stop offset="0%" stopColor="#D4A373" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#D4A373" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="alertZoneGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#BC4749" stopOpacity={0.14} />
              <stop offset="100%" stopColor="#BC4749" stopOpacity={0.03} />
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
            <ReferenceArea key={`zone-${i}`} x1={zone.start} x2={zone.end} fill="rgba(188,71,73,0.1)" stroke="none" />
          ))}

          {/* Incident reference lines */}
          {viewMode === 'overall' && incidents.filter(m => m.type === 'incident').map((m, i) => (
            <ReferenceLine key={`inc-${i}`} x={m.timestamp} stroke="#BC4749" strokeDasharray="6 4" strokeWidth={1.5} label={{ value: '⚠', position: 'top', fill: '#BC4749', fontSize: 14 }} />
          ))}

          {/* Drift reference lines */}
          {viewMode === 'overall' && incidents.filter(m => m.type === 'drift').map((m, i) => (
            <ReferenceLine key={`drift-${i}`} x={m.timestamp} stroke="#BC4749" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: '↕', position: 'top', fill: '#BC4749', fontSize: 14 }} />
          ))}

          {/* Threshold line */}
          {viewMode === 'overall' && (
            <ReferenceLine y={70} stroke="rgba(212,163,115,0.45)" strokeDasharray="8 6" label={{ value: 'Fair threshold', position: 'right', fill: '#D4A373', fontSize: 11 }} />
          )}

          {viewMode === 'overall' ? (
            <>
              <Area type="monotone" dataKey="fairness_score" stroke="transparent" fill="url(#monitorGradient)" />
              <Line
                name="Overall Fairness"
                type="monotone"
                dataKey="fairness_score"
                stroke="#D4A373"
                strokeWidth={3}
                dot={<CustomDot onDotClick={onDotClick} />}
                activeDot={{ r: 7, fill: '#D4A373', stroke: '#F1F1F1', strokeWidth: 2 }}
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
