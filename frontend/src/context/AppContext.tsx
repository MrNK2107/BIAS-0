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

  // Pipeline methods
  runDataAudit: () => Promise<void>;
  runModelBias: (customStressScenarios?: any[]) => Promise<void>;
  runCounterfactualAnalysis: () => Promise<void>;
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

  const getFormData = () => {
    const fd = new FormData();
    fd.append('project_id', projectId);
    fd.append('sensitive_cols', sensitiveCols.join(','));
    fd.append('target_col', targetCol);
    fd.append('metric_priority', metricPriority);
    if (file) fd.append('file', file);
    return fd;
  };

  const getFormDataForProxy = () => {
    const fd = new FormData();
    fd.append('sensitive_cols', sensitiveCols.join(','));
    if (file) fd.append('file', file);
    return fd;
  };
  
  const getFormDataForCounterfactual = () => {
    const fd = new FormData();
    // Assuming the first sensitive col is what we test against
    fd.append('sensitive_col', sensitiveCols[0] || '');
    fd.append('target_col', targetCol);
    fd.append('metric_priority', metricPriority);
    if (file) fd.append('file', file);
    return fd;
  };

  const runDataAudit = async () => {
    if (!file) return;
    const auditRes = await formApi.post('/audit/data', getFormData());
    setAuditResult(auditRes.data);

    const proxyRes = await formApi.post('/audit/proxy', getFormDataForProxy());
    setProxyResult(proxyRes.data);
  };

  const runModelBias = async (customStressScenarios?: any[]) => {
    if (!file) return;
    
    let biasRes;
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
      biasRes = await formApi.post('/bias/model-from-api', apiFd);
    } else {
      biasRes = await formApi.post('/bias/model', fd);
    }
    setBiasResult(biasRes.data);

    const explainRes = await formApi.post('/bias/explain', fd);
    setExplainResult(explainRes.data);

    const summaryRes = await api.post('/bias/explain-summary', {
      flagged_list: explainRes.data,
      sensitive_cols: sensitiveCols,
      domain: domain
    });
    setExplainSummary(summaryRes.data.summary);

    const cfRes = await formApi.post('/bias/counterfactual', getFormDataForCounterfactual());
    setCounterfactualResult(cfRes.data);

    const stressRes = await formApi.post('/bias/stress', fd);
    setStressResult(stressRes.data);
  };

  const runCounterfactualAnalysis = async () => {
    if (!file) return;
    const cfRes = await formApi.post('/bias/counterfactual', getFormDataForCounterfactual());
    setCounterfactualResult(cfRes.data);
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
    // projectId is '1' by default in the state
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
      runDataAudit, runModelBias, runCounterfactualAnalysis, runRecommendFixes, runSandboxSimulation,
      runMonitoringSimulation, getMonitoringData
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
