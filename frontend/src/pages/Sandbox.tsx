import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import SandboxComparison from '../components/SandboxComparison';
import { useAppContext } from '../context/AppContext';

export default function Sandbox() {
  const { file, recommendResult, runRecommendFixes, runSandboxSimulation } = useAppContext();
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
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
      const initialSelected = recommendResult.slice(0, 2).map((r: any) => r.fix_id);
      setSelected(initialSelected);
      
      // Initialize option selections for fixes with mitigation options
      const initialOptions: Record<string, string> = {};
      recommendResult.forEach((r: any) => {
        if (r.mitigation_options && r.mitigation_options.length > 0) {
          initialOptions[r.fix_id] = r.mitigation_options[0].option;
        }
      });
      setSelectedOptions(initialOptions);
    }
  }, [recommendResult, selected]);

  const handleSimulate = async () => {
    setScenarioLoading(true);
    try {
      await runSandboxSimulation(selected);
    } catch (e) {
      console.error('Simulation failed', e);
    } finally {
      setScenarioLoading(false);
    }
  };

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
            <div key={fix.fix_id} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #e0e0e0' }}>
              <label style={{ display: 'block', cursor: 'pointer', marginBottom: 12 }}>
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

              {fix.mitigation_options && fix.mitigation_options.length > 0 && (
                <div style={{ marginLeft: 24, marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
                  <div className="helper" style={{ fontWeight: 600, marginBottom: 12 }}>Mitigation Strategy:</div>
                  {fix.mitigation_options.map((option: any) => (
                    <label key={option.option} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={`option_${fix.fix_id}`}
                        value={option.option}
                        checked={selectedOptions[fix.fix_id] === option.option}
                        onChange={() => setSelectedOptions((prev) => ({ ...prev, [fix.fix_id]: option.option }))}
                        style={{ marginTop: 4 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>
                          Option {option.option}: {option.name}
                        </div>
                        <div className="helper" style={{ marginBottom: 4 }}>{option.description}</div>
                        <div className="helper" style={{ color: '#666', fontSize: 12 }}>
                          <strong>Rationale:</strong> {option.rationale}
                        </div>
                        <div className="helper" style={{ color: '#666', fontSize: 12 }}>
                          <strong>Impact:</strong> {option.estimated_impact}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
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
