import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAppContext } from '../../context/AppContext';
import { ArrowRight, LayoutGrid } from 'lucide-react';

export default function Step1Upload() {
  const { 
    file, setFile, 
    setSensitiveCols, setTargetCol, setDomain,
    projectId, projects, advanceStep, refreshProjects 
  } = useAppContext();

  const [headers, setHeaders] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState<number>(0);
  const [status, setStatus] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (file && headers.length === 0) {
      file.text().then((text) => {
        const lines = text.trim().split(/\r?\n/);
        setRowCount(Math.max(lines.length - 1, 0));
        setHeaders(lines[0]?.split(',') ?? []);
      }).catch(console.error);
    }
  }, [file, headers.length]);

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

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="kicker">Step 1 of 9</div>
          <h1 className="page-title">Upload Dataset {projectId ? `for ${projects.find(p => String(p.id) === String(projectId))?.name}` : ''}</h1>
          {!projectId && (
            <div className="banner yellow" style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <LayoutGrid size={18} />
              <span>Please select or create a project from the top menu before uploading data.</span>
            </div>
          )}
          <p className="page-subtitle">Provide the dataset you want to audit for fairness. We support CSV files.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
          <div>
            <h3 className="section-title">Secure Data Ingestion</h3>
            <p className="helper">Initialize audit sequence with a valid .csv dataset.</p>
            <input
              id="file-upload"
              className="input"
              type="file"
              accept=".csv"
              onChange={(event) => event.target.files?.[0] && parseFile(event.target.files[0])}
              style={{ display: 'none' }}
            />
            <label htmlFor="file-upload" className="btn btn-secondary" style={{ marginTop: 16, cursor: 'pointer' }}>
              Browse Files
            </label>
            {file && (
              <div style={{ marginTop: 16, padding: 12, background: 'rgba(212, 163, 115, 0.1)', borderRadius: 8 }}>
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
          onClick={async () => {
            await advanceStep(2);
            navigate('/workflow/step-2');
          }} 
          disabled={!file}
        >
          Next: Configure Attributes <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
