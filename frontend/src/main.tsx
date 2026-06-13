import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/globals.css";
import { AppProvider } from "./context/AppContext";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { ChatbotProvider } from "./components/chatbot/ChatbotContext";
import { ExplainProvider } from "./components/ExplainContext";
import { getConfigError, FirebaseConfigError } from "./firebase/config";

function ConfigErrorScreen({ error }: { error: FirebaseConfigError }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
        background: "#0F1115",
        color: "#EAEAEA",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 720,
          width: "100%",
          background: "#1A1D23",
          border: "1px solid #A24A46",
          borderRadius: 8,
          padding: 32,
        }}
      >
        <h1
          style={{
            margin: 0,
            color: "#A24A46",
            fontSize: 24,
            fontWeight: 600,
          }}
        >
          Firebase configuration error
        </h1>
        <p style={{ marginTop: 12, color: "#9CA3AF" }}>
          The frontend cannot start because the Firebase environment is invalid.
          Sign-in (and any other auth flow) will not work until this is fixed.
        </p>
        <pre
          style={{
            marginTop: 20,
            padding: 16,
            background: "#0F1115",
            border: "1px solid #2A2D33",
            borderRadius: 6,
            color: "#EAEAEA",
            fontSize: 13,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflowX: "auto",
          }}
        >
          {error.message}
        </pre>
      </div>
    </div>
  );
}

const configError = getConfigError();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {configError ? (
      <ConfigErrorScreen error={configError} />
    ) : (
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <AppProvider>
              <ExplainProvider>
                <ChatbotProvider>
                  <App />
                </ChatbotProvider>
              </ExplainProvider>
            </AppProvider>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    )}
  </React.StrictMode>,
);
