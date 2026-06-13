import { useCallback } from "react";
import { useExplain } from "./ExplainContext";

interface HelpButtonProps {
  module: string;
  metricName: string;
  metricValue?: number;
  context?: Record<string, unknown>;
}

export default function HelpButton({
  module,
  metricName,
  metricValue,
  context,
}: HelpButtonProps) {
  const { open } = useExplain();

  const handleClick = useCallback(() => {
    open(module, metricName, metricValue, context);
  }, [module, metricName, metricValue, context, open]);

  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        onClick={handleClick}
        title="Explain this metric"
        aria-label="Explain this metric"
        style={{
          background: "none",
          border: "1px solid var(--accent, #D4A373)",
          borderRadius: "50%",
          width: 18,
          height: 18,
          fontSize: 11,
          lineHeight: "16px",
          textAlign: "center",
          color: "var(--accent, #D4A373)",
          cursor: "pointer",
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0.7,
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.7")}
      >
        ?
      </button>
    </span>
  );
}
