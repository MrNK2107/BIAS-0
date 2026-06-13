import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, MessageCircle } from "lucide-react";
import { useChatbot } from "./ChatbotContext";

export default function ChatbotPanel() {
  const {
    messages,
    isOpen,
    close,
    sendMessage,
    clearSession,
    focusedSection,
  } = useChatbot();
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async () => {
    if (!input.trim()) return;
    setInput("");
    await sendMessage(input.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            width: 320,
            height: "100vh",
            background: "var(--surface, #1A1D23)",
            borderLeft: "1px solid rgba(212, 163, 115, 0.2)",
            zIndex: 1000,
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
              <MessageCircle size={16} color="var(--accent, #D4A373)" />
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                Fairness Assistant
              </span>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                type="button"
                onClick={clearSession}
                style={{
                  background: "none",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 4,
                  color: "#888",
                  cursor: "pointer",
                  fontSize: 10,
                  padding: "2px 6px",
                }}
                title="Clear conversation"
              >
                Clear
              </button>
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
                aria-label="Close chatbot"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={listRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {messages.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  color: "#666",
                  fontSize: 13,
                  marginTop: 40,
                }}
              >
                {focusedSection ? (
                  <>
                    <p>Ask me about <strong>{focusedSection.replace(/_/g, " ")}</strong></p>
                    <p style={{ fontSize: 11, marginTop: 4 }}>
                      Or type any question about the current page.
                    </p>
                  </>
                ) : (
                  <>
                    <p>Ask me about any metric or finding on this page.</p>
                    <p style={{ fontSize: 11, marginTop: 4 }}>
                      I can explain fairness scores, bias metrics, SHAP values, and more.
                    </p>
                  </>
                )}
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i}>
                <div
                  style={{
                    alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                    background:
                      msg.role === "user"
                        ? "rgba(212, 163, 115, 0.12)"
                        : "rgba(255,255,255,0.04)",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: msg.role === "user" ? "#fff" : "#ccc",
                    maxWidth: "90%",
                    marginBottom: 4,
                  }}
                >
                  {msg.content}
                </div>

                {msg.suggestions && msg.suggestions.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                    {msg.suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => sendMessage(s)}
                        style={{
                          background: "rgba(212, 163, 115, 0.08)",
                          border: "1px solid rgba(212, 163, 115, 0.2)",
                          borderRadius: 12,
                          padding: "3px 10px",
                          fontSize: 11,
                          color: "var(--accent, #D4A373)",
                          cursor: "pointer",
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Input */}
          <div
            style={{
              padding: "10px 16px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question..."
              style={{
                flex: 1,
                background: "rgba(0,0,0,0.3)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 6,
                padding: "8px 10px",
                fontSize: 13,
                color: "#fff",
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!input.trim()}
              style={{
                background: "var(--accent, #D4A373)",
                border: "none",
                borderRadius: 6,
                padding: "7px 9px",
                cursor: input.trim() ? "pointer" : "default",
                opacity: input.trim() ? 1 : 0.4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="Send message"
            >
              <Send size={14} color="#0F1115" />
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
