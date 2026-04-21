import React, { createContext, useContext, useState, ReactNode } from 'react';
import { formApi, api } from '../api/client';

interface AppState {
  file: File | null;
  sensitiveCols: string[];
  targetCol: string;
  domain: string;
  projectId: string;
  auditResult: any;
  proxyResult: any;
  biasResult: any;
  explainResult: any;
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
  setAuditResult: (val: any) => void;
  setProxyResult: (val: any) => void;
  setBiasResult: (val: any) => void;
  setExplainResult: (val: any) => void;
  setCounterfactualResult: (val: any) => void;
  setStressResult: (val: any) => void;
  setRecommendResult: (val: any) => void;
  setSandboxResult: (val: any) => void;
  setMonitoringResult: (val: any) => void;

  // Pipeline methods
  runDataAudit: () => Promise<void>;
  runModelBias: () => Promise<void>;
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

  const [auditResult, setAuditResult] = useState<any>(null);
  const [proxyResult, setProxyResult] = useState<any>(null);
  const [biasResult, setBiasResult] = useState<any>(null);
  const [explainResult, setExplainResult] = useState<any>(null);
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

  const runModelBias = async () => {
    if (!file) return;
    const biasRes = await formApi.post('/bias/model', getFormData());
    setBiasResult(biasRes.data);

    const explainRes = await formApi.post('/bias/explain', getFormData());
    setExplainResult(explainRes.data);

    const cfRes = await formApi.post('/bias/counterfactual', getFormDataForCounterfactual());
    setCounterfactualResult(cfRes.data);

    const stressRes = await formApi.post('/bias/stress', getFormData());
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
    // Prepare sandbox form data
    const fd = new FormData();
    fd.append('sensitive_cols', sensitiveCols.join(','));
    fd.append('target_col', targetCol);
    fd.append('file', file);
    fd.append('selected_fixes', fixes.join(',')); // Comma separated string for fixes backend
    
    // Note: The backend /fixes/sandbox expects selected_fixes: str = Form(...) 
    
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
      auditResult, setAuditResult, proxyResult, setProxyResult, biasResult, setBiasResult, 
      explainResult, setExplainResult, counterfactualResult, setCounterfactualResult,
      stressResult, setStressResult, recommendResult, setRecommendResult,
      sandboxResult, setSandboxResult, monitoringResult, setMonitoringResult,
      runDataAudit, runModelBias, runRecommendFixes, runSandboxSimulation,
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
