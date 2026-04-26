import React, { createContext, useContext, useState, ReactNode } from 'react';
import { formApi, api } from '../api/client';

interface AppState {
  file: File | null;
  sensitiveCols: string[];
  targetCol: string;
  domain: string;
  projectId: string;
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
}

interface AppContextType extends AppState {
  setFile: (val: File | null) => void;
  setSensitiveCols: (val: string[]) => void;
  setTargetCol: (val: string) => void;
  setDomain: (val: string) => void;
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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [file, setFile] = useState<File | null>(null);
  const [sensitiveCols, setSensitiveCols] = useState<string[]>(['gender', 'caste']);
  const [targetCol, setTargetCol] = useState('approved');
  const [domain, setDomain] = useState('loan');
  const [projectId] = useState('1');
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

  // Unified pipeline state
  const [pipelineResults, setPipelineResults] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // ── Unified pipeline ────────────────────────────────────────────────────────
  const runFullAnalysis = async () => {
    if (!file) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('sensitive_cols', sensitiveCols.join(','));
      fd.append('target_col', targetCol);
      fd.append('project_id', projectId);
      fd.append('metric_priority', metricPriority);

      const res = await formApi.post('/pipeline/run-all', fd, { timeout: 180000 });
      const data = res.data;

      // Unpack into individual context slices for backward compatibility
      setAuditResult(data.data_audit);
      setProxyResult(data.proxy);
      setBiasResult(data.model_bias);
      setExplainResult(data.explanations);
      setExplainSummary(data.explain_summary);
      setCounterfactualResult(data.counterfactual);
      setStressResult(data.stress);
      setRecommendResult(data.recommendations);

      setPipelineResults(data);
    } catch (err: any) {
      const isTimeout = err?.code === 'ECONNABORTED';
      const isNetworkIssue = err?.message?.includes('Network Error');
      const message = isTimeout
        ? 'Analysis timed out after 3 minutes. The backend may be overloaded or unreachable. Please retry.'
        : isNetworkIssue
          ? 'Cannot reach backend API. Please make sure the backend server is running.'
          : err?.response?.data?.detail || err?.message || 'Analysis failed. Please try again.';
      setAnalyzeError(message);
      throw err;
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Legacy helpers (kept for interactive steps) ─────────────────────────────
  const getFormData = () => {
    const fd = new FormData();
    fd.append('project_id', projectId);
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
    const res = await api.get(`/monitoring/${projectId}`);
    setMonitoringResult(res.data);
  };

  return (
    <AppContext.Provider value={{
      file, setFile, sensitiveCols, setSensitiveCols, targetCol, setTargetCol, domain, setDomain, projectId,
      modelType, setModelType, apiUrl, setApiUrl, requestFormat, setRequestFormat,
      metricPriority, setMetricPriority,
      auditResult, setAuditResult, proxyResult, setProxyResult, biasResult, setBiasResult,
      explainResult, setExplainResult, explainSummary, setExplainSummary,
      counterfactualResult, setCounterfactualResult,
      stressResult, setStressResult, recommendResult, setRecommendResult,
      sandboxResult, setSandboxResult, monitoringResult, setMonitoringResult,
      pipelineResults, isAnalyzing, analyzeError,
      runFullAnalysis,
      runModelBias, runRecommendFixes, runSandboxSimulation,
      runMonitoringSimulation, getMonitoringData,
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
