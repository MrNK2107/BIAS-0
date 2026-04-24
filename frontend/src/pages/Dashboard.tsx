import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { 
  Upload, BarChart3, Scale, ArrowRight, AlertTriangle,
  CheckCircle2, PlayCircle, FlaskConical, Zap, Shield, TrendingUp
} from 'lucide-react';

export default function Dashboard() {
  const { file, auditResult, biasResult, recommendResult } = useAppContext();
  const navigate = useNavigate();

  // STATE 1: No Project — Landing
  if (!file) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', paddingTop: 48 }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div className="brand-badge" style={{ width: 56, height: 56, fontSize: 28, margin: '0 auto 20px' }}>◈</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', marginBottom: 12, color: '#fff' }}>
            Unbiased AI Fairness Suite
          </h1>
          <p className="helper" style={{ fontSize: '1.05rem', maxWidth: 560, margin: '0 auto', lineHeight: 1.6 }}>
            Detect, explain, and mitigate bias in your machine learning models.
            Ensure your AI decisions are fair, transparent, and compliant.
          </p>
        </div>

        <div className="card card-primary" style={{ padding: 40, textAlign: 'center', marginBottom: 32 }}>
          <h2 style={{ marginBottom: 8, fontSize: '1.3rem' }}>Ready to analyze your model?</h2>
          <p className="helper" style={{ marginBottom: 24 }}>Upload a dataset and configure your audit in under 2 minutes.</p>
          <button className="btn btn-primary" style={{ fontSize: '1.05rem', padding: '14px 32px' }}
            onClick={() => navigate('/workflow/step-1')}>
            Start New Audit <ArrowRight size={18} style={{ marginLeft: 6 }} />
          </button>
        </div>

        <div className="section-label" style={{ marginBottom: 12 }}>Quick-start templates</div>
        <div className="grid-2">
          <div className="card card-interactive" onClick={() => navigate('/workflow/step-1')}>
            <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Scale size={16} color="var(--accent)" /> Loan Approval
            </div>
            <p className="helper" style={{ marginBottom: 12 }}>Test fairness in credit scoring decisions based on demographic attributes.</p>
            <span className="pill blue">Sample Dataset</span>
          </div>
          <div className="card card-interactive" onClick={() => navigate('/workflow/step-1')}>
            <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart3 size={16} color="var(--accent)" /> Hiring Screening
            </div>
            <p className="helper" style={{ marginBottom: 12 }}>Evaluate AI resume screening for potential gender or age biases.</p>
            <span className="pill blue">Sample Dataset</span>
          </div>
        </div>
      </div>
    );
  }

  // STATE 2: Project exists, no results — Checklist
  if (!biasResult) {
    const isAuditComplete = !!auditResult;

    return (
      <div style={{ maxWidth: 800, margin: '0 auto', paddingTop: 40 }}>
        <h1 className="page-title" style={{ marginBottom: 6 }}>Analysis in Progress</h1>
        <p className="helper" style={{ marginBottom: 32 }}>Complete the workflow steps to generate your fairness report.</p>

        <div className="card section-gap">
          <div className="section-title">Audit Checklist</div>

          {[
            { done: true, label: 'Dataset Uploaded', sub: 'Your dataset is ready for analysis.', nav: '/workflow/step-1', action: 'Edit' },
            { done: isAuditComplete, label: 'Data Audit', sub: 'Check for data-level biases and missing values.', nav: '/workflow/step-3', action: isAuditComplete ? 'Review' : 'Run Audit', primary: !isAuditComplete },
            { done: false, label: 'Model Bias Analysis', sub: 'Calculate disparate impact and demographic parity.', nav: '/workflow/step-4', action: 'Run Analysis', primary: true, disabled: !isAuditComplete },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0', borderBottom: i < 2 ? '1px solid var(--border-subtle)' : 'none' }}>
              {item.done
                ? <CheckCircle2 color="var(--green)" size={24} />
                : <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--border)' }} />
              }
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{item.label}</div>
                <div className="helper" style={{ fontSize: '0.82rem' }}>{item.sub}</div>
              </div>
              <button
                className={`btn btn-small ${item.primary ? 'btn-primary' : ''}`}
                onClick={() => navigate(item.nav)}
                disabled={item.disabled}
              >{item.action}</button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // STATE 3: Results Available — Overview
  const riskFactors: string[] = [];
  if (biasResult?.metrics?.disparate_impact < 0.8)
    riskFactors.push('Severe disparate impact detected against minority groups.');
  if (biasResult?.metrics?.demographic_parity_difference > 0.2)
    riskFactors.push('High demographic parity difference — unbalanced approval rates.');
  if (auditResult?.missing_values_by_group && Object.keys(auditResult.missing_values_by_group).length > 0)
    riskFactors.push('Missing data patterns correlate with sensitive groups.');

  const fairnessScore = biasResult?.metrics?.demographic_parity_difference
    ? Math.max(0, 100 - (biasResult.metrics.demographic_parity_difference * 100))
    : 85;

  const scoreColor = fairnessScore > 90 ? 'var(--green)' : fairnessScore > 75 ? 'var(--yellow)' : 'var(--red)';
  const fairnessSummary = fairnessScore > 90
    ? 'Strong fairness metrics across measured demographic groups. Minimal bias detected.'
    : fairnessScore > 75
      ? 'Moderate fairness — some groups experience slightly lower approval rates. Review risk factors.'
      : 'Critical bias detected. The model significantly disadvantages certain groups and requires immediate mitigation.';

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', paddingTop: 20 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ marginBottom: 6 }}>Fairness Overview</h1>
          <p className="helper">Analysis complete. Review your model's fairness profile.</p>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('/workflow/step-1')}>
          Start New Audit
        </button>
      </div>

      {/* Score + Risk side by side */}
      <div className="grid-2 section-gap">
        <div className="card">
          <div className="stat-label">Fairness Score</div>
          <div className="stat-number" style={{ color: scoreColor, fontSize: '2.4rem' }}>{fairnessScore.toFixed(0)}</div>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.5 }}>
            {fairnessSummary}
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn btn-small" onClick={() => navigate('/workflow/step-4')}>View Metrics</button>
            <button className="btn btn-small" onClick={() => navigate('/workflow/step-5')}>Explanations</button>
          </div>
        </div>

        <div className={`card ${riskFactors.length > 0 ? 'card-danger' : 'card-success'}`}>
          <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} color={riskFactors.length > 0 ? 'var(--yellow)' : 'var(--green)'} />
            Top Risk Factors
          </div>
          {riskFactors.length > 0 ? (
            <ul style={{ paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {riskFactors.map((risk, i) => (
                <li key={i} style={{ fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>{risk}</li>
              ))}
            </ul>
          ) : (
            <div className="helper">No critical risk factors identified.</div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="card section-gap">
        <div className="section-title" style={{ marginBottom: 16 }}>Recommended Next Actions</div>
        <div className="stack stack-md">
          <div className="card-inset" style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <FlaskConical color="var(--accent)" size={22} style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Sandbox Mitigations</div>
              <p className="helper" style={{ marginBottom: 12 }}>Simulate fixes such as reweighing or threshold adjustments to improve fairness.</p>
              <button className="btn btn-primary btn-small" onClick={() => navigate('/workflow/step-8')}>Open Sandbox</button>
            </div>
          </div>

          <div className="card-inset" style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <Zap color="var(--yellow)" size={22} style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Stress Testing</div>
              <p className="helper" style={{ marginBottom: 12 }}>Probe model fragility against missing data, label noise, and distribution shifts.</p>
              <button className="btn btn-small" onClick={() => navigate('/workflow/step-7')}>Run Stress Tests</button>
            </div>
          </div>

          <div className="card-inset" style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <Shield color="var(--green)" size={22} style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Continuous Monitoring</div>
              <p className="helper" style={{ marginBottom: 12 }}>Track fairness over time and receive alerts when drift is detected.</p>
              <button className="btn btn-small" onClick={() => navigate('/workflow/step-9')}>Set Up Monitoring</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
