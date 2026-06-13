import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const VARIANT_STYLES: Record<
  ToastVariant,
  { bg: string; border: string; color: string; icon: ReactNode }
> = {
  success: {
    bg: "rgba(200, 157, 124, 0.14)",
    border: "rgba(200, 157, 124, 0.55)",
    color: "var(--accent)",
    icon: <CheckCircle2 size={16} />,
  },
  error: {
    bg: "rgba(162, 74, 70, 0.16)",
    border: "rgba(162, 74, 70, 0.55)",
    color: "var(--warning)",
    icon: <AlertTriangle size={16} />,
  },
  info: {
    bg: "rgba(255, 255, 255, 0.06)",
    border: "var(--border)",
    color: "var(--text-primary)",
    icon: <Info size={16} />,
  },
};

let _id = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
    const t = timersRef.current[id];
    if (t) {
      clearTimeout(t);
      delete timersRef.current[id];
    }
  }, []);

  const showToast = useCallback<ToastContextValue["showToast"]>(
    (message, variant = "success") => {
      const id = ++_id;
      setToasts((cur) => [...cur, { id, message, variant }]);
      timersRef.current[id] = setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        style={{
          position: "fixed",
          top: 20,
          right: 20,
          zIndex: 1100,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          pointerEvents: "none",
          maxWidth: "min(92vw, 360px)",
        }}
      >
        <AnimatePresence>
          {toasts.map((t) => {
            const s = VARIANT_STYLES[t.variant];
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, x: 24, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, scale: 0.95 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                role="status"
                style={{
                  pointerEvents: "auto",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "12px 14px",
                  background: s.bg,
                  border: `0.5px solid ${s.border}`,
                  borderRadius: 12,
                  color: s.color,
                  fontSize: "0.88rem",
                  lineHeight: 1.4,
                  boxShadow: "0 14px 36px rgba(0,0,0,0.45)",
                  backdropFilter: "blur(10px)",
                }}
              >
                <span style={{ flexShrink: 0, marginTop: 1 }}>{s.icon}</span>
                <span style={{ flex: 1, color: "var(--text-primary)" }}>
                  {t.message}
                </span>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => dismiss(t.id)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <X size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
