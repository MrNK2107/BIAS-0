import { useRef, useState } from "react";
import { ShieldCheck, ShieldAlert, Upload } from "lucide-react";
import { formApi } from "../api/client";

interface VerifyCheck {
  check: string;
  ok: boolean;
  detail?: string;
}

interface VerifyReport {
  ok: boolean;
  kind: "bundle" | "pack";
  signed?: boolean;
  checks: VerifyCheck[];
  files: string[];
}

/**
 * Upload an exported evidence bundle (.zip) or pack (.json) and have the API
 * recompute every hash (POST /api/evidence/verify).
 */
export default function EvidenceVerify() {
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);
  const [report, setReport] = useState<VerifyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setName(f.name);
    setReport(null);
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await formApi.post("/evidence/verify", fd);
      setReport(res.data as VerifyReport);
    } catch (err) {
      setError(
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
          "Verification failed",
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const failed = report?.checks.filter((c) => !c.ok) ?? [];

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Verify an evidence bundle</h2>
          <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: "4px 0 0" }}>
            Recomputes the SHA-256 of every file and the pack's canonical hash. Detects edits after export; the bundle is not signed.
          </p>
        </div>
        <label className="btn btn-small file-btn" style={{ cursor: busy ? "wait" : "pointer" }}>
          <Upload size={14} /> {busy ? "Checking…" : "Choose .zip or .json"}
          <input
            ref={input}
            type="file"
            accept=".zip,.json,application/zip,application/json"
            style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
            disabled={busy}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
      </div>
      <div role="status" aria-live="polite" style={{ marginTop: report || error ? 12 : 0 }}>
        {error && <p style={{ color: "#D9837E", margin: 0, fontSize: "0.85rem" }}>{error}</p>}
        {report && (
          <div>
            <p
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                margin: 0,
                fontWeight: 600,
                color: report.ok ? "#8FC7A6" : "#D9837E",
              }}
            >
              {report.ok ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
              {report.ok
                ? `${name}: all ${report.checks.length} checks passed`
                : `${name}: ${failed.length} of ${report.checks.length} checks failed`}
            </p>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              {report.checks.map((c) => (
                <li key={c.check}>
                  <span style={{ color: c.ok ? "#8FC7A6" : "#D9837E" }}>{c.ok ? "ok" : "FAIL"}</span> {c.check}
                  {!c.ok && c.detail ? ` (${c.detail})` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
