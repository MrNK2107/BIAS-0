import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ScoreGauge from '../components/ScoreGauge';
import FairnessTable from '../components/FairnessTable';
import { useAppContext } from '../context/AppContext';

export default function BiasReport() {
  const { file, biasResult, explainResult, runModelBias } = useAppContext();
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
            <div className="notice" key={item.record_id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <strong>Record {item.record_id} - {item.decision}</strong>
                <span className="pill red">{item.sensitive_attribute}</span>
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
