import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line
} from 'recharts';
import { 
  AlertTriangle, CheckCircle2, ShieldAlert, Zap, Search, 
  Target, Fingerprint, ArrowRight, Info, Activity, History, TrendingUp
} from 'lucide-react';
import { api } from '../api/client';

export default function Dashboard() {
  const { pipelineResults, projectId } = useAppContext();
  const [comparisons, setComparisons] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (projectId) {
      api.get(`/project/${projectId}/compare`).then(res => setComparisons(res.data));
    }
  }, [projectId, pipelineResults]);

   if (!pipelineResults) {
     return (
       <div className="fade-in" style={{ maxWidth: 1000, margin: '0 auto', paddingTop: 60 }}>
         <div style={{ textAlign: 'center', marginBottom: 60 }}>
           <div className="kicker" style={{ marginBottom: 16 }}>Intelligence Workspace</div>
           <h1 className="page-title" style={{ fontSize: '3.5rem', marginBottom: 20 }}>Forensic AI Hub</h1>
           <p className="helper" style={{ maxWidth: 600, margin: '0 auto', fontSize: '1.1rem', lineHeight: 1.6 }}>
             {projectId ? 'Your project is ready. Upload a dataset to start the audit sequence.' : 'Select or create a project from the top menu to begin your forensic audit.'}
           </p>
           
           <div style={{ marginTop: 40, display: 'flex', justifyContent: 'center', gap: 16 }}>
             {projectId ? (
               <button className="btn btn-primary" style={{ padding: '14px 40px', fontSize: '1rem' }} onClick={() => navigate('/workflow/step-1')}>
                 Start Audit Sequence
               </button>
             ) : (
               <button className="btn btn-primary" style={{ padding: '14px 40px', fontSize: '1rem', opacity: 0.5, cursor: 'not-allowed' }}>
                 Select Project Above
               </button>
             )}
             <button className="btn" style={{ padding: '14px 30px' }} onClick={() => window.open('https://github.com', '_blank')}>
               View Documentation
             </button>
           </div>
         </div>
         
         <div className="grid-3" style={{ opacity: 0.8 }}>
            <div className="card" style={{ padding: 32, textAlign: 'left' }}>
               <div className="workflow-brand-badge" style={{ marginBottom: 20, width: 48, height: 48 }}><Search size={24} /></div>
               <h3 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Bias Discovery</h3>
               <p className="helper" style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>Scan datasets for representation gaps and latent proxy variables that distort decision logic.</p>
            </div>
            <div className="card" style={{ padding: 32, textAlign: 'left' }}>
               <div className="workflow-brand-badge" style={{ marginBottom: 20, width: 48, height: 48, background: 'rgba(185, 140, 98, 0.1)', color: 'var(--yellow)', borderColor: 'rgba(185, 140, 98, 0.2)' }}><Zap size={24} /></div>
               <h3 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Contrastive Analysis</h3>
               <p className="helper" style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>Apply counterfactual tests to verify individual fairness by flipping sensitive attributes in real-time.</p>
            </div>
            <div className="card" style={{ padding: 32, textAlign: 'left' }}>
               <div className="workflow-brand-badge" style={{ marginBottom: 20, width: 48, height: 48, background: 'rgba(34, 197, 94, 0.1)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.2)' }}><Activity size={24} /></div>
               <h3 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Live Guardianship</h3>
               <p className="helper" style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>Monitor production streams for drift and degradation, ensuring your model remains ethical at scale.</p>
            </div>
         </div>
       </div>
     );
   }

  if (!pipelineResults?.scores) return null; // inside the results branch

  const scores = pipelineResults.scores ?? {};
  const fairness_score = pipelineResults.fairness_score ?? 0;
  const decision = pipelineResults.decision ?? 'UNKNOWN';
  const recommendations = pipelineResults.recommendations ?? [];
  const chartData = [
    { name: 'Data',     score: scores.data_bias_score     ?? 0 },
    { name: 'Model',    score: scores.model_bias_score    ?? 0 },
    { name: 'Proxy',    score: scores.proxy_risk_score    ?? 0 },
    { name: 'Contrast', score: scores.counterfactual_score ?? 0 },
    { name: 'Stress',   score: scores.stress_test_score   ?? 0 },
  ];

  const getScoreColor = (score: number) => {
    if (score < 50) return '#ef4444';
    if (score < 75) return '#f59e0b';
    return '#10b981';
  };

  const decisionConfig = {
    'HIGH RISK': { color: '#ef4444', icon: ShieldAlert, bg: 'rgba(239, 68, 68, 0.1)' },
    'MODERATE RISK': { color: '#f59e0b', icon: AlertTriangle, bg: 'rgba(245, 158, 11, 0.1)' },
    'LOW RISK': { color: '#10b981', icon: CheckCircle2, bg: 'rgba(16, 185, 129, 0.1)' },
  };

  const config = (decisionConfig as any)[decision] || decisionConfig['MODERATE RISK'];
  const DecisionIcon = config.icon;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 60 }}>
      {/* Header with Decision */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>Audit Intelligence Dashboard</h1>
          <p className="helper">Comprehensive fairness assessment for your model.</p>
        </div>
        <div style={{ 
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px', marginLeft: 20,
          background: config.bg, borderRadius: 100, border: `1px solid ${config.color}`
        }}>
          <DecisionIcon size={20} color={config.color} />
          <strong style={{ color: config.color, letterSpacing: 1, fontSize: '0.9rem' }}>{decision}</strong>
        </div>
      </div>

      {/* Primary Intelligence Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, marginBottom: 32 }}>
        {/* Big Circular Score */}
        <div className="card" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'rgba(212, 163, 115, 0.03)' }}>
          <div className="stat-label" style={{ marginBottom: 20, letterSpacing: 2 }}>Unified Score</div>
          <div style={{ position: 'relative', display: 'inline-block', margin: '0 auto' }}>
            <svg width="190" height="190" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="6" />
              <motion.circle 
                cx="50" cy="50" r="44" fill="none" stroke={getScoreColor(fairness_score)} 
                strokeWidth="6" strokeDasharray="276"
                initial={{ strokeDashoffset: 276 }}
                animate={{ strokeDashoffset: 276 - (fairness_score * 2.76) }}
                transition={{ duration: 1.8, ease: "circOut" }}
                strokeLinecap="round" transform="rotate(-90 50 50)"
              />
            </svg>
            <div style={{ 
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '3.6rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{Math.round(fairness_score)}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>Forensic Index</div>
            </div>
          </div>
          <p className="helper" style={{ marginTop: 24, fontSize: '0.8rem', padding: '0 12px' }}>Aggregate score across all 8 forensic stages.</p>
        </div>

        {/* Audit Stages Grid */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
             <h3 className="section-title" style={{ margin: 0 }}>Forensic Metrics</h3>
             <div className="pill" style={{ fontSize: '0.65rem' }}>Stage 1-5 Performance</div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, flex: 1 }}>
            {[
              { label: 'Data', score: scores.data_bias_score, icon: Search, to: '/workflow/step-3' },
              { label: 'Model', score: scores.model_bias_score, icon: Target, to: '/workflow/step-4' },
              { label: 'Proxy', score: scores.proxy_risk_score, icon: Fingerprint, to: '/workflow/step-2' },
              { label: 'Contrast', score: scores.counterfactual_score, icon: Zap, to: '/workflow/step-6' },
              { label: 'Stress', score: scores.stress_test_score, icon: Activity, to: '/workflow/step-7' },
            ].map((m, i) => (
              <div key={i} className="card-inset" onClick={() => navigate(m.to)} style={{ cursor: 'pointer', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <m.icon size={16} style={{ color: 'var(--text-secondary)', marginBottom: 12, margin: '0 auto', opacity: 0.6 }} />
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: getScoreColor(m.score), marginBottom: 4 }}>{m.score}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{m.label}</div>
              </div>
            ))}
          </div>

          <div style={{ height: 140, marginTop: 20 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <Bar dataKey="score" radius={[4, 4, 0, 0]} barSize={60}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getScoreColor(entry.score)} fillOpacity={0.4} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Comparative Analysis */}
      {comparisons.length > 1 && (
        <div className="card section-gap">
          <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <History size={20} color="var(--accent)" /> 
            Audit History & Comparative Performance
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
             <div className="card-inset">
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>Trend Analysis</div>
                <div style={{ height: 160 }}>
                   <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={[...comparisons].reverse()}>
                         <Line type="monotone" dataKey="fairness_score" stroke="var(--accent)" strokeWidth={2} dot={{ fill: 'var(--accent)' }} />
                         <Line type="monotone" dataKey="accuracy" stroke="var(--text-muted)" strokeWidth={2} strokeDasharray="5 5" />
                         <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid var(--border)' }} />
                      </LineChart>
                   </ResponsiveContainer>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 12, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: '50%' }} /> Fairness
                   </div>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 8, height: 8, border: '1px dashed var(--text-muted)', borderRadius: '50%' }} /> Accuracy
                   </div>
                </div>
             </div>

             <div className="table-container">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                   <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                         <th style={{ padding: '12px 8px', fontWeight: 600 }}>Run ID</th>
                         <th style={{ padding: '12px 8px', fontWeight: 600 }}>Fairness</th>
                         <th style={{ padding: '12px 8px', fontWeight: 600 }}>Accuracy</th>
                         <th style={{ padding: '12px 8px', fontWeight: 600 }}>Decision</th>
                         <th style={{ padding: '12px 8px', fontWeight: 600 }}>Date</th>
                      </tr>
                   </thead>
                   <tbody>
                      {comparisons.map((run, i) => (
                         <tr key={run.run_id} style={{ borderBottom: i < comparisons.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                            <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>#{run.run_id}</td>
                            <td style={{ padding: '12px 8px', fontWeight: 600, color: getScoreColor(run.fairness_score) }}>{run.fairness_score}</td>
                            <td style={{ padding: '12px 8px' }}>{Math.round(run.accuracy * 100)}%</td>
                            <td style={{ padding: '12px 8px' }}>
                               <span className={`pill ${run.decision === 'LOW RISK' ? 'green' : run.decision === 'HIGH RISK' ? 'red' : 'yellow'}`} style={{ fontSize: '0.7rem' }}>
                                  {run.decision}
                               </span>
                            </td>
                            <td style={{ padding: '12px 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                               {new Date(run.timestamp).toLocaleDateString()}
                            </td>
                         </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          </div>
        </div>
      )}

      {/* Recommendations */}
      <div className="card">
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <Info size={20} color="var(--accent)" /> 
          Critical Remediation Steps
        </div>
        <div className="stack stack-md">
          {recommendations && recommendations.length > 0 ? (
            recommendations.map((rec: any, i: number) => (
              <div key={i} className="card-inset" style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                <div style={{ 
                  width: 32, height: 32, borderRadius: '50%', background: 'rgba(212, 163, 115, 0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--accent)', flexShrink: 0,
                  fontWeight: 800, border: '1px solid rgba(212, 163, 115, 0.2)'
                }}>
                  {i + 1}
                </div>
                <div>
                   <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--yellow)', marginBottom: 4, fontWeight: 700 }}>
                      {rec.issue || 'Audit Insight'}
                   </div>
                   <div style={{ fontSize: '1rem', lineHeight: 1.5, color: '#fff' }}>
                      {rec.fix || (typeof rec === 'string' ? rec : 'Continue monitoring.')}
                   </div>
                </div>
              </div>
            ))
          ) : (
            <p className="helper">No critical recommendations found. Your model shows strong alignment with fairness goals.</p>
          )}
        </div>
      </div>
    </div>
  );
}
