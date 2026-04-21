import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Area, ComposedChart } from 'recharts';

type EventPoint = {
  timestamp: string;
  fairness_score: number;
  alert: boolean;
  note?: string;
};

export default function MonitoringChart({ events }: { events: EventPoint[] }) {
  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer>
        <ComposedChart data={events}>
          <defs>
            <linearGradient id="monitorGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#4f8ef7" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#4f8ef7" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
          <XAxis dataKey="timestamp" tick={{ fill: '#8b9ab3', fontSize: 12 }} />
          <YAxis domain={[0, 100]} tick={{ fill: '#8b9ab3', fontSize: 12 }} />
          <Tooltip contentStyle={{ background: '#161b24', border: '1px solid #2a3347', borderRadius: 12, color: '#f0f4ff' }} />
          {events.filter((event) => event.alert).map((event) => (
            <ReferenceLine key={event.timestamp} x={event.timestamp} stroke="#ef4444" strokeDasharray="6 4" />
          ))}
          <Area type="monotone" dataKey="fairness_score" stroke="transparent" fill="url(#monitorGradient)" />
          <Line type="monotone" dataKey="fairness_score" stroke="#4f8ef7" strokeWidth={2.5} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
