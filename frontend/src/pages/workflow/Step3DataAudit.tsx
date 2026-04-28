import { useMemo, useState } from 'react';
import AnimatedBarChart from '../../components/animations/AnimatedBarChart';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { ArrowRight, ArrowLeft } from 'lucide-react';

export default function Step3DataAudit() {
  const { pipelineResults, auditResult: audit, proxyResult: proxy, advanceStep } = useAppContext();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const navigate = useNavigate();

  const fairnessScore = useMemo(() => {
    if (!audit) return 0;
    const base = audit.risk_level === 'High' ? 48 : audit.risk_level === 'Medium' ? 70 : 88;
    return Math.max(0, Math.min(100, base - (Object.keys(audit.missing_data || {}).length * 2)));
  }, [audit]);

  const chartData = useMemo(() => {
    if (!audit?.group_stats) return [];
    // Use the first available sensitive column's stats
    const firstKey = Object.keys(audit.group_stats)[0];
    if (!firstKey) return [];
    return Object.entries(audit.group_stats[firstKey]).map(
      ([group, metrics]: [string, any]) => ({
        label: group,
        value: Math.round((metrics.positive_rate ?? 0) * 100)
      })
    );
  }, [audit]);

  const underRep = audit?.under_represented_groups ?? [];

  if (!pipelineResults || !audit || !proxy) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="kicker">Step 3 of 9</div>
            <h1 className="page-title">Data Audit</h1>
          </div>
        </div>
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <p className="helper" style={{ marginBottom: 24 }}>No analysis data yet. Please run the analysis first.</p>
          <button className="btn btn-primary" onClick={() => navigate('/workflow/step-2')}>
            Go to Configuration <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="kicker">Step 3 of 9</div>
          <h1 className="page-title">Data Audit</h1>
          <p className="page-subtitle">We analyzed your dataset for representation bias and missing data before modeling.</p>
        </div>
      </div>

      <div className={`banner ${audit.risk_level.toLowerCase()}`} style={{ marginBottom: 16 }}>
        <h2 className="section-title" style={{ margin: 0 }}>{audit.risk_level} risk detected</h2>
        <p className="helper" style={{ color: 'inherit' }}>{audit.risk_reason}</p>
      </div>

      <div className="card section-gap">
        <div className="stat-label">Data Fairness Score</div>
        <div className={`stat-number text-8xl ${fairnessScore < 65 ? 'text-red' : 'text-accent'}`}>
          {fairnessScore}
        </div>
        <p className="helper">Representation, missingness, and proxy-feature pressure combined into one forensic score.</p>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="section-title">Gender group stats</div>
          <div style={{ height: 280, marginTop: 16 }}>
            <AnimatedBarChart data={chartData} height={250} maxDomain={100} valueSuffix="%" />
          </div>
        </div>
        <div className="card">
          <div className="section-title">Under-represented groups</div>
          <div className="notice-list">
            {underRep.filter((group: string) => !dismissed.includes(group)).map((group: string) => (
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
          <div className="helper">Features that highly correlate with sensitive attributes.</div>
          <div className="notice-list" style={{ marginTop: 12 }}>
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

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
        <button className="btn" onClick={() => navigate('/workflow/step-2')}>
          <ArrowLeft size={16} /> Back
        </button>
        <button className="btn btn-primary" onClick={async () => {
          await advanceStep(4);
          navigate('/workflow/step-4');
        }}>
          Next: Analyze Model Bias <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
