import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { formApi, api } from '../api/client';
import { useAppContext } from '../context/AppContext';
import { 
  FolderPlus, 
  Upload, 
  Play, 
  ChevronRight, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  Brain,
  Info
} from 'lucide-react';

export default function CreateProject() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setResultsFromPipeline, setFile, setProjectId: setGlobalProjectId, refreshProjects } = useAppContext();
  const navigate = useNavigate();

  // Step 1: Project Identity
  const [projectData, setProjectData] = useState({
    name: '',
    domain: 'finance',
    sensitive_cols: 'gender, race, age',
    target_col: 'approved'
  });

  // Step 2: Assets
  const [projectId, setProjectId] = useState<number | null>(null);
  const [dataset, setDataset] = useState<File | null>(null);
  const [modelFile, setModelFile] = useState<File | null>(null);

  // Step 3: Analysis
  const [taskId, setTaskId] = useState<string | null>(null);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectData.name) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('name', projectData.name);
      formData.append('domain', projectData.domain);
      formData.append('sensitive_cols', projectData.sensitive_cols);
      formData.append('target_col', projectData.target_col);

      const res = await formApi.post('/project/create', formData);
      const newId = res.data.project_id;
      
      // Refresh global list so selector sees it
      await refreshProjects();
      
      setProjectId(newId);
      setGlobalProjectId(String(newId));
      setStep(2);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!projectId || !dataset) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('dataset', dataset);
      if (modelFile) formData.append('model_file', modelFile);

      await formApi.post(`/project/${projectId}/upload`, formData);
      setStep(3);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRunAnalysis = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('metric_priority', 'balanced');

      const res = await formApi.post(`/project/${projectId}/run`, formData);
      const newTaskId = res.data.task_id;
      setTaskId(newTaskId);
      pollResult(newTaskId);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Analysis failed to start');
      setLoading(false);
    }
  };

  const pollResult = async (tid: string) => {
    try {
      const res = await api.get(`/pipeline/result/${tid}`);
      if (res.data.status === 'completed') {
        // Success!
        setResultsFromPipeline(res.data);
        if (dataset) setFile(dataset);
        navigate('/dashboard');
      } else if (res.data.status === 'error') {
        setError(res.data.error);
        setLoading(false);
      } else {
        // Continue polling
        setTimeout(() => pollResult(tid), 2000);
      }
    } catch (err) {
      setError('Connection lost while polling results');
      setLoading(false);
    }
  };

  const stepVariants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', paddingTop: 40 }}>
      <div className="page-header" style={{ textAlign: 'center', marginBottom: 40 }}>
        <div className="kicker">Quick Setup</div>
        <h1 className="page-title">Initialize Fairness Audit</h1>
        
        {step === 1 && (
          <div className="card-inset" style={{ maxWidth: 520, margin: '20px auto 0', textAlign: 'left', background: 'rgba(212,163,115,0.03)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
               <div className="workflow-brand-badge" style={{ flexShrink: 0 }}><Info size={18} /></div>
               <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                 Configure your project identity, upload assets, and launch the forensic engine.
               </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 32, gap: 12 }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{ 
              width: 32, height: 32, borderRadius: '50%', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: step >= s ? 'var(--accent)' : 'transparent',
              color: step >= s ? '#0a0a0a' : 'var(--text-secondary)',
              fontWeight: 700, fontSize: '0.75rem',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              border: '1px solid',
              borderColor: step >= s ? 'var(--accent)' : 'var(--border)',
              boxShadow: step === s ? '0 0 15px rgba(212, 163, 115, 0.3)' : 'none'
            }}>
              {step > s ? <CheckCircle2 size={16} /> : s}
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="step1" {...stepVariants} className="card" style={{ padding: '32px' }}>
            <div style={{ marginBottom: 32 }}>
               <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                 <FolderPlus size={20} color="var(--accent)" /> Project Identity
               </h2>
               <p className="helper">Scope and domain definition for fairness intelligence.</p>
            </div>

            <form onSubmit={handleCreateProject} className="stack stack-lg">
              <div className="grid-2">
                <div className="form-group">
                  <label className="label" style={{ display: 'block', marginBottom: 8, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: 1 }}>Project Name</label>
                  <input 
                    className="input" 
                    placeholder="e.g. Credit Risk Analysis"
                    value={projectData.name}
                    onChange={e => setProjectData({...projectData, name: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="label" style={{ display: 'block', marginBottom: 8, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: 1 }}>Industry Domain</label>
                  <select 
                    className="select"
                    value={projectData.domain}
                    onChange={e => setProjectData({...projectData, domain: e.target.value})}
                  >
                    <option value="finance">Finance / Banking</option>
                    <option value="hiring">Hiring / HR</option>
                    <option value="healthcare">Healthcare</option>
                    <option value="justice">Criminal Justice</option>
                    <option value="general">General AI</option>
                  </select>
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="label" style={{ display: 'block', marginBottom: 8, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: 1 }}>Sensitive Attributes</label>
                  <input 
                    className="input" 
                    placeholder="gender, race, age"
                    value={projectData.sensitive_cols}
                    onChange={e => setProjectData({...projectData, sensitive_cols: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label className="label" style={{ display: 'block', marginBottom: 8, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: 1 }}>Target Column</label>
                  <input 
                    className="input" 
                    placeholder="e.g. approved"
                    value={projectData.target_col}
                    onChange={e => setProjectData({...projectData, target_col: e.target.value})}
                  />
                </div>
              </div>
              
              {error && <div className="banner red" style={{ padding: '10px 14px', fontSize: '0.85rem' }}>{error}</div>}
              
              <button type="submit" className="btn btn-primary" style={{ marginTop: 12, height: 50, fontSize: '0.95rem' }} disabled={loading}>
                {loading ? <Loader2 className="animate-spin" /> : 'Create Workspace'} <ChevronRight size={18} />
              </button>
            </form>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="step2" {...stepVariants} className="card" style={{ padding: '32px' }}>
            <div style={{ marginBottom: 32 }}>
               <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                 <Upload size={20} color="var(--accent)" /> Asset Ingestion
               </h2>
               <p className="helper">Securely upload your evaluation datasets and model binary.</p>
            </div>
            
            <div className="grid-2">
              <div className="form-group">
                <label className="label" style={{ display: 'block', marginBottom: 12, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: 1 }}>Dataset (CSV)</label>
                <div className="dropzone" onClick={() => document.getElementById('dataset-upload')?.click()} style={{ minHeight: 180, cursor: 'pointer' }}>
                  {dataset ? (
                    <div className="fade-in" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      <FileText size={32} style={{ margin: '0 auto 12px', opacity: 0.8 }} />
                      <div style={{ fontSize: '0.85rem' }}>{dataset.name}</div>
                    </div>
                  ) : (
                    <div style={{ opacity: 0.4 }}>
                      <Upload size={24} style={{ marginBottom: 10, margin: '0 auto' }} />
                      <div style={{ fontSize: '0.8rem' }}>Click to select data</div>
                    </div>
                  )}
                  <input id="dataset-upload" type="file" accept=".csv" style={{ display: 'none' }} onChange={e => setDataset(e.target.files?.[0] || null)} />
                </div>
              </div>

              <div className="form-group">
                <label className="label" style={{ display: 'block', marginBottom: 12, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: 1 }}>Model Binary (Optional)</label>
                <div className="dropzone" style={{ minHeight: 180, cursor: 'pointer' }} onClick={() => document.getElementById('model-upload')?.click()}>
                   {modelFile ? (
                    <div className="fade-in" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      <Brain size={32} style={{ margin: '0 auto 12px', opacity: 0.8 }} />
                      <div style={{ fontSize: '0.85rem' }}>{modelFile.name}</div>
                    </div>
                  ) : (
                    <div style={{ opacity: 0.4 }}>
                      <Brain size={24} style={{ marginBottom: 10, margin: '0 auto' }} />
                      <div style={{ fontSize: '0.8rem' }}>Leave empty for Auto-Train</div>
                    </div>
                  )}
                  <input id="model-upload" type="file" accept=".joblib,.pkl,.h5" style={{ display: 'none' }} onChange={e => setModelFile(e.target.files?.[0] || null)} />
                </div>
              </div>
            </div>

            {error && <div className="banner red" style={{ marginTop: 24, padding: '10px 14px', fontSize: '0.85rem' }}>{error}</div>}

            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
               <button onClick={handleUpload} className="btn btn-primary" style={{ flex: 1, height: 50 }} disabled={loading || !dataset}>
                 {loading ? <Loader2 className="animate-spin" /> : 'Finalize Assets'} <ChevronRight size={18} />
               </button>
               <button onClick={() => setStep(1)} className="btn btn-secondary" style={{ width: 100, height: 50 }} disabled={loading}>
                 Back
               </button>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="step3" {...stepVariants} className="card" style={{ textAlign: 'center' }}>
            <div style={{ padding: '40px 0' }}>
              <Play size={64} style={{ color: 'var(--accent)', margin: '0 auto 24px', opacity: loading ? 0.3 : 1 }} className={loading ? 'animate-pulse' : ''} />
              <h2 className="section-title">Ready for Analysis</h2>
              <p className="helper">The engine will run 8 stages of fairness audits including bias detection, explainability, and stress testing.</p>
              
              {error && (
                <div style={{ marginTop: 24, padding: 16, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
                  <AlertCircle size={20} />
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
                <button 
                  onClick={handleRunAnalysis} 
                  className="btn btn-primary" 
                  style={{ flex: 1, height: 56, fontSize: 18 }} 
                  disabled={loading}
                >
                  {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                      <Loader2 className="animate-spin" size={24} />
                      Processing Audit Sequence...
                    </div>
                  ) : (
                    'Launch Full Pipeline'
                  )}
                </button>
                <button onClick={() => setStep(2)} className="btn btn-secondary" style={{ width: 120, height: 56 }} disabled={loading}>
                  Adjust Assets
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
