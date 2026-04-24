import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FairnessTable from '../../components/FairnessTable';
import FairnessMetricsPanel from '../../components/FairnessMetricsPanel';
import HiddenBiasExplorer from '../../components/HiddenBiasExplorer';
import { useAppContext } from '../../context/AppContext';
import { ArrowRight, ArrowLeft } from 'lucide-react';

export default function Step4ModelBias() {
  const { file, biasResult, runModelBias, counterfactualResult } = useAppContext();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!file) {
      navigate('/workflow/step-1');
      return;
    }
    
    if (!biasResult && !loading) {
      setLoading(true);
      runModelBias().finally(() => setLoading(false));
    }
  }, [file, biasResult, loading, runModelBias, navigate]);

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="kicker">Step 4 of 9</div>
            <h1 className="page-title">Model Bias</h1>
          </div>
        </div>
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          Running model fairness analysis. Please wait...
        </div>
      </div>
    );
  }

  if (!biasResult) return null;

  const availableGroups = Object.keys(biasResult.group_performance || {});
  const displayGroupKey = availableGroups.length > 0 ? availableGroups[0] : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="kicker">Step 4 of 9</div>
          <h1 className="page-title">Model Bias</h1>
          <p className="page-subtitle">We evaluated the model across different groups to check for disparate impact.</p>
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

      {/* Hidden Bias Explorer uses mock data for now unless backend provides biasResult.hidden_bias */}
      <HiddenBiasExplorer subgroups={biasResult.hidden_bias} />

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
        <button className="btn" onClick={() => navigate('/workflow/step-3')}>
          <ArrowLeft size={16} /> Back
        </button>
        <button className="btn btn-primary" onClick={() => navigate('/workflow/step-5')}>
          Next: Explore Explanations <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
