import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { ArrowRight, ArrowLeft } from 'lucide-react';

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
  } = useAppContext();

  const [headers, setHeaders] = useState<string[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!file) {
      navigate('/workflow/step-1');
      return;
    }
    
    // Parse headers to populate selects
    file.text().then(text => {
      const lines = text.trim().split(/\r?\n/);
      setHeaders(lines[0]?.split(',') ?? []);
    });
  }, [file, navigate]);

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
        <div className="helper">Choose whether to use the built-in model pipeline, upload a model file, or use an external API endpoint.</div>
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
          <div className="helper">Upload a .pkl or .joblib file. If skipped, we will train a default LightGBM model automatically.</div>
          <input className="input" type="file" accept=".pkl,.joblib" style={{ marginTop: 12 }} />
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
        <button className="btn" onClick={() => navigate('/workflow/step-1')}>
          <ArrowLeft size={16} /> Back
        </button>
        <button 
          className="btn btn-primary" 
          onClick={() => navigate('/workflow/step-3')} 
          disabled={!file || (modelType === 'api' && (!apiUrl || !requestFormat))}
        >
          Next: Run Data Audit <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
