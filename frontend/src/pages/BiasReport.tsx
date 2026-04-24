import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formApi } from '../api/client';
import ScoreGauge from '../components/ScoreGauge';
import FairnessTable from '../components/FairnessTable';
import { useAppContext } from '../context/AppContext';

export default function BiasReport() {
  const { file, biasResult, explainResult, explainSummary, runModelBias, projectId } = useAppContext();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (file && !biasResult && !loading) {
      setLoading(true);
      runModelBias().finally(() => setLoading(false));
    }
  }, [file, biasResult, loading, runModelBias]);

  if (!file) {
    return <div className="card">No data available. Please <Link to="/upload">upload a dataset</Link> first.</div>;
  }

  if (loading || !biasResult || !explainResult) {
    return <div className="card" style={{ padding: 40, textAlign: 'center' }}>Running model fairness analysis and generating explainability. Please wait...</div>;
  }

  // Find the first available sensitive attribute in group_performance to show in the table
  const availableGroups = Object.keys(biasResult.group_performance || {});
  const displayGroupKey = availableGroups.length > 0 ? availableGroups[0] : null;

  return (
    <div>
      {explainSummary && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--accent)', background: 'rgba(79, 142, 247, 0.05)' }}>
          <div className="section-title" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8 }}>
             <span>Manager Summary</span>
          </div>
          <p style={{ fontSize: '1.1rem', lineHeight: 1.5, margin: '8px 0 0' }}>
            {explainSummary}
          </p>
        </div>
      )}

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card" style={{ display: 'grid', placeItems: 'center' }}>
          <ScoreGauge score={biasResult.fairness_score} />
          <div className="helper">{biasResult.risk_level} risk</div>
        </div>
        <div className="card">
          <div className="section-title">Metrics summary</div>
          <div className="grid-3">
            {[
              ['Demographic Parity Difference', biasResult.metrics.demographic_parity_difference],
              ['Equal Opportunity Difference', biasResult.metrics.equal_opportunity_difference],
              ['FPR Gap', biasResult.metrics.fpr_gap],
              ['FNR Gap', biasResult.metrics.fnr_gap],
            ].map(([label, value]) => (
              <div className="notice" key={label as string}>
                <strong>{label as string}</strong>
                <div className="stat-number" style={{ fontSize: '1.6rem' }}>{Number(value).toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {displayGroupKey && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">Group performance ({displayGroupKey})</div>
          <FairnessTable data={biasResult.group_performance[displayGroupKey]} />
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Explainability</div>
        <div className="notice-list">
          {explainResult.map((item: any) => (
            <div className={`notice ${item.explanation_type === 'individual' ? 'notice-individual' : 'notice-contrastive'}`} key={item.record_id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <strong>Record {item.record_id} - {item.decision}</strong>
            <button className="btn btn-small" onClick={() => {
              const reason = window.prompt('Enter reason for flagging this decision:');
              if (reason) {
                formApi.post('/monitoring/flag', {
                  project_id: parseInt(projectId),
                  record_id: String(item.record_id),
                  reason,
                }).then(() => {
                  // optional: show toast or refresh flags elsewhere
                });
              }
            }}>🚩 Flag this decision</button>
                <span className={`pill ${item.explanation_type === 'individual' ? 'muted' : 'red'}`}>{item.sensitive_attribute}</span>
              </div>
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {(item.top_reasons || []).map((reason: any) => (
                  <div key={reason.feature}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{reason.feature}</span>
                      <span>{reason.shap_value.toFixed(2)}</span>
                    </div>
                    <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(Math.abs(reason.shap_value) * 100, 100)}%`, background: reason.is_proxy_risk ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : 'linear-gradient(90deg, #3550c8, #4f8ef7)' }} /></div>
                  </div>
                ))}
              </div>
              <p className="helper">{item.human_explanation}</p>
            </div>
          ))}
        </div>
      </div>

      <Link className="btn btn-primary" to="/counterfactual">Run Counterfactual Test</Link>
    </div>
  );
}
