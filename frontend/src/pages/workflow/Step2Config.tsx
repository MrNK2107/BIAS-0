import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { formApi } from '../../api/client';
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
            <Loader size={22} color="var(--text-primary)" style={{ animation: 'spin 1.2s linear infinite' }} />
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
              <Loader size={16} color="var(--accent)" className="analysis-stage-icon analysis-stage-icon-spinning" />
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
    projectId,
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
    if (!file) {
      setLocalError('Please upload a CSV file first.');
      return;
    }
    if (!projectId) {
      setLocalError('Please select or create a project from the top menu first.');
      return;
    }

    try {
      // Persist config — catch 404 gracefully
      try {
        const fd = new FormData();
        fd.append('sensitive_cols', sensitiveCols.join(','));
        fd.append('target_col', targetCol);
        await formApi.patch(`/project/${projectId}/config`, fd);
      } catch (configErr) {
        console.warn('Could not persist config, continuing anyway:', configErr);
      }

      // runFullAnalysis handles its own isAnalyzing state internally
      await runFullAnalysis();
      navigate('/workflow/step-3');
    } catch (err: any) {
      // If runFullAnalysis fails, it sets analyzeError in context.
      // We also set localError here to ensure the UI switches to the error state.
      const msg = analyzeError
        ?? err?.response?.data?.detail
        ?? err?.message
        ?? 'Analysis failed. Please check the backend is running.';
      setLocalError(msg);
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
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="section-title">Sensitive columns</div>
          <p className="helper" style={{ marginBottom: 16 }}>
            Select attributes to audit for bias. We support <strong>Multiple Selection</strong> because bias often overlaps across groups.
          </p>
          
          {/* Selected Chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {sensitiveCols.map(col => (
              <div key={col} style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 6, 
                background: 'rgba(212,163,115,0.15)', 
                color: 'var(--accent)', 
                padding: '4px 10px', 
                borderRadius: '16px',
                fontSize: '0.85rem',
                fontWeight: 600,
                border: '1px solid rgba(212,163,115,0.3)'
              }}>
                {col}
                <button 
                  onClick={() => setSensitiveCols(sensitiveCols.filter(c => c !== col))}
                  style={{ 
                    background: 'none', 
                    border: 'none', 
                    color: 'var(--accent)', 
                    cursor: 'pointer', 
                    fontSize: '1rem', 
                    padding: 0,
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  &times;
                </button>
              </div>
            ))}
            {sensitiveCols.length === 0 && <span className="helper">No attributes selected</span>}
          </div>

          {/* Dropdown Selector */}
          <select 
            className="select" 
            value="" 
            onChange={(e) => {
              const val = e.target.value;
              if (val && !sensitiveCols.includes(val)) {
                setSensitiveCols([...sensitiveCols, val]);
              }
            }}
            style={{ color: '#fff', backgroundColor: '#111' }}
          >
            <option value="" disabled>+ Add sensitive attribute...</option>
            {headers
              .filter(h => !sensitiveCols.includes(h))
              .map((header) => (
                <option key={header} value={header} style={{ color: '#fff', backgroundColor: '#111' }}>
                  {header}
                </option>
              ))}
          </select>
        </div>

        <div className="card">
          <div className="section-title">Target column</div>
          <p className="helper" style={{ marginBottom: 8 }}>The column the model predicts (e.g. 'Approved', 'Risk').</p>
          <select 
            className="select" 
            value={targetCol} 
            onChange={(event) => setTargetCol(event.target.value)}
            style={{ color: '#fff', backgroundColor: '#111' }}
          >
            {headers.map((header) => <option key={header} value={header} style={{ color: '#fff', backgroundColor: '#111' }}>{header}</option>)}
          </select>
          
          <div style={{ height: 24 }} />

          <div className="section-title">Project Domain</div>
          <p className="helper" style={{ marginBottom: 8 }}>Context-specific benchmarks for the audit.</p>
          <select 
            className="select" 
            value={domain} 
            onChange={(event) => setDomain(event.target.value)}
            style={{ color: '#fff', backgroundColor: '#111' }}
          >
            {[
              { id: 'loan', name: 'Financial Services / Loans' },
              { id: 'hiring', name: 'Human Resources / Recruitment' },
              { id: 'insurance', name: 'Insurance & Actuarial' },
              { id: 'healthcare', name: 'Healthcare & Diagnostics' },
              { id: 'education', name: 'Education & Admissions' },
              { id: 'criminal_justice', name: 'Public Safety / Law' },
              { id: 'marketing', name: 'Marketing & Personalization' },
              { id: 'other', name: 'General / Custom Domain' }
            ].map((item) => <option key={item.id} value={item.id} style={{ color: '#fff', backgroundColor: '#111' }}>{item.name}</option>)}
          </select>

          <div style={{ height: 24 }} />

          <div className="section-title">Fairness Priority</div>
          <p className="helper" style={{ marginBottom: 12 }}>Choose the metric the forensic engine should prioritize.</p>
          <div style={{ display: 'grid', gap: 12 }}>
            {[
              { id: 'balanced', name: 'Balanced Audit', desc: 'Standard audit balancing fairness and model performance.' },
              { id: 'equal_opportunity_first', name: 'Equal Opportunity', desc: 'Ensures similar True Positive Rates across all groups.' },
              { id: 'demographic_parity_first', name: 'Demographic Parity', desc: 'Ensures the same overall positive outcome rate for all.' }
            ].map(p => (
              <label key={p.id} className={`priority-card ${metricPriority === p.id ? 'active' : ''}`} style={{
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                background: metricPriority === p.id ? 'rgba(212,163,115,0.08)' : 'transparent',
                borderColor: metricPriority === p.id ? 'var(--accent)' : 'var(--border)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input 
                    type="radio" 
                    name="priority" 
                    checked={metricPriority === p.id} 
                    onChange={() => setMetricPriority(p.id)}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: metricPriority === p.id ? 'var(--accent)' : 'var(--text-primary)' }}>{p.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>{p.desc}</div>
                  </div>
                </div>
              </label>
            ))}
          </div>
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
          <input id="model-upload" className="input" type="file" accept=".pkl,.joblib" style={{ display: 'none' }} />
          <label htmlFor="model-upload" className="btn btn-secondary" style={{ marginTop: 12, cursor: 'pointer' }}>
            Browse Files
          </label>
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
