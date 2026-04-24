import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAppContext } from '../../context/AppContext';
import { ArrowRight } from 'lucide-react';

export default function Step1Upload() {
  const { 
    file, setFile, 
    setSensitiveCols, setTargetCol, setDomain
  } = useAppContext();

  const [headers, setHeaders] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState<number>(0);
  const [status, setStatus] = useState('');
  const navigate = useNavigate();

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

  const loadDemo = async () => {
    setStatus('Loading demo data...');
    try {
      const response = await api.get('/demo/loan');
      const csvText = response.data.csv_text as string;
      const demoFile = new File([csvText], 'demo_loan.csv', { type: 'text/csv' });
      await parseFile(demoFile);
      setSensitiveCols(['gender', 'caste']);
      setTargetCol('approved');
      setDomain('loan');
      setStatus('Demo loaded successfully.');
    } catch (err) {
      setStatus('Failed to load demo data.');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="kicker">Step 1 of 9</div>
          <h1 className="page-title">Upload Dataset</h1>
          <p className="page-subtitle">Provide the dataset you want to audit for fairness. We support CSV files.</p>
        </div>
        <button className="btn btn-ghost" onClick={loadDemo}>Use Demo Project</button>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
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
            {file && (
              <div style={{ marginTop: 16, padding: 12, background: 'rgba(79, 142, 247, 0.1)', borderRadius: 8 }}>
                <strong style={{ color: 'var(--accent)' }}>Loaded {file.name}</strong>
                <p className="helper" style={{ margin: '4px 0 0' }}>Detected {rowCount.toLocaleString()} rows and {headers.length} columns.</p>
              </div>
            )}
            {status && <p className="helper" style={{ marginTop: 8 }}>{status}</p>}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button 
          className="btn btn-primary" 
          onClick={() => navigate('/workflow/step-2')} 
          disabled={!file}
        >
          Next: Configure Attributes <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
