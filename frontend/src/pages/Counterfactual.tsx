import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CounterfactualFlip from '../components/CounterfactualFlip';
import ScoreGauge from '../components/ScoreGauge';
import { useAppContext } from '../context/AppContext';

export default function Counterfactual() {
  const { file, sensitiveCols, counterfactualResult, runModelBias } = useAppContext();
  const [sensitiveCol, setSensitiveCol] = useState(sensitiveCols[0] || 'gender');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (file && !counterfactualResult && !loading) {
      setLoading(true);
      runModelBias().finally(() => setLoading(false));
    }
  }, [file, counterfactualResult, loading, runModelBias]);

  if (!file) {
    return <div className="card">No data available. Please <Link to="/upload">upload a dataset</Link> first.</div>;
  }

  if (loading || !counterfactualResult) {
    return <div className="card" style={{ padding: 40, textAlign: 'center' }}>Running counterfactual analysis. Please wait...</div>;
  }

  const { flip_rate, metrics, flip_breakdown, interpretation } = counterfactualResult;
  const cfScore = metrics.demographic_parity_difference; // Dummy, use flip_rate or whatever comes in

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="kicker">Counterfactual testing</div>
          <h1 className="page-title">See whether the decision flips on one attribute</h1>
        </div>
        <select className="select" value={sensitiveCol} onChange={(event) => setSensitiveCol(event.target.value)} style={{ maxWidth: 260 }}>
          {sensitiveCols.map((col) => <option key={col} value={col}>{col}</option>)}
        </select>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="section-title">Decision flip rate</div>
          <div className="stat-number">{Math.round(flip_rate * 100)}%</div>
          <div className="helper">of decisions flip when changing {sensitiveCol}</div>
          <button className="btn btn-primary" style={{ marginTop: 12 }}>Run again</button>
        </div>
        <div className="card" style={{ display: 'grid', placeItems: 'center' }}>
          <ScoreGauge score={100 - (flip_rate * 100)} />
          <div className="helper" style={{marginTop: 8}}>Counterfactual Fairness</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <CounterfactualFlip original="Approved" flipped="Rejected" />
        <p className="helper" style={{ marginTop: 12 }}>{interpretation}</p>
      </div>

      <div className="card">
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
    </div>
  );
}
