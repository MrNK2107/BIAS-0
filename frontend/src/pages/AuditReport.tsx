import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';

export default function AuditReport() {
  const { auditResult: audit, proxyResult: proxy } = useAppContext();
  const [dismissed, setDismissed] = useState<string[]>([]);

  const chartData = useMemo(() => {
    if (!audit?.group_stats?.gender) return [];
    
    return Object.entries(audit.group_stats.gender).map(([group, metrics]: any) => ({ 
      group, 
      rate: Math.round((metrics.positive_rate || 0) * 100) 
    }));
  }, [audit]);

  if (!audit || !proxy) {
    return <div className="card">No audit data available. Please <Link to="/upload">upload a dataset</Link> first.</div>;
  }

  return (
    <div>
      <div className={`banner ${audit.risk_level.toLowerCase()}`} style={{ marginBottom: 16 }}>
        <h2 className="section-title" style={{ margin: 0 }}>{audit.risk_level} risk detected</h2>
        <p className="helper" style={{ color: 'inherit' }}>{audit.risk_reason}</p>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="section-title">Gender group stats</div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="group" tick={{ fill: '#8b9ab3' }} />
                <YAxis tick={{ fill: '#8b9ab3' }} />
                <Tooltip />
                <Bar dataKey="rate" fill="#4f8ef7" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="section-title">Under-represented groups</div>
          <div className="notice-list">
            {(audit.under_represented_groups || []).filter((group: string) => !dismissed.includes(group)).map((group: string) => (
              <div className="notice" key={group}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{group}</strong>
                  <button className="btn btn-ghost" onClick={() => setDismissed((current) => [...current, group])}>Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="section-title">Missing data</div>
          <table className="table">
            <thead><tr><th>Column</th><th>% Missing</th><th>Severity</th></tr></thead>
            <tbody>
              {Object.entries(audit.missing_data || {}).map(([column, value]: any) => (
                <tr key={column}>
                  <td>{column}</td>
                  <td>{(value * 100).toFixed(1)}%</td>
                  <td><span className={`pill ${value > 0.1 ? 'red' : value > 0.05 ? 'yellow' : 'green'}`}>{value > 0.1 ? 'High' : value > 0.05 ? 'Moderate' : 'Low'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="section-title">Proxy risk</div>
          <div className="notice-list">
            {proxy.proxy_features.map((feature: any) => (
              <div className="notice" key={feature.feature}>
                <strong>{feature.feature}</strong>
                <div className="helper">Correlated with {feature.correlated_with}</div>
                <div className="progress-track" style={{ margin: '10px 0' }}><div className="progress-fill" style={{ width: `${feature.proxy_score * 100}%` }} /></div>
                <div className="helper">{feature.warning}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Link className="btn btn-primary" to="/bias-report">Proceed to Bias Analysis</Link>
    </div>
  );
}
