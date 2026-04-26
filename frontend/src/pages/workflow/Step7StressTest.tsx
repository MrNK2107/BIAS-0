import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { motion } from 'framer-motion';
import AnimatedNumber from '../../components/animations/AnimatedNumber';
import ScanningSkeleton from '../../components/animations/ScanningSkeleton';
import { ArrowRight, ArrowLeft } from 'lucide-react';

export default function Step7StressTest() {
  const { pipelineResults, stressResult, biasResult, runModelBias } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [customScenarios, setCustomScenarios] = useState<any[]>([]);
  const navigate = useNavigate();
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

  if (!pipelineResults || !stressResult) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="kicker">Step 7 of 9</div>
            <h1 className="page-title">Stress Testing</h1>
          </div>
        </div>
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <p className="helper" style={{ marginBottom: 24 }}>No analysis data yet. Please run the analysis first.</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
            <button className="btn" onClick={() => navigate('/workflow/step-6')}>
              <ArrowLeft size={16} /> Back
            </button>
            <button className="btn btn-primary" onClick={() => navigate('/workflow/step-2')}>
              Go to Configuration <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <ScanningSkeleton height="40px" width="60%" borderRadius="8px" />
        <div style={{ marginTop: '24px' }}>
          <ScanningSkeleton height="16px" width="40%" borderRadius="4px" />
        </div>
        <p className="helper" style={{ marginTop: '16px' }}>Running custom stress scenarios...</p>
      </div>
    );
  }

  const { scenarios, overall_fragility } = stressResult;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="kicker">Step 7 of 9</div>
          <h1 className="page-title">Stress Testing</h1>
          <p className="helper" style={{ marginTop: 8 }}>
            Discover how the model's fairness holds up against data perturbations, missing values, and distribution shifts.
          </p>
        </div>
      </div>

      {/* Custom Scenario Builder — still interactive, runs targeted bias/stress API */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="section-title">Custom Scenario Builder</div>
            <div className="helper" style={{ marginBottom: 16 }}>Create custom perturbations to test specific vulnerabilities.</div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => {
              setLoading(true);
              runModelBias(customScenarios.length > 0 ? customScenarios : undefined).finally(() => setLoading(false));
            }}
          >
            {customScenarios.length > 0 ? 'Run Custom Stress Tests' : 'Re-run Default Stress Tests'}
          </button>
        </div>

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
        <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'flex-end' }}>
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
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div className="helper">Pending Scenarios:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {customScenarios.map((s, i) => (
                <div key={i} className="pill" style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
                  {s.name} ({s.type})
                  <button style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', marginLeft: 8, fontSize: '1.2rem', padding: 0 }} onClick={() => setCustomScenarios(customScenarios.filter((_, idx) => idx !== i))}>×</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title">Overall Fragility</div>
        <div className="stat-number">{overall_fragility}</div>
        <div className="helper">Higher values indicate the model's fairness is highly sensitive to changes in data distribution.</div>
      </div>

      <div className="grid-2" style={{ marginBottom: 24, gap: '24px' }}>
        {scenarios?.map((scenario: any) => {
          const delta = scenario.fairness_score - scenario.baseline_fairness_score;
          const isNegative = delta < 0;

          return (
            <div className="card" key={scenario.name} style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #f3f4f6', paddingBottom: '12px' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#111827' }}>
                  {scenario.name}
                </div>
                <span className={`pill ${scenario.fragile ? 'red' : 'green'}`} style={{ fontWeight: 600 }}>
                  {scenario.fragile ? 'Fragile' : 'Robust'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div style={{ padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                  <div className="helper" style={{ marginBottom: '4px' }}>Baseline</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#374151' }}>
                    <AnimatedNumber value={scenario.baseline_fairness_score} />
                  </div>
                </div>
                <div style={{ padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                  <div className="helper" style={{ marginBottom: '4px' }}>After Stress</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#374151' }}>
                    <AnimatedNumber value={scenario.fairness_score} />
                  </div>
                </div>
                <div style={{ padding: '12px', backgroundColor: isNegative ? '#fef2f2' : '#ecfdf5', borderRadius: '8px', textAlign: 'center' }}>
                  <div className="helper" style={{ marginBottom: '4px' }}>Change</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 600, color: isNegative ? '#dc2626' : '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    {isNegative ? '▼' : '▲'}
                    <AnimatedNumber value={Math.abs(delta)} />
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px', color: '#6b7280' }}>
                  <span>0.0</span>
                  <span>1.0</span>
                </div>
                <div style={{ position: 'relative', height: '16px', backgroundColor: '#e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(0, Math.min(100, scenario.baseline_fairness_score * 100))}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    style={{ position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: '#9ca3af', opacity: 0.4 }}
                  />
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(0, Math.min(100, scenario.fairness_score * 100))}%` }}
                    transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
                    style={{ position: 'absolute', top: 4, bottom: 4, left: 0, backgroundColor: isNegative ? '#ef4444' : '#3b82f6', borderRadius: '0 4px 4px 0' }}
                  />
                </div>
                <div className="helper" style={{ marginTop: '8px', textAlign: 'center', fontSize: '0.85rem' }}>
                  <span style={{ display: 'inline-block', width: 10, height: 10, backgroundColor: '#9ca3af', opacity: 0.4, marginRight: 4 }}></span> Baseline
                  <span style={{ display: 'inline-block', width: 10, height: 10, backgroundColor: isNegative ? '#ef4444' : '#3b82f6', marginLeft: 12, marginRight: 4 }}></span> After Stress
                </div>
              </div>

              <div className="helper" style={{ textAlign: 'right', borderTop: '1px solid #f3f4f6', paddingTop: '12px' }}>
                Accuracy Drop: {scenario.baseline_accuracy.toFixed(2)} → {scenario.accuracy.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32 }}>
        <button className="btn btn-secondary" onClick={() => navigate('/workflow/step-6')}>
          ← Back
        </button>
        <button className="btn btn-primary" onClick={() => navigate('/workflow/step-8')}>
          Continue to Sandbox Fixes →
        </button>
      </div>
    </div>
  );
}
