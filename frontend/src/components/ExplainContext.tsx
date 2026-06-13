import { createContext, useContext, useState, useCallback } from "react";
import { api } from "../api/client";
import { useAppContext } from "../context/AppContext";

interface ExplainContextValue {
  isOpen: boolean;
  module: string | null;
  metricName: string | null;
  metricValue: number | null | undefined;
  explanation: string | null;
  loading: boolean;
  open: (
    module: string,
    metricName: string,
    metricValue?: number,
    context?: Record<string, unknown>,
  ) => void;
  close: () => void;
}

const ExplainContext = createContext<ExplainContextValue | null>(null);

export function ExplainProvider({ children }: { children: React.ReactNode }) {
  const { projectId } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  const [module, setModule] = useState<string | null>(null);
  const [metricName, setMetricName] = useState<string | null>(null);
  const [metricValue, setMetricValue] = useState<number | null | undefined>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const open = useCallback(
    async (
      m: string,
      mn: string,
      mv?: number,
      ctx?: Record<string, unknown>,
    ) => {
      setModule(m);
      setMetricName(mn);
      setMetricValue(mv);
      setExplanation(null);
      setLoading(true);
      setIsOpen(true);

      if (!projectId) {
        setExplanation("Select a project first.");
        setLoading(false);
        return;
      }

      try {
        const res = await api.post("/explain/metric", {
          project_id: projectId,
          module: m,
          metric_name: mn,
          metric_value: mv,
          context: ctx ?? {},
        });
        setExplanation(res.data.explanation);
      } catch {
        setExplanation("Could not load explanation. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [projectId],
  );

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <ExplainContext.Provider
      value={{
        isOpen,
        module,
        metricName,
        metricValue,
        explanation,
        loading,
        open,
        close,
      }}
    >
      {children}
    </ExplainContext.Provider>
  );
}

export function useExplain() {
  const ctx = useContext(ExplainContext);
  if (!ctx) throw new Error("useExplain must be used within ExplainProvider");
  return ctx;
}
