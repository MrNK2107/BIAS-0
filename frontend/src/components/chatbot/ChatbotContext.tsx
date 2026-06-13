import { createContext, useContext, useState, useCallback, useRef } from "react";
import { api } from "../../api/client";
import { useAppContext } from "../../context/AppContext";

interface Message {
  role: "user" | "assistant";
  content: string;
  suggestions?: string[];
}

interface ChatbotContextValue {
  messages: Message[];
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  sendMessage: (question: string) => Promise<void>;
  clearSession: () => void;
  focusedSection: string | null;
  setFocusedSection: (section: string | null) => void;
  pageContext: Record<string, unknown>;
  setPageContext: (ctx: Record<string, unknown>) => void;
}

const ChatbotContext = createContext<ChatbotContextValue | null>(null);

export function ChatbotProvider({ children }: { children: React.ReactNode }) {
  const { projectId } = useAppContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [focusedSection, setFocusedSection] = useState<string | null>(null);
  const [pageContext, setPageContext] = useState<Record<string, unknown>>({});
  const sending = useRef(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const clearSession = useCallback(() => {
    setMessages([]);
    setFocusedSection(null);
  }, []);

  const sendMessage = useCallback(
    async (question: string) => {
      if (sending.current || !question.trim()) return;
      sending.current = true;

      const userMessage: Message = { role: "user", content: question };
      setMessages((prev) => [...prev, userMessage]);

      try {
        const res = await api.post("/chat/query", {
          project_id: projectId,
          question,
          context: {
            ...pageContext,
            focused_section: focusedSection,
          },
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        });

        const assistantMessage: Message = {
          role: "assistant",
          content: res.data.answer,
          suggestions: res.data.suggestions,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } catch {
        const errorMessage: Message = {
          role: "assistant",
          content: "Sorry, I couldn't process your question. Please try again.",
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        sending.current = false;
      }
    },
    [projectId, pageContext, focusedSection, messages],
  );

  return (
    <ChatbotContext.Provider
      value={{
        messages,
        isOpen,
        open,
        close,
        toggle,
        sendMessage,
        clearSession,
        focusedSection,
        setFocusedSection,
        pageContext,
        setPageContext,
      }}
    >
      {children}
    </ChatbotContext.Provider>
  );
}

export function useChatbot() {
  const ctx = useContext(ChatbotContext);
  if (!ctx) throw new Error("useChatbot must be used within ChatbotProvider");
  return ctx;
}
