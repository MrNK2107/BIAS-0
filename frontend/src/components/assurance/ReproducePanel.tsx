import { useState } from "react";
import { CheckCircle2, FileSearch, Loader2, XCircle } from "lucide-react";
import { formApi } from "../../api/client";
import { num, type ReproduceResult } from "../../utils/assurance";

function errorText(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } }; message?: string };
  const d = e.response?.data?.detail;
  return typeof d === "string" ? d : e.message ?? "Could not verify the report.";
}

function show(v: unknown): string {
  if (v && typeof v === "object" && "point" in (v as Record<string, unknown>)) {
    const iv = v as { point: number | null; ci_lower: number | null; ci_upper: number | null };
    return `${num(iv.point)} (${num(iv.ci_lower)}–${num(iv.ci_upper)})`;
  }
  return v === null || v === undefined ? "–" : String(v);
}

/**
 * For an auditor or counterparty: take a BIAS-0 report and the decision log it
 * claims to come from, check the SHA-256, and re-run the audit with the
 * settings fingerprinted in the report.
 */
export default function ReproducePanel() {
  const [csv, setCsv] = useState<File | null>(null);
  const [report, setReport] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReproduceResult | null>(null);

  const verify = async () => {
    if (!csv || !report) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", csv, csv.name);
      fd.append("report", report, report.name);
      const res = await formApi.post<ReproduceResult>("/assurance/verify-report", fd, { timeout: 180_000 });
      setResult(res.data);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="az-panel az-repro" aria-labelledby="repro-title">
      <span className="mono-label">For auditors · trust nothing</span>
      <h2 id="repro-title">Reproduce a report</h2>
      <p className="az-panel-sub">
        Someone sent you a BIAS-0 report? Add it with the decision log it claims to come from. BIAS-0 checks the file's
        SHA-256 against the report, re-runs the audit with the settings recorded inside the report, and compares every
        verdict and interval.
      </p>
      <div className="az-repro-inputs">
        <label className="az-repro-file">
          <span>Report (.html)</span>
          <input
            type="file"
            accept=".html,text/html"
            aria-label="Choose a BIAS-0 report"
            onChange={(e) => {
              setReport(e.target.files?.[0] ?? null);
              setResult(null);
            }}
          />
        </label>
        <label className="az-repro-file">
          <span>Decision log (.csv)</span>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Choose the decision log for the report"
            onChange={(e) => {
              setCsv(e.target.files?.[0] ?? null);
              setResult(null);
            }}
          />
        </label>
        <button type="button" className="lp-btn lp-btn-primary" onClick={() => void verify()} disabled={!csv || !report || busy}>
          {busy ? <Loader2 size={16} className="spin" aria-hidden /> : <FileSearch size={16} aria-hidden />} Reproduce
        </button>
      </div>
      {error && (
        <div className="az-error" role="alert" style={{ marginTop: 14 }}>
          {error}
        </div>
      )}
      {result && (
        <div className={`az-repro-result ${result.verified ? "ok" : "bad"}`} role="status">
          <p className="az-repro-summary">
            {result.verified ? <CheckCircle2 size={18} aria-hidden /> : <XCircle size={18} aria-hidden />}
            <span>{result.summary}</span>
          </p>
          <p className="az-note" style={{ marginTop: 4 }}>
            SHA-256 {result.sha256_ok ? "matches" : "differs"}: report{" "}
            <code className="az-ref">{(result.sha256_expected ?? "none").slice(0, 16)}…</code> · file{" "}
            <code className="az-ref">{result.sha256_actual.slice(0, 16)}…</code> · {result.n_ok}/{result.n_checks} checks
          </p>
          <div className="az-table-wrap" role="region" aria-label="Reproduction checks" tabIndex={0}>
            <table className="az-table">
              <thead>
                <tr>
                  <th>Check</th>
                  <th>In the report</th>
                  <th>Re-run</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {result.checks.map((c) => (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td className="num">{show(c.expected)}</td>
                    <td className="num">{show(c.actual)}</td>
                    <td>
                      <span className={`tone-pill ${c.ok ? "tone-good" : "tone-bad"}`}>{c.ok ? "match" : "differs"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
