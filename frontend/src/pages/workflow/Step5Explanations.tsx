import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { ArrowRight, ArrowLeft, AlertTriangle } from 'lucide-react';
import { api } from '../../api/client';

export default function Step5Explanations() {
  const { pipelineResults, explainResult, explainSummary, projectId, advanceStep } = useAppContext();
  const navigate = useNavigate();

  if (!pipelineResults || !explainResult || explainResult.length === 0) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="kicker">Step 5 of 8</div>
            <h1 className="page-title">Explanations</h1>
          </div>
        </div>
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <p className="helper" style={{ marginBottom: 8 }}>
            {pipelineResults
              ? 'No flagged decisions were found for explanation.'
              : 'No analysis data yet. Please run the analysis first.'}
          </p>
          {!pipelineResults && (
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/workflow/step-2')}>
              Go to Configuration <ArrowRight size={16} />
            </button>
          )}
          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 16 }}>
            <button className="btn" onClick={() => navigate('/workflow/step-4')}>
              <ArrowLeft size={16} /> Back
            </button>
            <button className="btn btn-primary" onClick={async () => {
              await advanceStep(6);
              navigate('/workflow/step-6');
            }}>
              Next: Run Counterfactuals <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="kicker">Step 5 of 8</div>
          <h1 className="page-title">Explanations</h1>
          <p className="page-subtitle">Understand why the model made certain decisions and review high-risk flags.</p>
        </div>
      </div>

      <div style={{
        backgroundColor: 'rgba(188, 71, 73, 0.1)',
        border: '0.5px solid rgba(188, 71, 73, 0.5)',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '24px',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start'
      }}>
        <AlertTriangle color="var(--warning)" style={{ flexShrink: 0, marginTop: '2px' }} size={20} />
        <div>
          <div style={{ fontWeight: 600, color: 'var(--warning)', marginBottom: '4px' }}>Model explanations do not imply fairness</div>
          <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
            An explainable decision may still be a biased decision. SHAP values only tell us what the model learned, not whether what it learned is fair.
          </div>
        </div>
      </div>

      {explainSummary && (
        <div className="card card-primary" style={{ marginBottom: 16 }}>
          <div className="section-title" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Manager Summary</span>
          </div>
          <p style={{ fontSize: '1.1rem', lineHeight: 1.5, margin: '8px 0 0' }}>
            {explainSummary}
          </p>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <div className="section-title">Record Analysis</div>
        <div className="helper" style={{ marginBottom: 16 }}>
          Review specific decisions flagged for high risk. We split the analysis into how the model works versus why it might be unfair.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {explainResult.map((item: any) => {
            const proxyReasons = (item.top_reasons || []).filter((r: any) => r.is_proxy_risk);

            return (
              <div className="card" key={item.record_id} style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '0.5px solid var(--border)', paddingBottom: '12px' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                    Record {item.record_id} <span className="pill muted" style={{ marginLeft: '8px' }}>{item.decision}</span>
                  </div>
                  <span className={`pill ${item.explanation_type === 'individual' ? 'muted' : 'red'}`}>{item.sensitive_attribute}</span>
                </div>

                <div className="grid-2" style={{ gap: '24px' }}>
                  {/* Section 1: Model Decision (SHAP) */}
                  <div style={{ borderRight: '0.5px solid var(--border)', paddingRight: '24px' }}>
                    <div style={{ fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>
                      Why the model made this decision
                    </div>
                    <div className="helper" style={{ marginBottom: '16px', fontSize: '0.85rem' }}>
                      Top feature contributions (SHAP values).
                    </div>
                    <div style={{ display: 'grid', gap: '12px' }}>
                      {(item.top_reasons || []).map((reason: any) => (
                        <div key={reason.feature}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 500 }}>{reason.feature}</span>
                            <span style={{ color: '#6b7280' }}>{reason.shap_value.toFixed(2)}</span>
                          </div>
                          <div className="progress-track">
                            <div
                              className="progress-fill"
                              style={{
                                width: `${Math.min(Math.abs(reason.shap_value) * 100, 100)}%`,
                                background: reason.is_proxy_risk
                                  ? 'linear-gradient(90deg, var(--warning), #e77b7d)'
                                  : 'linear-gradient(90deg, var(--accent), #e9be95)'
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section 2: Fairness Assessment */}
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: '16px', color: 'var(--warning)' }}>
                      Why this may be unfair
                    </div>
                    <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '0.5px solid var(--border)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                      <div style={{ fontSize: '0.95rem', lineHeight: 1.5, color: 'var(--text-primary)' }}>
                        {item.human_explanation}
                      </div>
                    </div>

                    {proxyReasons.length > 0 && (
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--warning)', marginBottom: '8px' }}>
                          Proxy Feature Warnings
                        </div>
                        <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                          {proxyReasons.map((pr: any) => (
                            <li key={pr.feature} style={{ marginBottom: '4px' }}>
                              The feature <strong>{pr.feature}</strong> is highly correlated with the sensitive attribute and is driving this decision.
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div style={{ marginTop: '24px' }}>
                      <button
                        className="btn btn-small"
                        style={{ backgroundColor: 'rgba(188,71,73,0.14)', color: 'var(--warning)', border: '0.5px solid rgba(188,71,73,0.6)' }}
                        onClick={() => {
                          const reason = window.prompt('Enter reason for flagging this decision:');
                          if (reason && projectId) {
                            api.post('/monitoring/flag', {
                              project_id: parseInt(projectId),
                              record_id: String(item.record_id),
                              reason,
                            });
                          }
                        }}
                      >
                        🚩 Flag this decision for review
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
        <button className="btn" onClick={() => navigate('/workflow/step-4')}>
          <ArrowLeft size={16} /> Back
        </button>
        <button className="btn btn-primary" onClick={async () => {
          await advanceStep(6);
          navigate('/workflow/step-6');
        }}>
          Next: Run Counterfactuals <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
