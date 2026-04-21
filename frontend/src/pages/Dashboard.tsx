import { ArrowRight, RefreshCcw, Shield, Sparkles } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Link } from 'react-router-dom';
import ScoreGauge from '../components/ScoreGauge';
import { useAppContext } from '../context/AppContext';

export default function Dashboard() {
  const { 
    file, 
    domain, 
    biasResult, 
    counterfactualResult, 
    stressResult, 
    recommendResult, 
    monitoringResult 
  } = useAppContext();

  // Compute metrics from context or use fallbacks
  const fairnessScore = biasResult?.fairness_score ?? 0;
  const accuracy = biasResult?.overall_accuracy ? `${(biasResult.overall_accuracy * 100).toFixed(1)}%` : '-';
  const demographicParity = biasResult?.metrics?.demographic_parity_difference ? Number(biasResult.metrics.demographic_parity_difference).toFixed(2) : '-';
  
  // Flip rate from counterfactual
  const flipRate = counterfactualResult?.flip_rate ? `${(counterfactualResult.flip_rate * 100).toFixed(1)}%` : '-';
  
  // Stress fragility
  const stressFragility = stressResult ? (
    stressResult.overall_robustness < 0.7 ? 'High' : 
    stressResult.overall_robustness < 0.9 ? 'Medium' : 'Low'
  ) : '-';

  // Recommendations
  const recommendations = recommendResult ? recommendResult.slice(0, 3).map((r: any) => r.description) : [];

  // Monitoring trend
  const trendData = monitoringResult?.events 
    ? monitoringResult.events.slice(-10).map((e: any, i: number) => ({ x: i + 1, value: e.fairness_score }))
    : [];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="kicker">Fairness Assurance Platform</div>
          <h1 className="page-title">Build fair and responsible AI systems</h1>
          <p className="page-subtitle">Detect, analyze, and fix bias in datasets and models, then track fairness after deployment.</p>
        </div>
        <div className="top-actions">
          <Link className="btn" to="/upload"><RefreshCcw size={16} /> New Audit</Link>
          <Link className="btn btn-primary" to="/bias-report" style={{ opacity: file ? 1 : 0.5 }}><ArrowRight size={16} /> View Bias Report</Link>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="section-title">Project</div>
          <div className="stat-number">{file ? file.name : 'No Active Project'}</div>
          <div className="helper">Domain: {domain}</div>
        </div>
        <div className="card">
          <div className="section-title">Fairness Score</div>
          <ScoreGauge score={fairnessScore} />
        </div>
        <div className="card">
          <div className="section-title">Monitoring Trend</div>
          <div style={{ height: 180 }}>
            {trendData.length > 0 ? (
              <ResponsiveContainer>
                <LineChart data={trendData}>
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="#4f8ef7" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-color)' }}>
                {file ? <Link to="/monitoring" style={{ color: 'var(--accent)' }}>Run monitoring simulation</Link> : 'No data'}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        {[
          ['Accuracy', accuracy],
          ['Demographic Parity Gap', demographicParity],
          ['Flip Rate', flipRate],
          ['Stress Fragility', stressFragility],
        ].map(([label, value]) => (
          <div className="card" key={label}>
            <div className="section-title">{label}</div>
            <div className="stat-number">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="section-title">Top recommendations</div>
          <div className="notice-list">
            {recommendations.length > 0 ? recommendations.map((text: string) => (
              <div className="notice" key={text}>
                <Sparkles size={14} style={{ display: 'inline', marginRight: 8, color: 'var(--accent)' }} />
                {text}
              </div>
            )) : (
              <div className="helper">No recommendations yet.</div>
            )}
          </div>
        </div>
        <div className="card">
          <div className="section-title">Quick actions</div>
          <div className="top-actions">
            <Link className="btn" to="/audit-report" style={{ pointerEvents: file ? 'auto' : 'none', opacity: file ? 1 : 0.5 }}><Shield size={16} /> View Audit</Link>
            <Link className="btn" to="/sandbox" style={{ pointerEvents: file ? 'auto' : 'none', opacity: file ? 1 : 0.5 }}><ArrowRight size={16} /> Open Sandbox</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
