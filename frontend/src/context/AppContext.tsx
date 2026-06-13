import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { formApi, api, setUnauthorizedHandler } from "../api/client";
import { useToast } from "./ToastContext";
import { useAuth } from "./AuthContext";
import type {
  DataAuditResult,
  ProxyResult,
  ModelBiasResult,
  ExplanationRecord,
  CounterfactualResult,
  StressTestResult,
  FixRecommendation,
  SandboxResult,
  MonitoringHistoryResponse,
  PipelineFullResult,
  PipelineStatusResponse,
  PipelineResultResponse,
  ProjectLatestResponse,
  ProjectRecord,
  CustomScenario,
} from "../types";

interface AppState {
  file: File | null;
  sensitiveCols: string[];
  targetCol: string;
  domain: string;
  projectId: string | null;
  modelType: "file" | "api";
  customModelFile: File | null;
  apiUrl: string;
  requestFormat: string;
  metricPriority: string;
  auditResult: DataAuditResult | null;
  proxyResult: ProxyResult | null;
  biasResult: ModelBiasResult | null;
  explainResult: ExplanationRecord[] | null;
  explainSummary: string | null;
  counterfactualResult: CounterfactualResult | null;
  stressResult: StressTestResult | null;
  recommendResult: FixRecommendation[] | null;
  sandboxResult: SandboxResult | null;
  monitoringResult: MonitoringHistoryResponse | null;
  pipelineResults: PipelineFullResult | null;
  isAnalyzing: boolean;
  analyzeError: string | null;
  projects: ProjectRecord[];
  projectsLoaded: boolean;
  maxStep: number;
}

interface AppContextType extends AppState {
  setFile: (val: File | null) => void;
  setSensitiveCols: (val: string[]) => void;
  setTargetCol: (val: string) => void;
  setDomain: (val: string) => void;
  setProjectId: (val: string | null) => void;
  setModelType: (val: "file" | "api") => void;
  setCustomModelFile: (val: File | null) => void;
  setApiUrl: (val: string) => void;
  setRequestFormat: (val: string) => void;
  setMetricPriority: (val: string) => void;
  setAuditResult: (val: DataAuditResult | null) => void;
  setProxyResult: (val: ProxyResult | null) => void;
  setBiasResult: (val: ModelBiasResult | null) => void;
  setExplainResult: (val: ExplanationRecord[] | null) => void;
  setExplainSummary: (val: string | null) => void;
  setCounterfactualResult: (val: CounterfactualResult | null) => void;
  setStressResult: (val: StressTestResult | null) => void;
  setRecommendResult: (val: FixRecommendation[] | null) => void;
  setSandboxResult: (val: SandboxResult | null) => void;
  setMonitoringResult: (val: MonitoringHistoryResponse | null) => void;

  runFullAnalysis: () => Promise<void>;
  runModelBias: (customStressScenarios?: CustomScenario[]) => Promise<void>;
  runRecommendFixes: () => Promise<void>;
  runSandboxSimulation: (fixes: string[]) => Promise<void>;
  runMonitoringSimulation: () => Promise<void>;
  getMonitoringData: () => Promise<void>;
  refreshProjects: () => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  advanceStep: (step: number) => Promise<void>;
  setResultsFromPipeline: (data: PipelineFullResult) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      showToast("Your session has expired. Please sign in again.", "error");
    });
    return () => setUnauthorizedHandler(null);
  }, [showToast]);

  const [file, setFile] = useState<File | null>(null);
  const [sensitiveCols, setSensitiveCols] = useState<string[]>([]);
  const [targetCol, setTargetCol] = useState("");
  const [domain, setDomain] = useState("loan");
  const prevUserId = useRef<string | null>(null);

  const [projectId, setProjectId] = useState<string | null>(() => {
    return localStorage.getItem("active_project_id");
  });
  const [modelType, setModelType] = useState<"file" | "api">("file");
  const [customModelFile, setCustomModelFile] = useState<File | null>(null);
  const [apiUrl, setApiUrl] = useState("");
  const [requestFormat, setRequestFormat] = useState("");
  const [metricPriority, setMetricPriority] = useState("balanced");

  const [auditResult, setAuditResult] = useState<DataAuditResult | null>(null);
  const [proxyResult, setProxyResult] = useState<ProxyResult | null>(null);
  const [biasResult, setBiasResult] = useState<ModelBiasResult | null>(null);
  const [explainResult, setExplainResult] = useState<
    ExplanationRecord[] | null
  >(null);
  const [explainSummary, setExplainSummary] = useState<string | null>(null);
  const [counterfactualResult, setCounterfactualResult] =
    useState<CounterfactualResult | null>(null);
  const [stressResult, setStressResult] = useState<StressTestResult | null>(
    null,
  );
  const [recommendResult, setRecommendResult] = useState<
    FixRecommendation[] | null
  >(null);
  const [sandboxResult, setSandboxResult] = useState<SandboxResult | null>(
    null,
  );
  const [monitoringResult, setMonitoringResult] =
    useState<MonitoringHistoryResponse | null>(null);

  const [pipelineResults, setPipelineResults] =
    useState<PipelineFullResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  // ── Unified pipeline ────────────────────────────────────────────────────────
  const runFullAnalysis = async () => {
    if (!file) return;
    if (isAnalyzing) return; // Guard against concurrent triggers

    setIsAnalyzing(true);
    setAnalyzeError(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("sensitive_cols", sensitiveCols.join(","));
      fd.append("target_col", targetCol);
      fd.append("project_id", projectId ?? "0");
      fd.append("metric_priority", metricPriority);
      fd.append("domain", domain);
      if (customModelFile) {
        fd.append("custom_model_file", customModelFile);
      }

      const kickoff = await formApi.post("/pipeline/run-all", fd, {
        timeout: 60000,
      });
      const { task_id } = kickoff.data as { task_id: string; status: string };

      localStorage.setItem(
        "active_analysis_task",
        JSON.stringify({ taskId: task_id, projectId }),
      );

      await new Promise((r) => setTimeout(r, 1000));
      const data = await pollTaskStatus(task_id);

      setResultsFromPipeline(data);
      await refreshProjects();
      localStorage.removeItem("active_analysis_task");
    } catch (err) {
      const e = err as {
        code?: string;
        message?: string;
        response?: { data?: { detail?: string } };
      };
      console.error("Analysis pipeline error:", e);
      const isTimeout =
        e?.code === "ECONNABORTED" || e?.message?.includes("timeout");
      const isNetworkIssue = e?.message?.includes("Network Error");
      const message = isTimeout
        ? "Analysis timed out. The server is taking longer than expected to finalize results. Please check the terminal logs or try again."
        : isNetworkIssue
          ? "Cannot reach backend API. Please make sure the backend server is running."
          : e?.response?.data?.detail ||
            e?.message ||
            "Analysis failed. Please try again.";
      setAnalyzeError(message);
      throw err;
    } finally {
      setIsAnalyzing(false);
    }
  };

  const pollTaskStatus = async (
    task_id: string,
  ): Promise<PipelineFullResult> => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const interval = setInterval(async () => {
        if (Date.now() - startTime > 300_000) {
          clearInterval(interval);
          reject(new Error("Analysis timed out after 5 minutes"));
          return;
        }
        try {
          const poll = await api.get(`/pipeline/status/${task_id}`, {
            timeout: 60000,
          });
          const data = poll.data as PipelineStatusResponse;
          const { status, result, error } = data;
          if (status === "complete" && result) {
            clearInterval(interval);
            resolve(result);
          } else if (status === "error") {
            clearInterval(interval);
            reject(new Error(error || "Pipeline failed"));
          }
        } catch (pollErr) {
          const pe = pollErr as { code?: string; message?: string };
          if (pe?.code === "ECONNABORTED" || pe?.message?.includes("timeout")) {
            clearInterval(interval);
            reject(
              new Error(
                "Connection timed out while waiting for results. The server may be busy finalizing data.",
              ),
            );
          }
        }
      }, 3000);
    });
  };

  // Resume active task on reload
  useEffect(() => {
    if (!projectId) return;
    const stored = localStorage.getItem("active_analysis_task");
    if (!stored) return;
    let parsed: { taskId: string; projectId: string } | null = null;
    try { parsed = JSON.parse(stored); } catch { /* ignore */ }
    if (!parsed || parsed.projectId !== projectId) return;
    if (pipelineResults || isAnalyzing) return;

    setIsAnalyzing(true);
    pollTaskStatus(parsed.taskId)
      .then((data) => {
        setResultsFromPipeline(data);
        refreshProjects();
        localStorage.removeItem("active_analysis_task");
      })
      .catch((err) => {
        console.error("Failed to resume task", err);
        localStorage.removeItem("active_analysis_task");
        setIsAnalyzing(false);
      });
  }, [projectId, pipelineResults, isAnalyzing]);

  const setResultsFromPipeline = (
    data: PipelineFullResult | PipelineResultResponse | ProjectLatestResponse,
  ) => {
    // Flatten nested response shapes from different endpoints into a single result
    let result: PipelineFullResult | null = null;

    // Unwrap recursively without triggering intermediate state updates
    let current: unknown = data;
     
    while (true) {
      const d = current as PipelineFullResult;
      if (d && d.scores) {
        result = d;
        break;
      }
      const wrapped = current as PipelineResultResponse;
      if (wrapped.details) {
        current = wrapped.details;
        continue;
      }
      const projectWrapped = current as ProjectLatestResponse;
      if (projectWrapped.result) {
        current = projectWrapped.result;
        continue;
      }
      break;
    }

    if (!result) {
      setIsAnalyzing(false);
      setAnalyzeError("Pipeline returned no data. Please check your data and try again.");
      return;
    }
    if (!result.scores) {
      setIsAnalyzing(false);
      setAnalyzeError("Pipeline results are incomplete (missing scores). Your data configuration may need adjustment.");
      return;
    }

    // Batch all state updates in a single microtask
    queueMicrotask(() => {
      setAnalyzeError(null);
      setIsAnalyzing(false);
      setAuditResult(result!.data_audit ?? null);
      setProxyResult(result!.proxy ?? null);
      setBiasResult(result!.model_bias ?? null);
      setExplainResult(result!.explanations ?? null);
      setExplainSummary(result!.explain_summary ?? null);
      setCounterfactualResult(result!.counterfactual ?? null);
      setStressResult(result!.stress ?? null);
      setRecommendResult(result!.recommendations ?? null);
      setPipelineResults(result!);
    });
  };

  // ── Legacy helpers (kept for interactive steps) ─────────────────────────────
  const getFormData = () => {
    const fd = new FormData();
    fd.append("project_id", projectId || "");
    fd.append("sensitive_cols", sensitiveCols.join(","));
    fd.append("target_col", targetCol);
    fd.append("metric_priority", metricPriority);
    if (file) fd.append("file", file);
    return fd;
  };

  /** @deprecated Legacy endpoint — prefer unified pipeline results.
   *  If pipeline results exist, returns them directly without calling the legacy API.
   *  Custom stress scenarios still need this path for interactive Step 7 usage. */
  const runModelBias = async (customStressScenarios?: CustomScenario[]) => {
    // If no custom scenarios and pipeline data exists, use that instead of legacy API
    if (!customStressScenarios && pipelineResults) {
      if (pipelineResults.model_bias) setBiasResult(pipelineResults.model_bias);
      if (pipelineResults.stress) setStressResult(pipelineResults.stress);
      return;
    }

    // Custom scenarios require the actual file bytes
    if (!file) throw new Error("The dataset file is required to run stress tests. Please re-upload in Step 1.");

    const fd = getFormData();
    if (customStressScenarios) {
      fd.append("custom_scenarios", JSON.stringify(customStressScenarios));
    }

    if (modelType === "api") {
      if (!apiUrl || !requestFormat) {
        throw new Error(
          "API URL and Request Format are required for API endpoint model",
        );
      }
      const apiFd = new FormData();
      apiFd.append("project_id", projectId ?? "");
      apiFd.append("api_url", apiUrl);
      apiFd.append("api_request_format", requestFormat);
      apiFd.append("sensitive_cols", sensitiveCols.join(","));
      apiFd.append("target_col", targetCol);
      apiFd.append("metric_priority", metricPriority);
      apiFd.append("file", file);
      if (customStressScenarios) {
        apiFd.append("custom_scenarios", JSON.stringify(customStressScenarios));
      }
      const biasRes = await formApi.post("/bias/model-from-api", apiFd);
      setBiasResult(biasRes.data);
    } else {
      const biasRes = await formApi.post("/bias/model", fd);
      setBiasResult(biasRes.data);
    }

    const stressRes = await formApi.post("/bias/stress", fd);
    setStressResult(stressRes.data);
  };

  const runRecommendFixes = async () => {
    if (!file && !auditResult && !biasResult && !proxyResult) return;
    const payload = {
      project_id: projectId ?? "",
      audit_result: auditResult,
      proxy_result: proxyResult,
      bias_result: biasResult,
    };
    const res = await api.post("/fixes/recommend", payload);
    setRecommendResult(res.data);
  };

  const runSandboxSimulation = async (fixes: string[]) => {
    if (!file && !pipelineResults) return;
    if (!file) {
      throw new Error(
        "The dataset file is required for sandbox simulations. " +
        "Please re-upload the CSV file in Step 1 to run simulations."
      );
    }
    const fd = new FormData();
    fd.append("project_id", projectId ?? "");
    fd.append("sensitiveCols", sensitiveCols.join(","));
    fd.append("targetCol", targetCol);
    fd.append("metric_priority", metricPriority);
    fd.append("file", file);
    fd.append("strategies", fixes.join(","));
    fd.append("audit_result", JSON.stringify(auditResult));
    fd.append("proxy_result", JSON.stringify(proxyResult));
    fd.append("bias_result", JSON.stringify(biasResult));

    const res = await formApi.post("/fixes/sandbox", fd);
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
      const res = await api.get("/project/list");
      const data = res.data;
      setProjects(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn("Failed to refresh projects:", err);
      setProjects([]);
    } finally {
      setProjectsLoaded(true);
    }
  };

  const deleteProject = async (id: string) => {
    try {
      await api.delete(`/project/${id}`);
      localStorage.removeItem(`max_step_${id}`);
      if (projectId === id) {
        setProjectId(null);
        localStorage.removeItem("active_project_id");
      }
      await refreshProjects();
      showToast("Project deleted.", "info");
    } catch (err) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Failed to delete project";
      showToast(msg, "error");
    }
  };

  const advanceStep = async (step: number) => {
    if (!projectId) return;
    localStorage.setItem(
      `max_step_${projectId}`,
      String(
        Math.max(
          step,
          parseInt(localStorage.getItem(`max_step_${projectId}`) ?? "1", 10),
        ),
      ),
    );
    try {
      const fd = new FormData();
      fd.append("step", step.toString());
      await formApi.patch(`/project/${projectId}/step`, fd);
      await refreshProjects();
    } catch (err) {
      console.error("Failed to advance step", err);
    }
  };

  // ── Persistence & Hydration ────────────────────────────────────────────────

  const fetchCounterRef = useRef(0);

  useEffect(() => {
    if (!projectId) return;

    // Bump fetch counter so stale responses are discarded
    const currentFetch = ++fetchCounterRef.current;

    // 1. Reset all project-specific state
    setFile(null);
    setSensitiveCols([]);
    setTargetCol("");
    setDomain("loan");
    setModelType("file");
    setCustomModelFile(null);
    setApiUrl("");
    setRequestFormat("");
    setMetricPriority("balanced");
    setAuditResult(null);
    setProxyResult(null);
    setBiasResult(null);
    setExplainResult(null);
    setExplainSummary(null);
    setCounterfactualResult(null);
    setStressResult(null);
    setRecommendResult(null);
    setSandboxResult(null);
    setMonitoringResult(null);
    setPipelineResults(null);
    setIsAnalyzing(false);
    setAnalyzeError(null);

    // 2. Sync to localStorage
    localStorage.setItem("active_project_id", projectId);

    // 3. Populate existing project configuration if available
    const p = projects.find((proj) => String(proj.id) === String(projectId));
    if (p) {
      if (p.sensitive_columns) setSensitiveCols(p.sensitive_columns);
      if (p.target_column) setTargetCol(p.target_column);
      if (p.domain) setDomain(p.domain);
    }

    // 4. Fetch latest pipeline results (with stale-response guard)
    api
      .get(`/project/${projectId}/latest`)
      .then((res) => {
        if (fetchCounterRef.current !== currentFetch) return; // Stale response — discard
        const data = res.data as ProjectLatestResponse;
        if (data.status === "complete") {
          setResultsFromPipeline(data);
        }
      })
      .catch((err) => {
        if (fetchCounterRef.current !== currentFetch) return; // Stale response — discard
        console.warn("Failed to fetch latest pipeline results for project %s:", projectId, err);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Sync configuration when projects list loads/updates (e.g. on mount after refreshProjects)
  useEffect(() => {
    if (projectId && projects.length > 0) {
      const p = projects.find((proj) => String(proj.id) === String(projectId));
      if (p) {
        if (p.sensitive_columns && sensitiveCols.length === 0) setSensitiveCols(p.sensitive_columns);
        if (p.target_column && !targetCol) setTargetCol(p.target_column);
        if (p.domain && domain === "loan") setDomain(p.domain);
      }
    }
  }, [projects, projectId, domain, sensitiveCols.length, targetCol]);

  // Sync projects and active project selection on auth state change
  useEffect(() => {
    const currentUid = user?.uid ?? null;
    if (currentUid === prevUserId.current) return;
    const wasLoggedIn = prevUserId.current !== null;
    prevUserId.current = currentUid;

    if (wasLoggedIn || !currentUid) {
      setProjects([]);
      setProjectsLoaded(false);
      setProjectId(null);
    }
    if (currentUid) {
      refreshProjects();
    }
  }, [user]);

  // Validate active project ID against user's project list once loaded.
  // This MUST also fire when projects.length === 0, because a Firestore
  // reset or delete-all leaves no projects — the stale localStorage ID
  // must be cleared so guards don't pass a non-existent project.
  useEffect(() => {
    if (projectsLoaded && projectId) {
      const exists =
        projects.length > 0 &&
        projects.some((p) => String(p.id) === String(projectId));
      if (!exists) {
        setProjectId(null);
        localStorage.removeItem("active_project_id");
      }
    }
  }, [projects, projectsLoaded, projectId]);

  const currentProject = projects.find(
    (p) => p.id?.toString() === projectId?.toString(),
  );
  const maxStep = Math.min(
    currentProject?.max_step ??
      parseInt(localStorage.getItem(`max_step_${projectId}`) ?? "1", 10),
    9,
  );

  return (
    <AppContext.Provider
      value={{
        file,
        setFile,
        sensitiveCols,
        setSensitiveCols,
        targetCol,
        setTargetCol,
        domain,
        setDomain,
        projectId,
        setProjectId,
        modelType,
        setModelType,
        customModelFile,
        setCustomModelFile,
        apiUrl,
        setApiUrl,
        requestFormat,
        setRequestFormat,
        metricPriority,
        setMetricPriority,
        auditResult,
        setAuditResult,
        proxyResult,
        setProxyResult,
        biasResult,
        setBiasResult,
        explainResult,
        setExplainResult,
        explainSummary,
        setExplainSummary,
        counterfactualResult,
        setCounterfactualResult,
        stressResult,
        setStressResult,
        recommendResult,
        setRecommendResult,
        sandboxResult,
        setSandboxResult,
        monitoringResult,
        setMonitoringResult,
        pipelineResults,
        isAnalyzing,
        analyzeError,
        projects,
        projectsLoaded,
        maxStep,
        runFullAnalysis,
        runModelBias,
        runRecommendFixes,
        runSandboxSimulation,
        runMonitoringSimulation,
        getMonitoringData,
        refreshProjects,
        deleteProject,
        advanceStep,
        setResultsFromPipeline,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
}
