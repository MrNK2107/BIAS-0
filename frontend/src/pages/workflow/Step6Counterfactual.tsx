import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CounterfactualFlip from '../../components/CounterfactualFlip';
import ScoreGauge from '../../components/ScoreGauge';
import { useAppContext } from '../../context/AppContext';
import { formApi } from '../../api/client';

export default function Step6Counterfactual() {
  const { file, sensitiveCols, counterfactualResult, runCounterfactualAnalysis, projectId } = useAppContext();
  const [sensitiveCol, setSensitiveCol] = useState(sensitiveCols[0] || 'gender');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // We no longer automatically run the analysis on mount.
  // The user must click the CTA to run it.

  if (!file) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <h2 style={{ marginBottom: 16 }}>No dataset uploaded</h2>
        <p className="helper" style={{ marginBottom: 24 }}>Please go back and upload a dataset to begin.</p>
        <button className="btn btn-primary" onClick={() => navigate('/workflow/step-1')}>Go to Upload</button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <h2>Running Counterfactual Analysis...</h2>
        <p className="helper">This process evaluates if model decisions change when only the sensitive attribute is modified.</p>
      </div>
    );
  }

  if (!counterfactualResult) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="kicker">Step 6 of 9</div>
            <h1 className="page-title">Counterfactual Testing</h1>
            <p className="page-subtitle">Counterfactual testing checks if changing sensitive attributes changes decisions.</p>
          </div>
        </div>
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <h2 style={{ marginBottom: 16 }}>No Analysis Data</h2>
          <p className="helper" style={{ marginBottom: 24, fontSize: '1.1rem' }}>
            Run the counterfactual analysis to evaluate the robustness of your model's decisions against sensitive attribute changes.
          </p>
          <button 
            className="btn btn-primary" 
            onClick={() => {
              setLoading(true);
              runCounterfactualAnalysis().finally(() => setLoading(false));
            }}
          >
            Run Counterfactual Analysis
          </button>
        </div>
      </div>
    );
  }

  const { flip_rate, flip_breakdown, interpretation } = counterfactualResult;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="kicker">Step 6 of 9</div>
          <h1 className="page-title">Counterfactual Testing</h1>
          <p className="helper" style={{ marginTop: 8 }}>
            Analyze if individual predictions flip when modifying only the sensitive attribute. This ensures the model isn't using the sensitive attribute as a proxy.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="section-title">Select Attribute for Counterfactual Test</div>
            <div className="helper">Which attribute should we "flip" to test model robustness?</div>
          </div>
          <select className="select" value={sensitiveCol} onChange={(event) => setSensitiveCol(event.target.value)} style={{ width: 200 }}>
            {sensitiveCols.map((col) => <option key={col} value={col}>{col}</option>)}
          </select>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="section-title">Decision flip rate</div>
          <div className="stat-number">{Math.round(flip_rate * 100)}%</div>
          <div className="helper">of decisions flip when changing {sensitiveCol}</div>
        </div>
        <div className="card" style={{ display: 'grid', placeItems: 'center' }}>
          <ScoreGauge score={100 - (flip_rate * 100)} />
          <div className="helper" style={{marginTop: 8}}>Counterfactual Fairness</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <CounterfactualFlip original="Approved" flipped="Rejected" />
        <p className="helper" style={{ marginTop: 12 }}>{interpretation}</p>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title">Flip breakdown</div>
        <div className="grid-2">
          {Object.entries(flip_breakdown || {}).map(([name, entry]: [string, any]) => (
            <div className="notice" key={name}>
              <strong>{name.replace('_', ' to ')}</strong>
              <div className="progress-track" style={{ margin: '10px 0' }}><div className="progress-fill" style={{ width: `${entry.rate * 100}%` }} /></div>
              <div className="helper">{entry.flips} flips out of {entry.total}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title">Individual record flips</div>
        {(!counterfactualResult.sample_flips || counterfactualResult.sample_flips.length === 0) ? (
          <div className="helper">No individual flips identified for the current selection.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '12px 8px', color: '#6b7280', fontWeight: 500 }}>Record ID</th>
                  <th style={{ padding: '12px 8px', color: '#6b7280', fontWeight: 500 }}>Original Prediction</th>
                  <th style={{ padding: '12px 8px', color: '#6b7280', fontWeight: 500 }}>Counterfactual Prediction</th>
                  <th style={{ padding: '12px 8px', color: '#6b7280', fontWeight: 500 }}>Changed Feature</th>
                  <th style={{ padding: '12px 8px', color: '#6b7280', fontWeight: 500 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {(counterfactualResult.sample_flips || []).map((flip: any, i: number) => {
                  const isFlipped = flip.original_decision !== flip.flipped_decision;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: isFlipped ? '#fee2e2' : 'transparent' }}>
                      <td style={{ padding: '12px 8px', fontWeight: 500 }}>{flip.record_id}</td>
                      <td style={{ padding: '12px 8px' }}>
                        <span className="pill muted">{flip.original_decision}</span>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <span className={`pill ${isFlipped ? 'red' : 'muted'}`}>
                          {flip.flipped_decision}
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <strong>{sensitiveCol}</strong>: <em>{flip.original_value}</em> → <em>{flip.flipped_value}</em>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <button className="btn btn-small" onClick={() => {
                          const reason = window.prompt('Enter reason for flagging this decision:');
                          if (reason) {
                            formApi.post('/monitoring/flag', {
                              project_id: parseInt(projectId),
                              record_id: String(flip.record_id),
                              reason,
                            }).then(() => {
                              alert('Decision flagged for review.');
                            });
                          }
                        }}>🚩 Flag</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32 }}>
        <button className="btn btn-secondary" onClick={() => navigate('/workflow/step-5')}>
          ← Back
        </button>
        <button className="btn btn-primary" onClick={() => navigate('/workflow/step-7')}>
          Continue to Stress Test →
        </button>
      </div>
    </div>
  );
}
