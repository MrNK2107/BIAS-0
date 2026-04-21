import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAppContext } from '../context/AppContext';

export default function UploadPage() {
  const { 
    file, setFile, 
    sensitiveCols, setSensitiveCols, 
    targetCol, setTargetCol, 
    domain, setDomain,
    runDataAudit, runModelBias, runRecommendFixes
  } = useAppContext();

  const [headers, setHeaders] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState<number>(0);
  const [status, setStatus] = useState('');
  const navigate = useNavigate();

  const stepLabel = useMemo(() => ['Upload', 'Audit', 'Bias', 'Fix', 'Monitor'], []);

  const parseFile = async (selected: File) => {
    setFile(selected);
    const text = await selected.text();
    const lines = text.trim().split(/\r?\n/);
    setRowCount(Math.max(lines.length - 1, 0));
    setHeaders(lines[0]?.split(',') ?? []);
  };

  const onDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const selected = event.dataTransfer.files[0];
    if (selected) {
      await parseFile(selected);
    }
  };

  const startAudit = async () => {
    if (!file) return;
    setStatus('Running data audit...');
    await runDataAudit();
    setStatus('Completed. Opening audit report...');
    navigate('/audit-report');
  };

  const loadDemo = async () => {
    setStatus('Loading demo data...');
    const response = await api.get('/demo/loan');
    const csvText = response.data.csv_text as string;
    const demoFile = new File([csvText], 'demo_loan.csv', { type: 'text/csv' });
    await parseFile(demoFile);
    setSensitiveCols(['gender', 'caste']);
    setTargetCol('approved');
    setDomain('loan');
    // For demo mode, we need to make sure the state updates are respected by the context.
    // wait for next tick for file state to bubble up or we can pass file directly
  };

  // We need an effect to run the demo pipeline after loadDemo sets the file
  const [demoTriggered, setDemoTriggered] = useState(false);
  const triggerDemoPipeline = async () => {
    setStatus('Running full Demo pipeline...');
    await runDataAudit();
    setStatus('Running Model Bias...');
    await runModelBias();
    setStatus('Generating Fix Recommendations...');
    await runRecommendFixes();
    setStatus('Done. Redirecting to Dashboard...');
    navigate('/');
  };

  useEffect(() => {
    if (demoTriggered && file && file.name === 'demo_loan.csv') {
      setDemoTriggered(false);
      triggerDemoPipeline();
    }
  }, [demoTriggered, file]);

  const handleDemoClick = () => {
    setDemoTriggered(true);
    loadDemo();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="kicker">Upload workflow</div>
          <h1 className="page-title">Load a dataset and start the audit</h1>
          <p className="page-subtitle">Drop a CSV, pick sensitive columns, and launch the fairness pipeline in one pass.</p>
        </div>
        <button className="btn btn-primary" onClick={handleDemoClick}>Load Demo Project</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="grid-2" style={{ marginBottom: 16 }}>
          {stepLabel.map((step, index) => (
            <div key={step} className="notice" style={{ borderColor: index === 0 ? 'rgba(79,142,247,0.4)' : undefined }}>
              <strong>{index + 1}. {step}</strong>
            </div>
          ))}
        </div>

        <div className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
          <div>
            <h3 className="section-title">CSV drag and drop</h3>
            <p className="helper">Drop a .csv file here or choose one manually.</p>
            <input
              className="input"
              type="file"
              accept=".csv"
              onChange={(event) => event.target.files?.[0] && parseFile(event.target.files[0])}
              style={{ maxWidth: 380, marginTop: 12 }}
            />
            {file && <p className="helper">Loaded {file.name} with {rowCount.toLocaleString()} rows.</p>}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="section-title">Sensitive columns</div>
          <div className="helper">Auto-populated from the CSV headers.</div>
          <select className="select" multiple value={sensitiveCols} onChange={(event) => setSensitiveCols(Array.from(event.target.selectedOptions).map((option) => option.value))} style={{ minHeight: 120, marginTop: 12 }}>
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
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-title">Model upload</div>
        <div className="helper">Optional .pkl or .joblib file. You can skip this for the built-in model.</div>
        <input className="input" type="file" accept=".pkl,.joblib" />
        <div style={{ height: 12 }} />
        <button className="btn btn-primary" onClick={startAudit} disabled={!file}>Start Audit</button>
        {status && <p className="helper">{status}</p>}
      </div>
    </div>
  );
}
