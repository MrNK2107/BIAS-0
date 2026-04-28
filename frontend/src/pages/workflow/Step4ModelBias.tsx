import { useNavigate } from 'react-router-dom';
import FairnessTable from '../../components/FairnessTable';
import FairnessMetricsPanel from '../../components/FairnessMetricsPanel';
import HiddenBiasExplorer from '../../components/HiddenBiasExplorer';
import { useAppContext } from '../../context/AppContext';
import { ArrowRight, ArrowLeft } from 'lucide-react';

export default function Step4ModelBias() {
  const { pipelineResults, biasResult, counterfactualResult, advanceStep } = useAppContext();
  const navigate = useNavigate();

  if (!pipelineResults || !biasResult) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="kicker">Step 4 of 9</div>
            <h1 className="page-title">Model Bias</h1>
          </div>
        </div>
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <p className="helper" style={{ marginBottom: 24 }}>No analysis data yet. Please run the analysis first.</p>
          <button className="btn btn-primary" onClick={() => navigate('/workflow/step-2')}>
            Go to Configuration <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  const availableGroups = Object.keys(biasResult.group_performance || {});
  const displayGroupKey = availableGroups.length > 0 ? availableGroups[0] : null;
  const fairnessScore = Math.max(
    0,
    Math.round(100 - ((biasResult.metrics?.demographic_parity_difference || 0) * 100)),
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="kicker">Step 4 of 9</div>
          <h1 className="page-title">Model Bias</h1>
          <p className="page-subtitle">We evaluated the model across different groups to check for disparate impact.</p>
        </div>
      </div>

      <div className="card section-gap">
        <div className="stat-label">Fairness Score</div>
        <div className={`stat-number text-8xl ${fairnessScore < 70 ? 'text-red' : 'text-accent'}`}>
          {fairnessScore}
        </div>
      </div>

      <FairnessMetricsPanel
        biasResult={biasResult}
        counterfactualResult={counterfactualResult}
      />

      {displayGroupKey && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">Group performance ({displayGroupKey})</div>
          <FairnessTable data={biasResult.group_performance[displayGroupKey]} />
        </div>
      )}

      <HiddenBiasExplorer subgroups={biasResult.hidden_bias} />

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
        <button className="btn" onClick={() => navigate('/workflow/step-3')}>
          <ArrowLeft size={16} /> Back
        </button>
        <button className="btn btn-primary" onClick={async () => {
          await advanceStep(5);
          navigate('/workflow/step-5');
        }}>
          Next: Explore Explanations <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
