import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { ArrowRight, ArrowLeft, CheckCircle, Circle, Loader } from 'lucide-react';

const ANALYSIS_STAGES = [
  { label: 'Scanning dataset for representation gaps', duration: 2200 },
  { label: 'Detecting proxy feature correlations', duration: 3800 },
  { label: 'Training model & computing fairness metrics', duration: 6500 },
  { label: 'Calculating SHAP values for explanations', duration: 9500 },
  { label: 'Running counterfactual fairness tests', duration: 13000 },
  { label: 'Probing model under stress perturbations', duration: 17000 },
  { label: 'Generating fix recommendations', duration: 20000 },
];

const STAGE_COMPLETE_MS = 20000; // when all fake stages tick off

function AnalysisLoadingScreen({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const [isFinalizingPhase, setIsFinalizingPhase] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setElapsed(prev => prev + 100), 100);
    const finalizingTimer = window.setTimeout(() => setIsFinalizingPhase(true), STAGE_COMPLETE_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(finalizingTimer);
    };
  }, []);

  const completedCount = ANALYSIS_STAGES.filter(s => elapsed >= s.duration).length;
  const allStagesDone = completedCount === ANALYSIS_STAGES.length;
  const showFinalizing = isFinalizingPhase || allStagesDone;
  const progressPct = showFinalizing
    ? undefined
    : Math.min(Math.round((completedCount / ANALYSIS_STAGES.length) * 100), 91);

  if (error) {
    return (
      <div className="analysis-screen">
        <div className="analysis-card">
          <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>⚠️</div>
          <h2 style={{ color: 'var(--red)', marginBottom: 12 }}>Analysis Failed</h2>
          <p className="helper" style={{ marginBottom: 24 }}>{error}</p>
          <button className="btn btn-primary" onClick={onRetry}>Retry Analysis</button>
        </div>
      </div>
    );
  }

  return (
    <div className="analysis-screen">
      <div className="analysis-card">
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div className="analysis-spinner-ring">
            <Loader size={22} color="white" style={{ animation: 'spin 1.2s linear infinite' }} />
          </div>
          <h2 style={{ margin: 0, marginBottom: 8, fontSize: '1.4rem', color: 'var(--text-primary)' }}>
            {showFinalizing ? 'Finalizing Results…' : 'Running Full Analysis'}
          </h2>
          <p className="helper" style={{ margin: 0 }}>
            {showFinalizing
              ? 'All stages complete — writing results to database.'
              : 'Computing all 7 fairness stages — this takes 20–40 seconds.'}
          </p>
        </div>

        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            <span>Progress</span>
            <span>{showFinalizing ? 'Finalizing…' : `${progressPct}%`}</span>
          </div>
          <div className="analysis-progress-track">
            {showFinalizing ? (
              <div className="analysis-progress-indeterminate" />
            ) : (
              <div className="analysis-progress-fill" style={{ width: `${progressPct}%` }} />
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ANALYSIS_STAGES.map((stage, i) => {
            const done = elapsed >= stage.duration;
            const active = !done && (i === 0 || elapsed >= ANALYSIS_STAGES[i - 1].duration);
            return (
              <div key={stage.label} className={`analysis-stage ${done ? 'is-complete' : active ? 'is-active' : ''}`}>
                {done ? (
                  <CheckCircle size={16} color="var(--green)" className="analysis-stage-icon" />
                ) : active ? (
                  <Loader size={16} color="var(--accent)" className="analysis-stage-icon analysis-stage-icon-spinning" />
                ) : (
                  <Circle size={16} color="var(--text-secondary)" className="analysis-stage-icon" />
                )}
                <span className={`analysis-stage-label ${done ? 'is-complete' : active ? 'is-active' : ''}`}>
                  {stage.label}
                </span>
              </div>
            );
          })}

          {showFinalizing && (
            <div className="analysis-stage analysis-stage-finalizing">
              <Loader size={16} color="#a78bfa" className="analysis-stage-icon analysis-stage-icon-spinning" />
              <span className="analysis-stage-label analysis-stage-label-finalizing">
                Persisting results &amp; preparing insights…
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Step2Config() {
  const {
    file,
    sensitiveCols, setSensitiveCols,
    targetCol, setTargetCol,
    domain, setDomain,
    modelType, setModelType,
    apiUrl, setApiUrl,
    requestFormat, setRequestFormat,
    metricPriority, setMetricPriority,
    isAnalyzing, analyzeError,
    runFullAnalysis,
  } = useAppContext();

  const [headers, setHeaders] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!file) {
      navigate('/workflow/step-1');
      return;
    }
    file.text().then(text => {
      const lines = text.trim().split(/\r?\n/);
      setHeaders(lines[0]?.split(',') ?? []);
    });
  }, [file, navigate]);

  const handleStartAnalysis = async () => {
    setLocalError(null);
    try {
      await runFullAnalysis();
      navigate('/workflow/step-3');
    } catch {
      // analyzeError is already set in context; keep local error in sync
      setLocalError(analyzeError);
    }
  };

  // Show full-page loading/error overlay while analysis is running
  if (isAnalyzing || (analyzeError && !localError)) {
    return (
      <AnalysisLoadingScreen
        error={analyzeError}
        onRetry={handleStartAnalysis}
      />
    );
  }

  // Show error state after a failed attempt
  if (localError) {
    return (
      <AnalysisLoadingScreen
        error={localError}
        onRetry={handleStartAnalysis}
      />
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="kicker">Step 2 of 9</div>
          <h1 className="page-title">Configuration</h1>
          <p className="page-subtitle">Select the sensitive attributes and define how the model should be accessed.</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="section-title">Sensitive columns</div>
          <div className="helper">Select columns that contain protected attributes (e.g., race, gender).</div>
          <select
            className="select"
            multiple
            value={sensitiveCols}
            onChange={(event) => setSensitiveCols(Array.from(event.target.selectedOptions).map((option) => option.value))}
            style={{ minHeight: 120, marginTop: 12 }}
          >
            {headers.map((header) => <option key={header} value={header}>{header}</option>)}
          </select>
        </div>
        <div className="card">
          <div className="section-title">Target column</div>
          <select className="select" value={targetCol} onChange={(event) => setTargetCol(event.target.value)}>
            {headers.map((header) => <option key={header} value={header}>{header}</option>)}
          </select>
          <div style={{ height: 16 }} />

          <div className="section-title">Domain</div>
          <select className="select" value={domain} onChange={(event) => setDomain(event.target.value)}>
            {['loan', 'hiring', 'insurance', 'healthcare'].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <div style={{ height: 16 }} />

          <div className="section-title">Fairness Priority</div>
          <select className="select" value={metricPriority} onChange={(event) => setMetricPriority(event.target.value)}>
            <option value="balanced">Balanced (Default)</option>
            <option value="equal_opportunity_first">Equal Opportunity First</option>
            <option value="demographic_parity_first">Demographic Parity First</option>
          </select>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-title">Model source</div>
        <div className="helper">Choose whether to use the built-in model pipeline or an external API endpoint.</div>
        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="radio"
              value="file"
              checked={modelType === 'file'}
              onChange={(e) => setModelType(e.target.value as 'file' | 'api')}
            />
            Built-in / File Upload
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="radio"
              value="api"
              checked={modelType === 'api'}
              onChange={(e) => setModelType(e.target.value as 'file' | 'api')}
            />
            API Endpoint
          </label>
        </div>
      </div>

      {modelType === 'api' && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-title">API Configuration</div>
          <div className="helper">Configure your model API endpoint for bias analysis.</div>
          <div style={{ marginTop: 12 }}>
            <label className="helper" style={{ display: 'block', marginBottom: 8 }}>Model API URL</label>
            <input
              className="input"
              type="text"
              placeholder="https://api.example.com/predict"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <label className="helper" style={{ display: 'block', marginBottom: 8 }}>Request format template (JSON)</label>
            <textarea
              className="input"
              placeholder={'{"input": "{feature1}", "age": {age}, "score": {score}}'}
              value={requestFormat}
              onChange={(e) => setRequestFormat(e.target.value)}
              style={{ width: '100%', minHeight: 100, fontFamily: 'monospace' }}
            />
            <p className="helper" style={{ marginTop: 8 }}>Use {'{column_name}'} as placeholders for CSV columns</p>
          </div>
        </div>
      )}

      {modelType === 'file' && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-title">Model upload (Optional)</div>
          <div className="helper">Upload a .pkl or .joblib file. If skipped, we will train a default RF model automatically.</div>
          <input className="input" type="file" accept=".pkl,.joblib" style={{ marginTop: 12 }} />
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
        <button className="btn" onClick={() => navigate('/workflow/step-1')}>
          <ArrowLeft size={16} /> Back
        </button>
        <button
          className="btn btn-primary"
          onClick={handleStartAnalysis}
          disabled={!file || (modelType === 'api' && (!apiUrl || !requestFormat))}
        >
          Start Full Analysis <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
