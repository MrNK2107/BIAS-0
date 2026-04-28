import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import MonitoringChart from '../../components/MonitoringChart';
import { useAppContext } from '../../context/AppContext';
import { formApi, api } from '../../api/client';
import { AlertTriangle, Flag, Activity, Info, CheckCircle, Clock, TrendingUp, TrendingDown, Shield, ChevronDown, ChevronUp, Zap } from 'lucide-react';

const S: Record<string, React.CSSProperties> = {
  header: { display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:22 },
  statsRow: { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 },
  statCard: { padding:20, display:'flex', flexDirection:'column', gap:6 },
  statLabel: { fontSize:'0.78rem', color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.12em' },
  statVal: { fontSize:'1.8rem', fontWeight:700, lineHeight:1.1 },
  statSub: { fontSize:'0.82rem', color:'var(--text-secondary)', marginTop:2 },
  mainGrid: { display:'grid', gridTemplateColumns:'1fr 380px', gap:24, alignItems:'start' },
  leftCol: { display:'flex', flexDirection:'column', gap:24 },
  tlCard: { maxHeight:780, overflowY:'auto', padding:'20px 16px' },
  tlLine: { position:'relative', paddingLeft:28, marginLeft:14, borderLeft:'1px solid var(--border)' },
  tlNode: { position:'absolute', left:-37, top:0, width:24, height:24, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 0 4px var(--bg)' },
  tlContent: { cursor:'pointer', padding:'10px 14px', borderRadius:12, border:'1px solid transparent', transition:'all 0.2s' },
  tlContentSel: { backgroundColor:'rgba(79,142,247,0.06)', border:'1px solid rgba(79,142,247,0.2)' },
  tlTitle: { fontWeight:600, color:'#f0f4ff', fontSize:'0.92rem' },
  tlDate: { fontSize:'0.78rem', color:'var(--text-secondary)' },
  tlDesc: { fontSize:'0.85rem', color:'var(--text-secondary)', marginTop:4 },
  detail: { marginTop:10, marginLeft:12, padding:16, backgroundColor:'rgba(255,255,255,0.03)', borderRadius:12, border:'0.5px solid var(--border)', fontSize:'0.88rem', color:'var(--text-primary)', animation:'fadeIn 0.2s ease-out' },
  detailRow: { display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'0.5px solid var(--border)' },
  driftBox: { display:'flex', gap:16, alignItems:'flex-start' },
  badge: { display:'inline-flex', alignItems:'center', gap:4, padding:'3px 10px', borderRadius:999, fontSize:'0.72rem', fontWeight:600 },
};

const COLORS: Record<string, string> = { alert:'#BC4749', drift_alert:'#BC4749', flag:'#D4A373', info:'#D4A373' };
const ICONS: Record<string, React.ReactNode> = {
  alert: <AlertTriangle size={13} color="#fff" />, drift_alert: <Activity size={13} color="#fff" />,
  flag: <Flag size={13} color="#fff" />, info: <Info size={13} color="#fff" />,
};

export default function Step9Monitoring() {
  const { file, sensitiveCols, targetCol, monitoringResult, getMonitoringData, runMonitoringSimulation, projectId } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [driftFile, setDriftFile] = useState<File | null>(null);
  const [driftReport, setDriftReport] = useState<any>(null);
  const [driftLoading, setDriftLoading] = useState(false);
  const [flags, setFlags] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'overall' | 'group'>('overall');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [monitorData, setMonitorData] = useState<any>(null);
  const [trendData, setTrendData] = useState<any>(null);
  const navigate = useNavigate();

  const fetchFlags = async () => { try { const r = await api.get(`/monitoring/flags/${projectId}`); setFlags(r.data); } catch {} };
  useEffect(() => { fetchFlags(); }, [projectId]);
  const resolveFlag = async (id: number) => { try { await api.patch(`/monitoring/flag/${id}`); fetchFlags(); } catch {} };

  const fetchMonitorData = async () => {
    if (projectId) {
      try {
        const [mon, trn] = await Promise.all([
          api.get(`/monitoring/project/${projectId}/monitor`),
          api.get(`/monitoring/project/${projectId}/trend`)
        ]);
        setMonitorData(mon.data);
        setTrendData(trn.data);
      } catch {}
    }
  };
  useEffect(() => { fetchMonitorData(); }, [projectId, monitoringResult]);

  const runDriftCheck = async () => {
    if (!driftFile || !file) return;
    setDriftLoading(true);
    const fd = new FormData();
    fd.append('baseline_file', file); fd.append('current_file', driftFile);
    fd.append('sensitive_cols', sensitiveCols.join(',')); fd.append('target_col', targetCol);
    try { const r = await formApi.post('/monitoring/drift', fd); setDriftReport(r.data); } finally { setDriftLoading(false); }
  };

  useEffect(() => {
    if (!monitoringResult && !loading) { setLoading(true); getMonitoringData().finally(() => setLoading(false)); }
  }, [monitoringResult, loading, getMonitoringData]);

  const handleSimulate = async () => { setSimulating(true); await runMonitoringSimulation(); setSimulating(false); };

  const handleLiveIngestion = async () => {
    if (!file) return;
    const text = await file.text(); const lines = text.split(/\r?\n/).filter(l => l.trim()); const rows = lines.slice(1);
    const chunkSize = Math.ceil(rows.length / 5);
    for (let i = 0; i < 5; i++) {
      const chunk = rows.slice(i * chunkSize, (i + 1) * chunkSize);
      const predictions = chunk.map(r => {
        const [record_id, prediction, sensitive_attrs, timestamp] = r.split(',');
        let attrs = {}; try { attrs = JSON.parse(sensitive_attrs); } catch {}
        return { record_id: Number(record_id), prediction: Number(prediction), sensitive_attrs: attrs, timestamp };
      });
      await formApi.post('/monitoring/ingest', { project_id: parseInt(projectId), predictions });
      await getMonitoringData(); await new Promise(r => setTimeout(r, 500));
    }
  };

  // Build timeline
  const timelineEvents = useMemo(() => {
    const all: any[] = [];
    if (monitoringResult?.events) {
      monitoringResult.events.forEach((e: any, i: number) => {
        all.push({ id:`evt-${i}`, timestamp: new Date(e.timestamp).getTime(),
          dateStr: new Date(e.timestamp).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }),
          type: e.alert ? 'alert' : 'info', title: e.alert ? '⚠ Incident Detected' : 'Monitoring Check',
          description: e.alert ? `Fairness dropped to ${e.fairness_score.toFixed(1)}` : `Score: ${e.fairness_score.toFixed(1)}`,
          fairness_score: e.fairness_score, details: e.group_breakdown });
      });
    }
    flags.forEach((f: any) => {
      all.push({ id:`flag-${f.id}`, timestamp: new Date(f.timestamp).getTime(),
        dateStr: new Date(f.timestamp).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }),
        type:'flag', title:`🚩 Flagged Record #${f.record_id}`, description:`Reason: ${f.reason}`, details: f });
    });
    if (driftReport) {
      all.push({ id:'drift-latest', timestamp: Date.now(),
        dateStr: new Date().toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }),
        type: driftReport.drift_alert ? 'drift_alert' : 'info', title: driftReport.drift_alert ? '↕ Drift Warning' : 'Drift Check — Clear',
        description: driftReport.drift_message, details: driftReport });
    }
    return all.sort((a, b) => b.timestamp - a.timestamp);
  }, [monitoringResult, flags, driftReport]);

  const filteredEvents = filterType === 'all' ? timelineEvents : timelineEvents.filter(e => e.type === filterType);

  // Chart incident markers
  const chartIncidents = useMemo(() => {
    if (!monitoringResult?.events) return [];
    return monitoringResult.events.filter((e: any) => e.alert).map((e: any) => ({ timestamp: e.timestamp, label: 'Incident', type: 'incident' as const }));
  }, [monitoringResult]);

  // No file guard
  if (!file) return (
    <div className="card" style={{ padding:40, textAlign:'center' }}>
      <h2 style={{ marginBottom:16 }}>No dataset uploaded</h2>
      <p className="helper" style={{ marginBottom:24 }}>Please go back and upload a dataset to begin.</p>
      <button className="btn btn-primary" onClick={() => navigate('/workflow/step-1')}>Go to Upload</button>
    </div>
  );

  // Loading guard
  if (loading || !monitoringResult) return (
    <div className="card" style={{ padding:40, textAlign:'center' }}>
      <h2>Loading Monitoring Data...</h2>
      <p className="helper">Fetching historical performance and tracking alerts.</p>
    </div>
  );

  const { events, current_risk_level, trend } = monitoringResult;
  const current = events[events.length - 1] || { fairness_score: 0, alert: false };
  const status = current_risk_level || 'Green';
  const alertCount = timelineEvents.filter(e => e.type === 'alert').length;
  const driftCount = timelineEvents.filter(e => e.type === 'drift_alert').length;

  const trendIcon = trend === 'improving' ? <TrendingUp size={16} color="var(--accent)" /> : trend === 'declining' ? <TrendingDown size={16} color="var(--warning)" /> : <Activity size={16} color="var(--text-secondary)" />;
  const trendColor = trend === 'improving' ? 'var(--accent)' : trend === 'declining' ? 'var(--warning)' : 'var(--text-secondary)';

  const driftDetected = monitorData?.drift_detected;
  const degradationDetected = trendData?.degradation_detected;

  return (
    <div>
      {(driftDetected || degradationDetected) && (
        <div style={{ background: 'rgba(188,71,73,0.15)', border: '1px solid #bc4749', borderRadius: 12, padding: '12px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
          <AlertTriangle color="#bc4749" size={24} />
          <div>
            <strong style={{ color: '#bc4749', fontSize: '1.05rem' }}>
              {degradationDetected ? 'Sequential Performance Degradation' : 'Critical Score Drift Detected'}
            </strong>
            <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              {degradationDetected 
                ? 'The fairness score has dropped consistently over the last 3 runs. Investigate recent model or data changes.'
                : 'The fairness score has dropped by more than 15% since the last monitoring check. Immediate audit recommended.'}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={S.header}>
        <div>
          <div className="kicker">Step 9 of 9</div>
          <h1 className="page-title">Continuous Monitoring</h1>
          <p className="helper" style={{ marginTop:8 }}>Track fairness over time. Detect drift. Investigate incidents.</p>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-secondary" onClick={handleLiveIngestion} disabled={simulating}>
            {simulating ? 'Ingesting...' : 'Simulate Live Ingestion'}
          </button>
          <button className="btn btn-primary" onClick={handleSimulate} disabled={simulating}>
            <Zap size={16} /> {simulating ? 'Simulating...' : 'Simulate 30 Days'}
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div style={S.statsRow}>
        <div className="card" style={S.statCard}>
          <div style={S.statLabel}>Current Score</div>
          <div style={{...S.statVal, color: current.fairness_score >= 70 ? 'var(--accent)' : 'var(--warning)' }}>{current.fairness_score.toFixed(1)}</div>
          <div style={S.statSub}>out of 100</div>
        </div>
        <div className="card" style={S.statCard}>
          <div style={S.statLabel}>Trend</div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4 }}>
            {trendIcon}
            <span style={{...S.statVal, fontSize:'1.4rem', color: trendColor, textTransform:'capitalize' }}>{trend || 'stable'}</span>
          </div>
        </div>
        <div className="card" style={S.statCard}>
          <div style={S.statLabel}>Incidents</div>
          <div style={{...S.statVal, color: alertCount > 0 ? 'var(--warning)' : 'var(--accent)' }}>{alertCount}</div>
          <div style={S.statSub}>{driftCount} drift warning{driftCount !== 1 ? 's' : ''}</div>
        </div>
        <div className="card" style={S.statCard}>
          <div style={S.statLabel}>Stability Score</div>
          <div style={{...S.statVal, color: (trendData?.stability_score || 0) > 85 ? 'var(--accent)' : 'var(--warning)' }}>
            {trendData?.stability_score ? trendData.stability_score.toFixed(1) : '--'}
          </div>
          <div style={S.statSub}>Reliability metric</div>
        </div>
        <div className="card" style={S.statCard}>
          <div style={S.statLabel}>Risk Status</div>
          <div style={{ marginTop:6 }}>
            <span className={`pill ${status.toLowerCase()}`} style={{ fontSize:'1rem', padding:'6px 16px' }}>
              <Shield size={14} /> {status}
            </span>
          </div>
        </div>
      </div>

      {/* Main layout: chart + timeline */}
      <div style={S.mainGrid}>
        <div style={S.leftCol as any}>
          {/* Chart */}
          <div className="card">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div className="section-title" style={{ marginBottom:0 }}>Fairness Score Over Time</div>
              <div style={{ display:'flex', gap:4, background:'var(--surface-raised)', padding:4, borderRadius:8, border: '0.5px solid var(--border)' }}>
                {(['overall','group'] as const).map(m => (
                  <button key={m} className={`btn btn-small ${viewMode === m ? 'btn-primary' : ''}`}
                    style={{ padding:'6px 12px', fontSize:'0.82rem' }} onClick={() => setViewMode(m)}>
                    {m === 'overall' ? 'Overall Score' : 'By Group'}
                  </button>
                ))}
              </div>
            </div>
            {events?.length > 0 ? (
              <MonitoringChart events={events} viewMode={viewMode} incidents={chartIncidents}
                onDotClick={(evt: any) => {
                  const idx = events.indexOf(evt);
                  if (idx >= 0) setSelectedEventId(`evt-${idx}`);
                }} />
            ) : <div className="helper">No monitoring events recorded yet.</div>}
          </div>

          {/* Drift Detection */}
          <div className="card">
            <div className="section-title">Data Drift Detection</div>
            <p className="helper" style={{ marginBottom:16 }}>Compare recent production data against the baseline to detect distribution shifts.</p>
            <div style={S.driftBox}>
              <div style={{ flex:1 }}>
                <input type="file" className="input" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDriftFile(e.target.files?.[0] || null)} accept=".csv" />
                <button className="btn btn-secondary" style={{ marginTop:12 }} onClick={runDriftCheck} disabled={!driftFile || driftLoading}>
                  <Activity size={14} /> {driftLoading ? 'Analyzing...' : 'Check for Drift'}
                </button>
              </div>
              {driftReport && (
                <div style={{ flex:1, padding:16, borderRadius:12, border:`0.5px solid ${driftReport.drift_alert ? 'rgba(188,71,73,0.45)' : 'rgba(212,163,115,0.45)'}`, background: driftReport.drift_alert ? 'rgba(188,71,73,0.1)' : 'rgba(212,163,115,0.1)' }}>
                  <div style={{ fontWeight:600, marginBottom:8, color: driftReport.drift_alert ? '#ef4444' : 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {driftReport.drift_alert ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
                    {driftReport.drift_alert ? 'Significant Drift Detected' : 'No Significant Drift'}
                  </div>
                  <div style={{ fontSize:'0.85rem', color:'var(--text-secondary)', marginBottom: 12 }}>{driftReport.drift_message}</div>
                  
                  {driftReport.root_cause && driftReport.root_cause.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 6 }}>Top Drift Drivers</div>
                      {driftReport.root_cause.map((rc: any, idx: number) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '4px 0' }}>
                          <span>{rc.feature}</span>
                          <span style={{ fontWeight: 600 }}>{(rc.change * 100).toFixed(1)}% shift</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {driftReport.affected_groups && driftReport.affected_groups.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 6 }}>Potentially Impacted Groups</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {driftReport.affected_groups.map((g: string, idx: number) => (
                          <span key={idx} className="pill yellow" style={{ fontSize: '0.7rem' }}>{g}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {driftReport.recommended_actions && driftReport.recommended_actions.length > 0 && (
                    <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                       <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 8 }}>Next Steps</div>
                       {driftReport.recommended_actions.map((action: string, idx: number) => (
                         <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', marginTop: 6, flexShrink: 0 }} />
                            <div style={{ fontSize: '0.85rem', color: '#fff' }}>{action}</div>
                         </div>
                       ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* What-if Simulation Sandbox */}
          <div className="card">
            <div className="section-title">What-if Fairness Sandbox</div>
            <p className="helper" style={{ marginBottom:16 }}>Upload a potential future dataset to simulate drift and predict fairness impacts without affecting your production logs.</p>
            <div style={S.driftBox}>
              <div style={{ flex:1 }}>
                <input type="file" className="input" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDriftFile(e.target.files?.[0] || null)} accept=".csv" />
                <button className="btn btn-primary" style={{ marginTop:12 }} onClick={async () => {
                  if (!driftFile) return;
                  setDriftLoading(true);
                  const fd = new FormData();
                  fd.append('file', driftFile);
                  try {
                    const r = await formApi.post(`/monitoring/project/${projectId}/simulate-data`, fd);
                    setDriftReport(r.data);
                  } finally {
                    setDriftLoading(false);
                  }
                }} disabled={!driftFile || driftLoading}>
                  <Activity size={14} /> {driftLoading ? 'Simulating...' : 'Run Simulation'}
                </button>
              </div>
              {driftReport && driftReport.status === 'simulation_complete' && (
                <div style={{ flex:1, padding:16, borderRadius:12, border:`0.5px solid ${driftReport.drift_results?.drift_alert ? 'rgba(188,71,73,0.45)' : 'rgba(212,163,115,0.45)'}`, background: driftReport.drift_results?.drift_alert ? 'rgba(188,71,73,0.1)' : 'rgba(212,163,115,0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontWeight:600, color: driftReport.drift_results?.drift_alert ? '#ef4444' : 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {driftReport.drift_results?.drift_alert ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
                      Simulation Result
                    </div>
                    <div className="pill" style={{ background: 'var(--bg)', color: 'var(--accent)', fontWeight: 800 }}>
                       Pred. Fairness: {driftReport.predicted_fairness}
                    </div>
                  </div>
                  <div style={{ fontSize:'0.85rem', color:'var(--text-secondary)', marginBottom: 12 }}>{driftReport.drift_results?.drift_message}</div>
                  
                  {driftReport.drift_results?.root_cause?.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 6 }}>Predicted Drift Drivers</div>
                      {driftReport.drift_results.root_cause.map((rc: any, idx: number) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '4px 0' }}>
                          <span>{rc.feature}</span>
                          <span style={{ fontWeight: 600 }}>{(rc.change * 100).toFixed(1)}% shift</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Timeline sidebar */}
        <div className="card" style={S.tlCard as any}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, paddingLeft:8 }}>
            <div className="section-title" style={{ marginBottom:0 }}>
              <Clock size={16} style={{ marginRight:6, verticalAlign:'middle' }} /> Event Timeline
            </div>
            <span style={{ fontSize:'0.78rem', color:'var(--text-secondary)' }}>{filteredEvents.length} events</span>
          </div>

          {/* Filters */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', paddingLeft:8, marginBottom:20 }}>
            {[{k:'all',l:'All'},{k:'alert',l:'Incidents'},{k:'drift_alert',l:'Drift'},{k:'flag',l:'Flags'},{k:'info',l:'Checks'}].map(f => (
              <button key={f.k} onClick={() => setFilterType(f.k)}
                style={{...S.badge, background: filterType === f.k ? 'rgba(79,142,247,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `0.5px solid ${filterType === f.k ? 'rgba(212,163,115,0.65)' : 'var(--border)'}`,
                  color: filterType === f.k ? 'var(--accent)' : 'var(--text-secondary)', cursor:'pointer' }}>
                {f.l}
              </button>
            ))}
          </div>

          {filteredEvents.length === 0 ? (
            <div className="helper" style={{ paddingLeft:8 }}>No events match this filter.</div>
          ) : (
            <div style={S.tlLine as any}>
              {filteredEvents.map((ev, idx) => {
                const sel = selectedEventId === ev.id;
                const col = COLORS[ev.type] || '#3b82f6';
                return (
                  <div key={ev.id} style={{ position:'relative', marginBottom: idx === filteredEvents.length - 1 ? 0 : 28 }}>
                    <div style={{...S.tlNode as any, backgroundColor: col }}>{ICONS[ev.type]}</div>
                    <div style={{...S.tlContent, ...(sel ? S.tlContentSel : {})}} onClick={() => setSelectedEventId(sel ? null : ev.id)}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <div style={S.tlTitle}>{ev.title}</div>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <span style={S.tlDate}>{ev.dateStr}</span>
                          {sel ? <ChevronUp size={14} color="var(--text-secondary)" /> : <ChevronDown size={14} color="var(--text-secondary)" />}
                        </div>
                      </div>
                      <div style={S.tlDesc}>{ev.description}</div>
                    </div>

                    {sel && (
                      <div style={S.detail as any}>
                        {ev.type === 'flag' && (
                          <div>
                            <div style={{ marginBottom:8 }}><strong>Flagged by:</strong> {ev.details.flagged_by}</div>
                            <button className="btn btn-small" onClick={() => resolveFlag(ev.details.id)} style={{ marginTop:8 }}>
                              <CheckCircle size={14} /> Mark Resolved
                            </button>
                          </div>
                        )}
                        {(ev.type === 'drift_alert' || (ev.type === 'info' && ev.title.includes('Drift'))) && (
                          <div>
                            {ev.details.drifted_features?.length > 0 && (
                              <div style={{ marginBottom:10 }}><strong>Drifted features:</strong> {ev.details.drifted_features.join(', ')}</div>
                            )}
                            <div style={{ fontWeight:600, marginBottom:6 }}>Distribution Shifts:</div>
                            {Object.entries(ev.details.sensitive_distribution_shift || {}).map(([col, shift]: [string, any]) => (
                              <div key={col} style={S.detailRow}>
                                <span>{col}</span>
                                <span style={{ fontWeight:600, color: shift > 0.1 ? '#f59e0b' : '#22c55e' }}>{(shift * 100).toFixed(1)}%</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {(ev.type === 'alert' || ev.type === 'info') && !ev.title.includes('Drift') && ev.details && (
                          <div>
                            <div style={{ fontWeight:600, marginBottom:8 }}>Group Breakdown:</div>
                            {Object.entries(ev.details).map(([attr, values]: [string, any]) => (
                              <div key={attr} style={{ marginBottom:12 }}>
                                <div style={{ fontSize:'0.8rem', color:'var(--text-secondary)', marginBottom:4, textTransform:'uppercase' }}>{attr}</div>
                                {Object.entries(values).map(([val, rate]: [string, any]) => (
                                  <div key={val} style={S.detailRow}>
                                    <span>{val}</span>
                                    <span style={{ fontWeight:600 }}>{(rate * 100).toFixed(1)}%</span>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer navigation */}
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:32 }}>
        <button className="btn btn-secondary" onClick={() => navigate('/workflow/step-8')}>← Back</button>
        <button className="btn btn-primary" onClick={() => { navigate('/monitoring'); }}>Go to Live Dashboard</button>
      </div>
    </div>
  );
}
