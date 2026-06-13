import { motion, AnimatePresence } from "framer-motion";
import { X, HelpCircle } from "lucide-react";
import { useExplain } from "./ExplainContext";
import { useChatbot } from "./chatbot/ChatbotContext";

function Skeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 0" }}>
      {[1, 2, 3].map((i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0.3 }}
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.15 }}
          style={{
            height: 10,
            borderRadius: 4,
            background: "rgba(255,255,255,0.06)",
            width: i === 2 ? "85%" : i === 3 ? "60%" : "100%",
          }}
        />
      ))}
    </div>
  );
}

function FormattedText({ text }: { text: string }) {
  const paragraphs = text.split("\n\n").filter(Boolean);
  return (
    <div style={{ fontSize: 13, lineHeight: 1.6, color: "#ccc" }}>
      {paragraphs.map((p, i) => (
        <p key={i} style={{ margin: "0 0 8px" }}>
          {p}
        </p>
      ))}
    </div>
  );
}

export default function ExplainPanel() {
  const { isOpen, close, metricName, explanation, loading } = useExplain();
  const { open: openChatbot, setFocusedSection } = useChatbot();

  const handleAskChat = () => {
    openChatbot();
    if (metricName) setFocusedSection(metricName);
    close();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ x: 340, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 340, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            width: 340,
            height: "100vh",
            background: "var(--surface, #1A1D23)",
            borderLeft: "1px solid rgba(212, 163, 115, 0.2)",
            zIndex: 1001,
            display: "flex",
            flexDirection: "column",
            boxShadow: "-4px 0 24px rgba(0,0,0,0.4)",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <HelpCircle size={16} color="var(--accent, #D4A373)" />
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                {metricName
                  ? metricName.replace(/_/g, " ")
                  : "Explanation"}
              </span>
            </div>
            <button
              type="button"
              onClick={close}
              style={{
                background: "none",
                border: "none",
                color: "#888",
                cursor: "pointer",
                padding: 2,
              }}
              aria-label="Close explanation"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px",
            }}
          >
            {loading ? (
              <Skeleton />
            ) : explanation ? (
              <FormattedText text={explanation} />
            ) : null}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "10px 16px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <button
              type="button"
              onClick={handleAskChat}
              style={{
                background: "none",
                border: "1px solid var(--accent, #D4A373)",
                borderRadius: 6,
                padding: "8px 12px",
                fontSize: 12,
                color: "var(--accent, #D4A373)",
                cursor: "pointer",
                width: "100%",
                textAlign: "center",
              }}
            >
              Ask the chatbot about this →
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
