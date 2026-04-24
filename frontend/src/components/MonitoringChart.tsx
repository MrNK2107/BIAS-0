import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Area, ComposedChart, Legend } from 'recharts';

type EventPoint = {
  timestamp: string;
  fairness_score: number;
  alert: boolean;
  note?: string;
  group_breakdown?: Record<string, Record<string, number>>;
};

export default function MonitoringChart({ events, viewMode }: { events: EventPoint[], viewMode: 'overall' | 'group' }) {
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

  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer>
        <ComposedChart data={viewMode === 'overall' ? events : transformedData}>
          <defs>
            <linearGradient id="monitorGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#4f8ef7" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#4f8ef7" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
          <XAxis dataKey="timestamp" tick={{ fill: '#8b9ab3', fontSize: 11 }} tickFormatter={(val) => new Date(val).toLocaleDateString([], {month:'short', day:'numeric'})} />
          <YAxis domain={[0, 100]} tick={{ fill: '#8b9ab3', fontSize: 12 }} />
          <Tooltip contentStyle={{ background: '#161b24', border: '1px solid #2a3347', borderRadius: 12, color: '#f0f4ff' }} />
          <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '0.85rem', color: '#8b9ab3' }} />
          {viewMode === 'overall' && events.filter((event) => event.alert).map((event) => (
            <ReferenceLine key={event.timestamp} x={event.timestamp} stroke="#ef4444" strokeDasharray="6 4" />
          ))}
          
          {viewMode === 'overall' ? (
            <>
              <Area type="monotone" dataKey="fairness_score" stroke="transparent" fill="url(#monitorGradient)" />
              <Line name="Overall Fairness" type="monotone" dataKey="fairness_score" stroke="#4f8ef7" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
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
