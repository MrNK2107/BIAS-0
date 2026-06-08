import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import {
  BarChart, Bar, Tooltip, ResponsiveContainer, Cell, LineChart, Line,
} from 'recharts';
import {
  AlertTriangle, CheckCircle2, ShieldAlert, Search, Target, Fingerprint,
  Zap, Activity, History, FolderPlus, ArrowUp, ArrowRight,
} from 'lucide-react';
import { api } from '../api/client';
import EmptyState from '../components/EmptyState';

export default function Dashboard() {
  const { pipelineResults, projectId, projects } = useAppContext();
  const [comparisons, setComparisons] = useState<Array<{ run_id: number; fairness_score: number; accuracy: number; decision: string; timestamp: string }>>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (projectId) {
      api.get(`/project/${projectId}/compare`).then((res) => setComparisons(res.data));
    }
  }, [projectId, pipelineResults]);

  if (!pipelineResults) {
    if (!projectId) {
      return (
        <div className="fade-in" style={{ maxWidth: 880, margin: '0 auto', paddingTop: 80 }}>
          <div className="dashboard-intro">
            <div className="kicker">Intelligence Workspace</div>
            <h1 className="page-title" style={{ marginBottom: 18 }}>Forensic AI Hub</h1>
            <p className="page-subtitle" style={{ margin: '0 auto', textAlign: 'center' }}>
              {projects.length === 0
                ? 'Create your first project to start auditing a model for bias.'
                : 'Pick a project from the selector at the top of the page, or create a new one.'}
            </p>
          </div>

          {projects.length === 0 ? (
            <EmptyState
              icon={<FolderPlus size={20} />}
              kicker="Step 1"
              title="Create your first project"
              description="Projects let you organize audits by dataset, domain, and team. Click 'Select Project' in the top bar, then choose 'New Project' to set one up."
              primaryAction={{ label: 'Open Project Selector', to: '#open-selector' }}
            />
          ) : (
            <EmptyState
              icon={<ArrowUp size={20} />}
              kicker="Pick a project"
              title="Select a project to continue"
              description={`You have ${projects.length} project${projects.length === 1 ? '' : 's'} on file. Click “Select Project” at the top of the page to choose one and begin auditing.`}
              primaryAction={{ label: 'Start Audit Sequence', to: '/workflow/step-1' }}
            />
          )}
        </div>
      );
    }

    return (
      <div className="fade-in" style={{ maxWidth: 880, margin: '0 auto', paddingTop: 80 }}>
        <div className="dashboard-intro">
          <div className="kicker">Project: {projects.find((p) => String(p.id) === String(projectId))?.name ?? 'Active'}</div>
          <h1 className="page-title" style={{ marginBottom: 18 }}>Ready for Audit</h1>
          <p className="page-subtitle" style={{ margin: '0 auto', textAlign: 'center' }}>
            Upload a dataset in Step 1 and run the full analysis in Step 2. The dashboard will populate with fairness scores, counterfactual findings, and remediation steps as soon as the pipeline completes.
          </p>
        </div>

        <EmptyState
          icon={<Search size={20} />}
          kicker="Next Move"
          title="Run an audit to see results"
          description="The forensic engine will execute eight sequential analyses: data audit, proxy detection, model bias, SHAP explainability, counterfactual testing, stress testing, and auto-generated remediation."
          primaryAction={{ label: 'Start Audit Sequence', to: '/workflow/step-1' }}
          secondaryAction={{ label: 'Switch Project', to: '/profile' }}
        />
      </div>
    );
  }

  if (!pipelineResults?.scores) return null;

  const p = pipelineResults as unknown as { fairness_score?: number; decision?: string; recommendations?: Array<{ issue?: string; fix?: string } | string>; scores?: Record<string, number> };
  const scores = p.scores ?? {};
  const fairness_score = p.fairness_score ?? 0;
  const decision = p.decision ?? 'UNKNOWN';
  const recommendations = p.recommendations ?? [];
  const chartData = [
    { name: 'Data', score: scores.data_bias_score ?? 0 },
    { name: 'Model', score: scores.model_bias_score ?? 0 },
    { name: 'Proxy', score: scores.proxy_risk_score ?? 0 },
    { name: 'Contrast', score: scores.counterfactual_score ?? 0 },
    { name: 'Stress', score: scores.stress_test_score ?? 0 },
  ];

  const getScoreColor = (score: number) => {
    if (score < 50) return '#A24A46'; // Crimson Oxide
    if (score < 75) return '#C89D7C'; // Antique Gold
    return '#8FA89B'; // Sage Green
  };

  const decisionConfig = {
    'HIGH RISK': { color: '#A24A46', icon: ShieldAlert, bg: 'rgba(162, 74, 70, 0.1)' },
    'MODERATE RISK': { color: '#C89D7C', icon: AlertTriangle, bg: 'rgba(200, 157, 124, 0.1)' },
    'LOW RISK': { color: '#8FA89B', icon: CheckCircle2, bg: 'rgba(143, 168, 155, 0.1)' },
  };

  const config = decisionConfig[decision as keyof typeof decisionConfig] || decisionConfig['MODERATE RISK'];
  const DecisionIcon = config.icon;

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', paddingBottom: 60 }}>
      <header className="page-header" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 32 }}>
        <div>
          <div className="kicker">Audit Intelligence</div>
          <h1 className="page-title">Forensic Findings</h1>
          <p className="page-subtitle">Comprehensive fairness assessment across all eight forensic stages.</p>
        </div>
        <div className="dashboard-decision-badge" style={{ borderColor: config.color, background: config.bg }}>
          <DecisionIcon size={18} color={config.color} />
          <strong style={{ color: config.color, letterSpacing: 1, fontSize: '0.78rem' }}>{decision}</strong>
        </div>
      </header>

      <div className="dashboard-hero">
        <div className="dashboard-hero-score card">
          <div className="stat-label" style={{ marginBottom: 28 }}>Unified Score</div>
          <div style={{ position: 'relative', display: 'inline-block', margin: '0 auto' }}>
            <svg width="220" height="220" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="4" />
              <motion.circle
                cx="50" cy="50" r="44" fill="none" stroke={getScoreColor(fairness_score)}
                strokeWidth="4" strokeDasharray="276"
                initial={{ strokeDashoffset: 276 }}
                animate={{ strokeDashoffset: 276 - (fairness_score * 2.76) }}
                transition={{ duration: 1.8, ease: 'circOut' }}
                strokeLinecap="round" transform="rotate(-90 50 50)"
              />
            </svg>
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
              }}
            >
              <div className="dashboard-hero-number" style={{ color: getScoreColor(fairness_score) }}>{Math.round(fairness_score)}</div>
              <div className="stat-label" style={{ fontSize: '0.6rem' }}>Forensic Index</div>
            </div>
          </div>
          <p className="helper" style={{ marginTop: 28, fontSize: '0.82rem', padding: '0 12px', maxWidth: 220 }}>
            Aggregate score across all eight forensic stages.
          </p>
        </div>

        <div className="dashboard-hero-metrics card">
          <div className="dashboard-hero-header">
            <h3 className="section-title" style={{ margin: 0 }}>Forensic Metrics</h3>
            <div className="pill" style={{ fontSize: '0.6rem' }}>Stages 1–5</div>
          </div>

          <div className="dashboard-metric-row">
            {[
              { label: 'Data', score: scores.data_bias_score, icon: Search, to: '/workflow/step-3' },
              { label: 'Model', score: scores.model_bias_score, icon: Target, to: '/workflow/step-4' },
              { label: 'Proxy', score: scores.proxy_risk_score, icon: Fingerprint, to: '/workflow/step-2' },
              { label: 'Contrast', score: scores.counterfactual_score, icon: Zap, to: '/workflow/step-6' },
              { label: 'Stress', score: scores.stress_test_score, icon: Activity, to: '/workflow/step-7' },
            ].map((m) => (
              <button
                key={m.label}
                className="dashboard-metric-cell"
                onClick={() => navigate(m.to)}
                type="button"
              >
                <m.icon size={15} className="dashboard-metric-icon" />
                <div className="dashboard-metric-score" style={{ color: getScoreColor(m.score) }}>{m.score}</div>
                <div className="dashboard-metric-label">{m.label}</div>
              </button>
            ))}
          </div>

          <div className="dashboard-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 12, right: 0, left: 0, bottom: 0 }}>
                <Bar dataKey="score" radius={[3, 3, 0, 0]} barSize={50}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getScoreColor(entry.score)} fillOpacity={0.42} />
                  ))}
                </Bar>
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: '0.78rem',
                    color: 'var(--text-primary)',
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {comparisons.length > 1 && (
        <section className="card section-gap">
          <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
            <History size={18} color="var(--accent)" />
            Audit History & Comparative Performance
          </div>
          <div className="grid-2" style={{ gap: 24 }}>
            <div className="card-inset">
              <div className="stat-label" style={{ marginBottom: 16 }}>Trend Analysis</div>
              <div style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={[...comparisons].reverse()}>
                    <Line type="monotone" dataKey="fairness_score" stroke="var(--accent)" strokeWidth={2} dot={{ fill: 'var(--accent)' }} />
                    <Line type="monotone" dataKey="accuracy" stroke="var(--text-muted)" strokeWidth={2} strokeDasharray="5 5" />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontSize: '0.78rem',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 16, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: '50%' }} /> Fairness
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, border: '1px dashed var(--text-muted)', borderRadius: '50%' }} /> Accuracy
                </div>
              </div>
            </div>

            <div className="dashboard-history-table">
              <table className="table">
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Fairness</th>
                    <th>Accuracy</th>
                    <th>Decision</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisons.map((run) => (
                    <tr key={run.run_id}>
                      <td style={{ color: 'var(--text-muted)' }}>#{run.run_id}</td>
                      <td style={{ fontWeight: 600, color: getScoreColor(run.fairness_score) }}>{run.fairness_score}</td>
                      <td>{Math.round(run.accuracy * 100)}%</td>
                      <td>
                        <span className={`pill ${run.decision === 'LOW RISK' ? 'green' : run.decision === 'HIGH RISK' ? 'red' : 'yellow'}`}>
                          {run.decision}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>
                        {new Date(run.timestamp).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <section className="card">
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          Remediation Steps
        </div>
        <div className="stack stack-md">
          {recommendations && recommendations.length > 0 ? (
            recommendations.map((rec, i: number) => {
              const item = rec as { issue?: string; fix?: string };
              return (
                <div key={i} className="dashboard-recommendation">
                  <div className="dashboard-recommendation-num">{String(i + 1).padStart(2, '0')}</div>
                  <div>
                    <div className="dashboard-recommendation-issue">
                      {item.issue || 'Audit Insight'}
                    </div>
                    <div className="dashboard-recommendation-fix">
                      {item.fix || (typeof rec === 'string' ? rec : 'Continue monitoring.')}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="helper">No critical recommendations found. Your model shows strong alignment with fairness goals.</p>
          )}
        </div>
        {recommendations && recommendations.length > 0 && (
          <div style={{ marginTop: 28, paddingTop: 24, borderTop: '1px solid var(--border-faint)' }}>
            <button
              type="button"
              className="btn"
              onClick={() => navigate('/workflow/step-8')}
            >
              Open in Sandbox
              <ArrowRight size={15} />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
