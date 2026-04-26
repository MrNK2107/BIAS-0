import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SandboxComparison from '../../components/SandboxComparison';
import { useAppContext } from '../../context/AppContext';

export default function Step8Sandbox() {
  const { file, pipelineResults, recommendResult, runSandboxSimulation, sandboxResult } = useAppContext();
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const navigate = useNavigate();


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

  const handleSimulate = async (fixesToRun?: string[]) => {
    setScenarioLoading(true);
    try {
      await runSandboxSimulation(fixesToRun || selected);
    } catch (e) {
      console.error('Simulation failed', e);
    } finally {
      setScenarioLoading(false);
    }
  };

  if (!file) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <h2 style={{ marginBottom: 16 }}>No dataset uploaded</h2>
        <p className="helper" style={{ marginBottom: 24 }}>Please go back and upload a dataset to begin.</p>
        <button className="btn btn-primary" onClick={() => navigate('/workflow/step-1')}>Go to Upload</button>
      </div>
    );
  }

  if (loading || !pipelineResults || !recommendResult) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <h2>Generating fix recommendations...</h2>
        <p className="helper">Analyzing bias and stress test results to suggest actionable fixes.</p>
      </div>
    );
  }

  const getCategory = (fixType: string) => {
    const t = fixType.toLowerCase();
    if (t.includes('data') || t.includes('sample') || t.includes('feature') || t.includes('reweighing')) return 'Data Fixes';
    if (t.includes('threshold') || t.includes('policy') || t.includes('human')) return 'Policy Fixes';
    return 'Model Fixes';
  };

  const dataFixes = recommendResult.filter((r: any) => getCategory(r.fix_type) === 'Data Fixes');
  const modelFixes = recommendResult.filter((r: any) => getCategory(r.fix_type) === 'Model Fixes');
  const policyFixes = recommendResult.filter((r: any) => getCategory(r.fix_type) === 'Policy Fixes');

  const renderFixGroup = (title: string, fixes: any[]) => {
    if (!fixes || fixes.length === 0) return null;
    return (
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ borderBottom: '0.5px solid var(--border)', paddingBottom: 8, marginBottom: 16, color: 'var(--text-primary)' }}>{title}</h3>
        <div className="grid-2">
          {fixes.map(fix => {
            const isApplied = selected.includes(fix.fix_id);
            const rationale = fix.mitigation_options?.[0]?.rationale || 'Addresses identified bias patterns directly.';
            
            return (
              <div className="card" key={fix.fix_id} style={{ display: 'flex', flexDirection: 'column', height: '100%', border: isApplied ? '0.5px solid rgba(212,163,115,0.72)' : '0.5px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {fix.fix_type.replace(/_/g, ' ').toUpperCase()}
                  </div>
                  {isApplied && <span className="pill green">Active</span>}
                </div>
                
                <div style={{ marginBottom: 12, fontSize: '0.95rem' }}>
                  <strong style={{ color: 'var(--text-secondary)' }}>What to do:</strong>
                  <div style={{ color: 'var(--text-primary)', marginTop: 4 }}>{fix.description}</div>
                </div>

                <div style={{ marginBottom: 12, fontSize: '0.95rem' }}>
                  <strong style={{ color: 'var(--text-secondary)' }}>Why it helps:</strong>
                  <div style={{ color: 'var(--text-primary)', marginTop: 4 }}>{rationale}</div>
                </div>

                <div style={{ marginBottom: 24, fontSize: '0.95rem', flexGrow: 1 }}>
                  <strong style={{ color: 'var(--text-secondary)' }}>Expected impact:</strong>
                  <div style={{ color: 'var(--accent)', marginTop: 4, fontWeight: 500 }}>{fix.estimated_impact}</div>
                </div>

                <button 
                  className={`btn ${isApplied ? 'btn-secondary' : 'btn-primary'}`}
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => {
                    let newSelected;
                    if (isApplied) {
                      newSelected = selected.filter(id => id !== fix.fix_id);
                    } else {
                      newSelected = [...selected, fix.fix_id];
                    }
                    setSelected(newSelected);
                    handleSimulate(newSelected);
                  }}
                  disabled={scenarioLoading}
                >
                  {scenarioLoading ? 'Running...' : isApplied ? 'Remove from Sandbox' : 'Apply in Sandbox'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="kicker">Step 8 of 9</div>
          <h1 className="page-title">Sandbox Fixes</h1>
          <p className="helper" style={{ marginTop: 8 }}>
            Review AI-generated recommendations to mitigate bias. Apply fixes to your sandbox environment to simulate their impact.
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 40 }}>
        {renderFixGroup('Data Fixes', dataFixes)}
        {renderFixGroup('Model Fixes', modelFixes)}
        {renderFixGroup('Policy Fixes', policyFixes)}
        {recommendResult.length === 0 && <span className="helper">No fixes recommended based on the current results.</span>}
      </div>

      {sandboxResult && (
        <div className="card fade-in" style={{ marginBottom: 24 }}>
          <div className="section-title">Sandbox Comparison Results</div>
          <p className="helper" style={{ marginBottom: 16 }}>Review how your applied fixes impacted fairness metrics vs. overall accuracy.</p>
          <SandboxComparison scenarios={sandboxResult} />
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32 }}>
        <button className="btn btn-secondary" onClick={() => navigate('/workflow/step-7')}>
          Back
        </button>
        <button className="btn btn-primary" onClick={() => navigate('/workflow/step-9')}>
          Continue to Monitoring Setup
        </button>
      </div>
    </div>
  );
}
