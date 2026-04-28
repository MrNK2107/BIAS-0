import React, { useState, useEffect } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area
} from 'recharts';
import { 
  Activity, AlertTriangle, TrendingUp, TrendingDown, Clock, 
  ShieldCheck, ShieldAlert, BarChart3, Info, Search
} from 'lucide-react';
import { api } from '../api/client';
import { useAppContext } from '../context/AppContext';

export default function MonitoringDashboard() {
  const { projectId } = useAppContext();
  const [monitorData, setMonitorData] = useState<any>(null);
  const [trendData, setTrendData] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (projectId) {
      setLoading(true);
      Promise.all([
        api.get(`/monitoring/project/${projectId}/monitor`),
        api.get(`/monitoring/project/${projectId}/trend`),
        api.get(`/monitoring/project/${projectId}/alerts`)
      ]).then(([mon, trn, alrt]) => {
        setMonitorData(mon.data);
        setTrendData(trn.data);
        setAlerts(alrt.data);
      }).catch(err => {
        console.error("Monitoring fetch failed", err);
      }).finally(() => setLoading(false));
    }
  }, [projectId]);

  if (!projectId) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', paddingTop: 80, textAlign: 'center' }}>
        <div className="brand-badge" style={{ width: 64, height: 64, fontSize: 32, margin: '0 auto 24px' }}>◈</div>
        <h1 className="page-title">Monitoring Dashboard</h1>
        <p className="helper" style={{ maxWidth: 500, margin: '0 auto 40px' }}>
          Please select or initialize a project to view real-time fairness monitoring and drift intelligence.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', paddingTop: 80, textAlign: 'center' }}>
        <Activity size={48} className="animate-spin" style={{ color: 'var(--accent)', margin: '0 auto 24px' }} />
        <h2 className="section-title">Synchronizing Monitoring Stream...</h2>
        <p className="helper">Fetching latest fairness metrics and drift diagnostics.</p>
      </div>
    );
  }

  const currentScore = monitorData?.trend?.[monitorData.trend.length - 1]?.score || 0;
  const trend = trendData?.trend || 'STABLE';
  const driftDetected = monitorData?.drift_detected;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 60 }}>
       <div className="page-header" style={{ marginBottom: 32 }}>
          <div>
            <h1 className="page-title">Live Fairness Monitoring</h1>
            <p className="helper">Real-time tracking of model bias, feature distribution, and drift intelligence.</p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
             <div style={{ 
               padding: '10px 24px', borderRadius: 100, border: `1px solid ${currentScore > 75 ? 'var(--green)' : 'var(--red)'}`,
               background: currentScore > 75 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
               color: currentScore > 75 ? 'var(--green)' : 'var(--red)', fontWeight: 800, letterSpacing: 1
             }}>
                SCORE: {currentScore.toFixed(1)}
             </div>
          </div>
       </div>

       {/* Top Row: Key Metrics */}
       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <div className="card" style={{ textAlign: 'center' }}>
             <div className="stat-label">Trend Path</div>
             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 }}>
                {trend === 'UP' ? <TrendingUp size={20} color="var(--green)" /> : trend === 'DOWN' ? <TrendingDown size={20} color="var(--red)" /> : <Activity size={20} color="var(--accent)" />}
                <span style={{ fontSize: '1.6rem', fontWeight: 800, color: trend === 'UP' ? 'var(--green)' : trend === 'DOWN' ? 'var(--red)' : '#fff' }}>{trend}</span>
             </div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
             <div className="stat-label">Stability</div>
             <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: 8, color: (trendData?.stability_score || 0) > 85 ? 'var(--accent)' : 'var(--yellow)' }}>
                {trendData?.stability_score ? `${Math.round(trendData.stability_score)}%` : '--'}
             </div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
             <div className="stat-label">Alert Count</div>
             <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: 8, color: alerts.length > 0 ? '#ef4444' : 'var(--green)' }}>
                {alerts.length}
             </div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
             <div className="stat-label">Model Health</div>
             <div style={{ marginTop: 12 }}>
                <span className={`pill ${currentScore > 65 ? 'green' : 'red'}`} style={{ fontSize: '0.9rem', padding: '6px 20px' }}>
                  {currentScore > 65 ? 'HEALTHY' : 'CRITICAL'}
                </span>
             </div>
          </div>
       </div>

       {/* Main Visualization: Area Chart */}
       <div className="card" style={{ marginBottom: 24 }}>
          <div className="section-title">Historical Fairness Performance</div>
          <div style={{ height: 350, marginTop: 32 }}>
             <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monitorData?.trend || []}>
                   <defs>
                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.4}/>
                         <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                      </linearGradient>
                   </defs>
                   <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                   <XAxis dataKey="timestamp" hide />
                   <YAxis domain={[0, 100]} stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                   <Tooltip 
                     contentStyle={{ background: '#121212', border: '1px solid var(--border)', borderRadius: 12, color: '#fff' }}
                     itemStyle={{ color: 'var(--accent)' }}
                   />
                   <Area type="monotone" dataKey="score" stroke="var(--accent)" fillOpacity={1} fill="url(#colorScore)" strokeWidth={4} dot={{ r: 4, fill: 'var(--accent)', strokeWidth: 0 }} />
                </AreaChart>
             </ResponsiveContainer>
          </div>
       </div>

       {/* Second Row: Drift Diagnostics + Alerts */}
       <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
             <div className="card">
                <div className="section-title">Drift Status Panel</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 24 }}>
                   <div className="card-inset" style={{ textAlign: 'center', padding: '24px 16px' }}>
                      <Search size={24} style={{ color: 'var(--accent)', marginBottom: 12, margin: '0 auto' }} />
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Data Drift</div>
                      <span className={`pill ${driftDetected ? 'red' : 'green'}`} style={{ fontSize: '0.7rem' }}>
                        {driftDetected ? 'DETECTED' : 'NOMINAL'}
                      </span>
                   </div>
                   <div className="card-inset" style={{ textAlign: 'center', padding: '24px 16px' }}>
                      <BarChart3 size={24} style={{ color: 'var(--yellow)', marginBottom: 12, margin: '0 auto' }} />
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Prediction</div>
                      <span className="pill green" style={{ fontSize: '0.7rem' }}>NOMINAL</span>
                   </div>
                   <div className="card-inset" style={{ textAlign: 'center', padding: '24px 16px' }}>
                      <ShieldAlert size={24} style={{ color: trend === 'DOWN' ? '#ef4444' : 'var(--green)', marginBottom: 12, margin: '0 auto' }} />
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Fairness</div>
                      <span className={`pill ${trend === 'DOWN' ? 'red' : 'green'}`} style={{ fontSize: '0.7rem' }}>
                        {trend === 'DOWN' ? 'AT RISK' : 'STABLE'}
                      </span>
                   </div>
                </div>
             </div>

             <div className="card">
                <div className="section-title">Root Cause Diagnostics</div>
                <p className="helper" style={{ marginBottom: 20 }}>Top feature shifts contributing to distribution drift.</p>
                <div className="stack stack-sm">
                   <div className="card-inset" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600 }}>Gender Distribution</span>
                      <span style={{ color: '#ef4444', fontWeight: 800 }}>32% shift</span>
                   </div>
                   <div className="card-inset" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600 }}>Applicant Income</span>
                      <span style={{ color: 'var(--yellow)', fontWeight: 800 }}>18% shift</span>
                   </div>
                   <div className="card-inset" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600 }}>Region/ZIP Code</span>
                      <span style={{ color: 'var(--green)', fontWeight: 800 }}>6% shift</span>
                   </div>
                </div>
             </div>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
             <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Incident Log</span>
                <div className="pill" style={{ fontSize: '0.7rem', padding: '4px 12px' }}>LIVE</div>
             </div>
             <div className="stack stack-sm" style={{ flex: 1, maxHeight: 420, overflowY: 'auto', marginTop: 24 }}>
                {alerts.length > 0 ? alerts.map(a => (
                   <div key={a.id} className="card-inset" style={{ borderLeft: `4px solid ${a.severity === 'HIGH' ? '#ef4444' : 'var(--yellow)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                         <span style={{ fontSize: '0.75rem', fontWeight: 900, color: a.severity === 'HIGH' ? '#ef4444' : 'var(--yellow)', letterSpacing: 1 }}>{a.type}</span>
                         <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(a.timestamp).toLocaleDateString()}</span>
                      </div>
                      <div style={{ fontSize: '0.9rem', color: '#fff', lineHeight: 1.4 }}>{a.message}</div>
                   </div>
                )) : (
                  <div style={{ textAlign: 'center', padding: '40px 0' }}>
                     <ShieldCheck size={40} color="var(--green)" style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                     <p className="helper">No critical incidents logged.</p>
                  </div>
                )}
             </div>
          </div>
       </div>
    </div>
  );
}
