import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';

export default function StressTest() {
  const { file, stressResult, runModelBias } = useAppContext();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (file && !stressResult && !loading) {
      setLoading(true);
      runModelBias().finally(() => setLoading(false));
    }
  }, [file, stressResult, loading, runModelBias]);

  if (!file) {
    return <div className="card">No data available. Please <Link to="/upload">upload a dataset</Link> first.</div>;
  }

  if (loading || !stressResult) {
    return <div className="card" style={{ padding: 40, textAlign: 'center' }}>Running stress testing. Please wait...</div>;
  }

  const { scenarios, overall_fragility } = stressResult;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="kicker">Stress testing</div>
          <h1 className="page-title">Probe fairness fragility under perturbations</h1>
        </div>
        <button className="btn btn-primary" onClick={() => { setLoading(true); runModelBias().finally(() => setLoading(false)); }}>Run Stress Tests</button>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        {scenarios?.map((scenario: any) => (
          <div className="card" key={scenario.name}>
            <div className="section-title">{scenario.name}</div>
            <div className="grid-2">
              <div>
                <div className="helper">Fairness score before</div>
                <div className="stat-number">{scenario.baseline_fairness_score}</div>
              </div>
              <div>
                <div className="helper">Fairness score after</div>
                <div className="stat-number">{scenario.fairness_score}</div>
              </div>
            </div>
            <div className="helper">Accuracy {scenario.baseline_accuracy.toFixed(2)} → {scenario.accuracy.toFixed(2)}</div>
            {scenario.fragile && <span className="pill red" style={{ marginTop: 8 }}>Fragile</span>}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="section-title">Overall fragility</div>
        <div className="stat-number">{overall_fragility}</div>
      </div>
    </div>
  );
}
