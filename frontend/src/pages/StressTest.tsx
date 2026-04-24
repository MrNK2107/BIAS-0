import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';

export default function StressTest() {
  const { file, stressResult, biasResult, runModelBias } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [customScenarios, setCustomScenarios] = useState<any[]>([]);
  const [newScenario, setNewScenario] = useState({
    name: '',
    type: 'undersample',
    target_group: '',
    sensitive_col: '',
    magnitude: 0.5
  });

  const availableGroups = useMemo(() => {
    if (!biasResult?.group_performance) return [];
    const groups: { col: string, value: string }[] = [];
    Object.entries(biasResult.group_performance).forEach(([col, stats]: [string, any]) => {
      Object.keys(stats).forEach(val => {
        groups.push({ col, value: val });
      });
    });
    return groups;
  }, [biasResult]);

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
        <button 
          className="btn btn-primary" 
          onClick={() => { 
            setLoading(true); 
            runModelBias(customScenarios.length > 0 ? customScenarios : undefined).finally(() => setLoading(false)); 
          }}
        >
          {customScenarios.length > 0 ? 'Run Custom Stress Tests' : 'Run Default Stress Tests'}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title">Custom Scenario Builder</div>
        <div className="grid-3">
          <div>
            <label className="helper">Type</label>
            <select className="select" value={newScenario.type} onChange={e => setNewScenario({ ...newScenario, type: e.target.value as any })}>
              <option value="undersample">Undersample</option>
              <option value="label_noise">Label Noise</option>
              <option value="shift">Distribution Shift</option>
            </select>
          </div>
          <div>
            <label className="helper">Target Group</label>
            <select className="select" value={`${newScenario.sensitive_col}:${newScenario.target_group}`} onChange={e => {
              const [col, val] = e.target.value.split(':');
              setNewScenario({ ...newScenario, sensitive_col: col, target_group: val });
            }}>
              <option value="">Select a group</option>
              {availableGroups.map(g => (
                <option key={`${g.col}:${g.value}`} value={`${g.col}:${g.value}`}>{g.col}: {g.value}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="helper">Magnitude ({newScenario.magnitude})</label>
            <input type="range" min="0.1" max="0.9" step="0.1" value={newScenario.magnitude} onChange={e => setNewScenario({ ...newScenario, magnitude: parseFloat(e.target.value) })} style={{ width: '100%', accentColor: 'var(--accent)' }} />
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
             <label className="helper">Scenario Name</label>
             <input className="input" placeholder="e.g. Severe Stress on Minority" value={newScenario.name} onChange={e => setNewScenario({ ...newScenario, name: e.target.value })} />
          </div>
          <button className="btn" onClick={() => {
            if (!newScenario.name || !newScenario.target_group) return;
            setCustomScenarios([...customScenarios, { ...newScenario }]);
            setNewScenario({ ...newScenario, name: '' });
          }}>Add Scenario</button>
        </div>

        {customScenarios.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="helper">Pending Scenarios:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {customScenarios.map((s, i) => (
                <div key={i} className="pill" style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}>
                  {s.name} ({s.type}) <button style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', marginLeft: 4, fontSize: '1.2rem' }} onClick={() => setCustomScenarios(customScenarios.filter((_, idx) => idx !== i))}>×</button>
                </div>
              ))}
            </div>
          </div>
        )}
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
