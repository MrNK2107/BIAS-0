import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { useChatbot } from "./ChatbotContext";

export default function ChatButton({
  bottomOffset = 80,
}: {
  bottomOffset?: number;
}) {
  const { toggle, isOpen, focusedSection } = useChatbot();

  return (
    <AnimatePresence>
      {!isOpen && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale: 1,
            opacity: 1,
            boxShadow: focusedSection
              ? ["0 0 0 0 rgba(212, 163, 115, 0.6)", "0 0 0 10px rgba(212, 163, 115, 0)"]
              : "0 2px 12px rgba(0,0,0,0.3)",
          }}
          transition={
            focusedSection
              ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.2 }
          }
          exit={{ scale: 0, opacity: 0 }}
          onClick={toggle}
          type="button"
          title="Open Fairness Assistant"
          aria-label="Open Fairness Assistant"
          style={{
            position: "fixed",
            bottom: bottomOffset,
            right: 24,
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "var(--accent, #D4A373)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
          }}
        >
          <MessageCircle size={20} color="#0F1115" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
