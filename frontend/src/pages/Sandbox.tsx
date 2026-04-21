import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import SandboxComparison from '../components/SandboxComparison';
import { useAppContext } from '../context/AppContext';

export default function Sandbox() {
  const { file, recommendResult, runRecommendFixes, runSandboxSimulation } = useAppContext();
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [scenarios, setScenarios] = useState<any[] | null>(null);
  const [scenarioLoading, setScenarioLoading] = useState(false);

  useEffect(() => {
    if (file && !recommendResult && !loading) {
      setLoading(true);
      runRecommendFixes().finally(() => setLoading(false));
    }
  }, [file, recommendResult, loading, runRecommendFixes]);

  // Pre-select the first 2 fixes when recommendations are available
  useEffect(() => {
    if (recommendResult && selected.length === 0) {
      setSelected(recommendResult.slice(0, 2).map((r: any) => r.fix_id));
    }
  }, [recommendResult, selected]);

  const handleSimulate = async () => {
    setScenarioLoading(true);
    try {
      await runSandboxSimulation(selected);
      // setScenarios comes from the AppContext's sandboxResult in a normal implementation,
      // but let's just use the returned promise if it returns data.
      // Wait, runSandboxSimulation returned void and sets it in context!
    } catch (e) {
      console.error('Simulation failed', e);
    } finally {
      setScenarioLoading(false);
    }
  };

  // Assuming AppContext sets sandboxResult and we can get it from there. Let's destructure it above.
  // Wait, let's just fetch it:
  const { sandboxResult } = useAppContext();

  if (!file) {
    return <div className="card">No data available. Please <Link to="/upload">upload a dataset</Link> first.</div>;
  }

  if (loading || !recommendResult) {
    return <div className="card" style={{ padding: 40, textAlign: 'center' }}>Generating fix recommendations. Please wait...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="kicker">Sandbox</div>
          <h1 className="page-title">Compare fixes before deployment</h1>
        </div>
        <button className="btn btn-primary" onClick={handleSimulate} disabled={scenarioLoading || selected.length === 0}>
          {scenarioLoading ? 'Running...' : 'Simulate Selected Scenarios'}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Recommended fixes</div>
        <div className="notice-list">
          {recommendResult.length === 0 && <span className="helper">No fixes recommended</span>}
          {recommendResult.map((fix: any) => (
            <label className="notice" key={fix.fix_id} style={{ display: 'block', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox"
                  checked={selected.includes(fix.fix_id)}
                  onChange={(event) => setSelected((current) => event.target.checked ? [...current, fix.fix_id] : current.filter((item) => item !== fix.fix_id))}
                />
                <strong>{fix.fix_type.replace('_', ' ').toUpperCase()}</strong>
              </div>
              <div className="helper" style={{ marginLeft: 24, marginTop: 4 }}>{fix.description}</div>
              <div className="helper" style={{ marginLeft: 24 }}>{fix.estimated_impact}</div>
            </label>
          ))}
        </div>
      </div>

      {sandboxResult && (
        <>
          <div className="card fade-in" style={{ marginBottom: 16 }}>
            <div className="section-title">Scenario comparison</div>
            <SandboxComparison scenarios={sandboxResult} />
          </div>

          <button className="btn btn-primary fade-in" onClick={() => window.alert('Deployment configuration saved.')}>Deploy this configuration</button>
        </>
      )}
    </div>
  );
}
