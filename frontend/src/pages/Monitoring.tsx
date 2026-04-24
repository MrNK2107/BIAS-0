import React, { useEffect, useState } from 'react';
import MonitoringChart from '../components/MonitoringChart';
import { useAppContext } from '../context/AppContext';
import { formApi, api } from '../api/client';

export default function Monitoring() {
  const { file, sensitiveCols, targetCol, monitoringResult, getMonitoringData, runMonitoringSimulation, projectId } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [driftFile, setDriftFile] = useState<File | null>(null);
  const [driftReport, setDriftReport] = useState<any>(null);
  const [driftLoading, setDriftLoading] = useState(false);
  const [flags, setFlags] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'overall' | 'group'>('overall');

  const fetchFlags = async () => {
    try {
      const res = await api.get(`/monitoring/flags/${projectId}`);
      setFlags(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchFlags();
  }, [projectId]);

  const resolveFlag = async (flagId: number) => {
    try {
      await api.patch(`/monitoring/flag/${flagId}`);
      fetchFlags();
    } catch (e) {
      console.error(e);
    }
  };

  const runDriftCheck = async () => {
    if (!driftFile || !file) return;
    setDriftLoading(true);
    const fd = new FormData();
    fd.append('baseline_file', file);
    fd.append('current_file', driftFile);
    fd.append('sensitive_cols', sensitiveCols.join(','));
    fd.append('target_col', targetCol);
    
    try {
      const res = await formApi.post('/monitoring/drift', fd);
      setDriftReport(res.data);
    } finally {
      setDriftLoading(false);
    }
  };

  useEffect(() => {
    if (!monitoringResult && !loading) {
      setLoading(true);
      getMonitoringData().finally(() => setLoading(false));
    }
  }, [monitoringResult, loading, getMonitoringData]);

  const handleSimulate = async () => {
    setSimulating(true);
    await runMonitoringSimulation();
    setSimulating(false);
  };

  const handleLiveIngestion = async () => {
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    // Assuming CSV header present, skip header
    const rows = lines.slice(1);
    const chunkSize = Math.ceil(rows.length / 5);
    for (let i = 0; i < 5; i++) {
      const chunkRows = rows.slice(i * chunkSize, (i + 1) * chunkSize);
      const predictions = chunkRows.map(r => {
        const cols = r.split(',');
        const [record_id, prediction, sensitive_attrs, timestamp] = cols;
        let attrs = {};
        try { attrs = JSON.parse(sensitive_attrs); } catch (e) {}
        return { record_id: Number(record_id), prediction: Number(prediction), sensitive_attrs: attrs, timestamp };
      });
      const payload = { project_id: 1, predictions };
      await formApi.post('/monitoring/ingest', payload);
      // Refresh monitoring data after each batch
      await getMonitoringData();
      await new Promise(r => setTimeout(r, 500));
    }
  };

  if (loading || !monitoringResult) {
    return <div className="card" style={{ padding: 40, textAlign: 'center' }}>Loading monitoring tracking data...</div>;
  }

  const { events, current_risk_level, trend } = monitoringResult;
  const current = events[events.length - 1] || { fairness_score: 0, alert: false };
  const status = current_risk_level || 'Green';

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="kicker">Monitoring</div>
          <h1 className="page-title">Live fairness tracking after deployment</h1>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-primary" onClick={handleLiveIngestion} disabled={simulating}>
            {simulating ? 'Ingesting...' : 'Simulate Live Ingestion'}
          </button>
          <button className="btn btn-primary" onClick={handleSimulate} disabled={simulating}>
            {simulating ? 'Simulating...' : 'Simulate 30 days of monitoring'}
          </button>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 16 }}>
        <div className="card"><div className="section-title">Current score</div><div className="stat-number">{current.fairness_score}</div></div>
        <div className="card"><div className="section-title">Trend</div><div className="stat-number" style={{ textTransform: 'capitalize' }}>{trend}</div></div>
        <div className="card"><div className="section-title">Current status</div><span className={`pill ${status.toLowerCase()}`}>{status}</span></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Fairness score over time</div>
          <div className="tabs" style={{ background: 'rgba(148,163,184,0.08)', padding: 4, borderRadius: 8, display: 'flex', gap: 4 }}>
            <button 
              className={`btn btn-small ${viewMode === 'overall' ? 'btn-primary' : ''}`} 
              style={{ padding: '6px 12px', fontSize: '0.85rem' }}
              onClick={() => setViewMode('overall')}
            >
              Overall Score
            </button>
            <button 
              className={`btn btn-small ${viewMode === 'group' ? 'btn-primary' : ''}`} 
              style={{ padding: '6px 12px', fontSize: '0.85rem' }}
              onClick={() => setViewMode('group')}
            >
              Approval by Group
            </button>
          </div>
        </div>
        {events && events.length > 0 ? (
          <MonitoringChart events={events} viewMode={viewMode} />
        ) : (
          <div className="helper">No monitoring events recorded yet.</div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Data Drift Detection</div>
        <div className="grid-2">
          <div>
            <div className="helper" style={{ marginBottom: 8 }}>Upload "Current" production data to compare against baseline:</div>
            <input 
              type="file" 
              className="input" 
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDriftFile(e.target.files?.[0] || null)} 
              accept=".csv"
            />
            <button 
              className="btn" 
              style={{ marginTop: 12 }} 
              onClick={runDriftCheck} 
              disabled={!driftFile || driftLoading}
            >
              {driftLoading ? 'Analyzing...' : 'Check for Data Drift'}
            </button>
          </div>
          <div>
            {driftReport ? (
              <div className={`notice ${driftReport.drift_alert ? 'notice-individual' : ''}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  {driftReport.drift_alert ? <span>⚠️</span> : <span>✅</span>}
                  <strong>{driftReport.drift_message}</strong>
                </div>
                {driftReport.drifted_features.length > 0 && (
                  <div className="helper">
                    Drifted features: {driftReport.drifted_features.join(', ')}
                  </div>
                )}
                {Object.entries(driftReport.sensitive_distribution_shift).map(([col, shift]: [string, any]) => (
                  <div key={col} className="helper">
                    {col} shift: {(shift * 100).toFixed(1)}%
                  </div>
                ))}
              </div>
            ) : (
              <div className="helper" style={{ textAlign: 'center', paddingTop: 20 }}>
                Upload a dataset to run drift analysis.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Flagged Decisions</div>
        <div className="notice-list">
          {flags.length === 0 && <div className="helper">No unresolved flags.</div>}
          {flags.map((flag: any) => (
            <div className="notice notice-individual" key={flag.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>Record {flag.record_id}</strong>
                  <div className="helper" style={{ marginTop: 4 }}>Reason: {flag.reason}</div>
                  <div className="helper" style={{ fontSize: '0.8rem' }}>Flagged by: {flag.flagged_by} • {new Date(flag.timestamp).toLocaleString()}</div>
                </div>
                <button className="btn btn-small" onClick={() => resolveFlag(flag.id)}>Mark Resolved</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="section-title">Alert log</div>
        <div className="notice-list">
          {events && events.filter((event: any) => event.alert).length === 0 && <div className="helper">No alerts generated.</div>}
          {events && events.filter((event: any) => event.alert).slice(0, 5).map((event: any) => (
            <div className="notice" key={event.timestamp}>
              <strong>{new Date(event.timestamp).toLocaleString()}</strong>
              <div className="helper">{event.note}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
