import React, { createContext, useContext, useState, ReactNode } from 'react';
import { formApi, api } from '../api/client';

interface AppState {
  file: File | null;
  sensitiveCols: string[];
  targetCol: string;
  domain: string;
  projectId: string | null;
  modelType: 'file' | 'api';
  apiUrl: string;
  requestFormat: string;
  metricPriority: string;
  // Individual result slices (populated by runFullAnalysis)
  auditResult: any;
  proxyResult: any;
  biasResult: any;
  explainResult: any;
  explainSummary: string | null;
  counterfactualResult: any;
  stressResult: any;
  recommendResult: any;
  sandboxResult: any;
  monitoringResult: any;
  // Unified pipeline state
  pipelineResults: any;
  isAnalyzing: boolean;
  analyzeError: string | null;
  projects: any[];
  maxStep: number;
}

interface AppContextType extends AppState {
  setFile: (val: File | null) => void;
  setSensitiveCols: (val: string[]) => void;
  setTargetCol: (val: string) => void;
  setDomain: (val: string) => void;
  setProjectId: (val: string | null) => void;
  setModelType: (val: 'file' | 'api') => void;
  setApiUrl: (val: string) => void;
  setRequestFormat: (val: string) => void;
  setMetricPriority: (val: string) => void;
  setAuditResult: (val: any) => void;
  setProxyResult: (val: any) => void;
  setBiasResult: (val: any) => void;
  setExplainResult: (val: any) => void;
  setExplainSummary: (val: string | null) => void;
  setCounterfactualResult: (val: any) => void;
  setStressResult: (val: any) => void;
  setRecommendResult: (val: any) => void;
  setSandboxResult: (val: any) => void;
  setMonitoringResult: (val: any) => void;

  // Unified pipeline
  runFullAnalysis: () => Promise<void>;

  // Legacy individual methods (kept for sandbox + monitoring + custom stress)
  runModelBias: (customStressScenarios?: any[]) => Promise<void>;
  runRecommendFixes: () => Promise<void>;
  runSandboxSimulation: (fixes: string[]) => Promise<void>;
  runMonitoringSimulation: () => Promise<void>;
  getMonitoringData: () => Promise<void>;
  refreshProjects: () => Promise<void>;
  advanceStep: (step: number) => Promise<void>;
  setResultsFromPipeline: (data: any) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [file, setFile] = useState<File | null>(null);
  const [sensitiveCols, setSensitiveCols] = useState<string[]>([]);
  const [targetCol, setTargetCol] = useState('');
  const [domain, setDomain] = useState('loan');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [modelType, setModelType] = useState<'file' | 'api'>('file');
  const [apiUrl, setApiUrl] = useState('');
  const [requestFormat, setRequestFormat] = useState('');
  const [metricPriority, setMetricPriority] = useState('balanced');

  const [auditResult, setAuditResult] = useState<any>(null);
  const [proxyResult, setProxyResult] = useState<any>(null);
  const [biasResult, setBiasResult] = useState<any>(null);
  const [explainResult, setExplainResult] = useState<any>(null);
  const [explainSummary, setExplainSummary] = useState<string | null>(null);
  const [counterfactualResult, setCounterfactualResult] = useState<any>(null);
  const [stressResult, setStressResult] = useState<any>(null);
  const [recommendResult, setRecommendResult] = useState<any>(null);
  const [sandboxResult, setSandboxResult] = useState<any>(null);
  const [monitoringResult, setMonitoringResult] = useState<any>(null);

  const [pipelineResults, setPipelineResults] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [projects, setProjects] = useState<any[]>([]);

  // ── Unified pipeline ────────────────────────────────────────────────────────
  const runFullAnalysis = async () => {
    if (!file) return;
    
    // Set analyzing state IMMEDIATELY before any async work
    setIsAnalyzing(true);
    setAnalyzeError(null);

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('sensitive_cols', sensitiveCols.join(','));
      fd.append('target_col', targetCol);
      fd.append('project_id', projectId ?? '0');
      fd.append('metric_priority', metricPriority);
      fd.append('domain', domain);

      // Kick off background task — increased timeout to 60s
      const kickoff = await formApi.post('/pipeline/run-all', fd, { timeout: 60000 });
      const { task_id } = kickoff.data as { task_id: string; status: string };

      localStorage.setItem('active_analysis_task', task_id);
      
      // Wait 1s for backend to initialize before first poll
      await new Promise(r => setTimeout(r, 1000));
      const data = await pollTaskStatus(task_id);

      setResultsFromPipeline(data);
      await refreshProjects();
      localStorage.removeItem('active_analysis_task');

    } catch (err: any) {
      console.error('Analysis pipeline error:', err);
      const isTimeout = err?.code === 'ECONNABORTED' || err?.message?.includes('timeout');
      const isNetworkIssue = err?.message?.includes('Network Error');
      const message = isTimeout
        ? 'Analysis timed out. The server is taking longer than expected to finalize results. Please check the terminal logs or try again.'
        : isNetworkIssue
          ? 'Cannot reach backend API. Please make sure the backend server is running.'
          : err?.response?.data?.detail || err?.message || 'Analysis failed. Please try again.';
      setAnalyzeError(message);
      throw err;
    } finally {
      setIsAnalyzing(false);
    }
  };

  const pollTaskStatus = async (task_id: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const interval = setInterval(async () => {
        // 5 minute overall timeout for the whole analysis
        if (Date.now() - startTime > 300_000) {
          clearInterval(interval);
          reject(new Error('Analysis timed out after 5 minutes'));
          return;
        }
        try {
          // Individual poll timeout increased to 60s
          const poll = await api.get(`/pipeline/status/${task_id}`, { timeout: 60000 });
          const { status, result, error } = poll.data;
          if (status === 'complete') {
            clearInterval(interval);
            resolve(result);
          } else if (status === 'error') {
            clearInterval(interval);
            reject(new Error(error || 'Pipeline failed'));
          }
        } catch (pollErr: any) {
          if (pollErr?.code === 'ECONNABORTED' || pollErr?.message?.includes('timeout')) {
            clearInterval(interval);
            reject(new Error('Connection timed out while waiting for results. The server may be busy finalizing data.'));
          }
        }
      }, 3000);
    });
  };



  // 4. Resume active task on reload
  React.useEffect(() => {
    const activeTask = localStorage.getItem('active_analysis_task');
    if (activeTask && !pipelineResults && !isAnalyzing) {
      setIsAnalyzing(true);
      pollTaskStatus(activeTask)
        .then(data => {
          setResultsFromPipeline(data);
          refreshProjects();
          localStorage.removeItem('active_analysis_task');
          setIsAnalyzing(false);
        })
        .catch(err => {
          console.error('Failed to resume task', err);
          localStorage.removeItem('active_analysis_task');
          setIsAnalyzing(false);
        });
    }
  }, [projectId]);

  const setResultsFromPipeline = (data: any) => {
    // Handle both direct pipeline result and the wrapped /result/{id} response
    const result = data?.details ?? data?.result ?? data;
    if (!result) return;
    
    // Clear any previous analysis errors when results are successfully set
    setAnalyzeError(null);
    setIsAnalyzing(false);

    setAuditResult(result.data_audit ?? null);
    setProxyResult(result.proxy ?? null);
    setBiasResult(result.model_bias ?? null);
    setExplainResult(result.explanations ?? null);
    setExplainSummary(result.explain_summary ?? null);
    setCounterfactualResult(result.counterfactual ?? null);
    setStressResult(result.stress ?? null);
    setRecommendResult(result.recommendations ?? null);
    setPipelineResults(result);
  };


  // ── Legacy helpers (kept for interactive steps) ─────────────────────────────
  const getFormData = () => {
    const fd = new FormData();
    fd.append('project_id', projectId || '');
    fd.append('sensitive_cols', sensitiveCols.join(','));
    fd.append('target_col', targetCol);
    fd.append('metric_priority', metricPriority);
    if (file) fd.append('file', file);
    return fd;
  };

  // Used by Step 7 custom scenario re-runs
  const runModelBias = async (customStressScenarios?: any[]) => {
    if (!file) return;

    const fd = getFormData();
    if (customStressScenarios) {
      fd.append('custom_scenarios', JSON.stringify(customStressScenarios));
    }

    if (modelType === 'api') {
      if (!apiUrl || !requestFormat) {
        throw new Error('API URL and Request Format are required for API endpoint model');
      }
      const apiFd = new FormData();
      apiFd.append('api_url', apiUrl);
      apiFd.append('api_request_format', requestFormat);
      apiFd.append('sensitive_cols', sensitiveCols.join(','));
      apiFd.append('target_col', targetCol);
      apiFd.append('metric_priority', metricPriority);
      apiFd.append('file', file);
      if (customStressScenarios) {
        apiFd.append('custom_scenarios', JSON.stringify(customStressScenarios));
      }
      const biasRes = await formApi.post('/bias/model-from-api', apiFd);
      setBiasResult(biasRes.data);
    } else {
      const biasRes = await formApi.post('/bias/model', fd);
      setBiasResult(biasRes.data);
    }

    const stressRes = await formApi.post('/bias/stress', fd);
    setStressResult(stressRes.data);
  };

  const runRecommendFixes = async () => {
    if (!file) return;
    const payload = {
      audit_result: auditResult,
      proxy_result: proxyResult,
      bias_result: biasResult,
    };
    const res = await api.post('/fixes/recommend', payload);
    setRecommendResult(res.data);
  };

  const runSandboxSimulation = async (fixes: string[]) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('sensitiveCols', sensitiveCols.join(','));
    fd.append('targetCol', targetCol);
    fd.append('metric_priority', metricPriority);
    fd.append('file', file);
    fd.append('strategies', fixes.join(','));
    fd.append('audit_result', JSON.stringify(auditResult));
    fd.append('proxy_result', JSON.stringify(proxyResult));
    fd.append('bias_result', JSON.stringify(biasResult));

    const res = await formApi.post('/fixes/sandbox', fd);
    setSandboxResult(res.data);
  };

  const runMonitoringSimulation = async () => {
    const res = await api.post(`/monitoring/${projectId}/simulate`);
    setMonitoringResult(res.data);
  };

  const getMonitoringData = async () => {
    if (!projectId) return;
    const res = await api.get(`/monitoring/${projectId}`);
    setMonitoringResult(res.data);
  };

  const refreshProjects = async () => {
    try {
      const res = await api.get('/project/list');
      setProjects(res.data);
    } catch { }
  };

  const advanceStep = async (step: number) => {
    if (!projectId) return;
    localStorage.setItem(`max_step_${projectId}`, String(
      Math.max(step, parseInt(localStorage.getItem(`max_step_${projectId}`) ?? '1', 10))
    ));
    try {
      const fd = new FormData();
      fd.append('step', step.toString());
      await formApi.patch(`/project/${projectId}/step`, fd);
      await refreshProjects();
    } catch (err) {
      console.error('Failed to advance step', err);
    }
  };

  // ── Persistence & Hydration ────────────────────────────────────────────────

  // 1. Initial hydration from localStorage
  React.useEffect(() => {
    const savedId = localStorage.getItem('active_project_id');
    if (savedId && !projectId) {
      setProjectId(savedId);
    }
  }, []);

  // 2. Persist projectId when it changes
  React.useEffect(() => {
    if (projectId) {
      localStorage.setItem('active_project_id', projectId);
    }
  }, [projectId]);

  // 3. Auto-load latest results & Navigate to latest step
  React.useEffect(() => {
    if (projectId) {
      // Load results
      api.get(`/project/${projectId}/latest`)
        .then(res => {
          if (res.data.status === 'complete') {
            setResultsFromPipeline(res.data.result);
          }
        })
        .catch(() => { });

      // Ensure we have project info to find max_step
      if (projects.length > 0) {
        const p = projects.find(proj => String(proj.id) === String(projectId));
        if (p && p.max_step > 1) {
          // Logic for redirection removed from here to avoid infinite loops
        }
      }
    }
  }, [projectId, projects.length]);

  const currentProject = projects.find(
    p => p.id?.toString() === projectId?.toString()
  );
  const maxStep = Math.min(
    currentProject?.max_step
      ?? parseInt(localStorage.getItem(`max_step_${projectId}`) ?? '1', 10),
    8
  );

  React.useEffect(() => { refreshProjects(); }, []);

  return (
    <AppContext.Provider value={{
      file, setFile, sensitiveCols, setSensitiveCols, targetCol, setTargetCol, domain, setDomain, projectId, setProjectId,
      modelType, setModelType, apiUrl, setApiUrl, requestFormat, setRequestFormat,
      metricPriority, setMetricPriority,
      auditResult, setAuditResult, proxyResult, setProxyResult, biasResult, setBiasResult,
      explainResult, setExplainResult, explainSummary, setExplainSummary,
      counterfactualResult, setCounterfactualResult,
      stressResult, setStressResult, recommendResult, setRecommendResult,
      sandboxResult, setSandboxResult, monitoringResult, setMonitoringResult,
      pipelineResults, isAnalyzing, analyzeError,
      projects, maxStep,
      runFullAnalysis,
      runModelBias, runRecommendFixes, runSandboxSimulation,
      runMonitoringSimulation, getMonitoringData,
      refreshProjects, advanceStep,
      setResultsFromPipeline,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
