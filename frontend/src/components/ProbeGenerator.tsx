import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { api } from "../api/client";

// Step 1 of a paired test: build the name-swapped probe set. The server only generates the file;
// sending it to a screener happens on the user's machine (python -m cli probes run), so API keys
// never pass through BIAS-0 and the server makes no outbound calls.

const DEFAULTS = [
  { label: "female-coded", names: "Emily, Anne, Jill, Allison, Laurie, Sarah, Meredith, Carrie" },
  { label: "male-coded", names: "Greg, Brendan, Geoffrey, Brett, Todd, Matthew, Neil, Jay" },
];

function splitNames(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function errorText(err: unknown): string {
  const e = err as { response?: { data?: unknown }; message?: string };
  const d = e.response?.data;
  if (typeof d === "string") {
    try {
      const j = JSON.parse(d) as { detail?: unknown };
      if (typeof j.detail === "string") return j.detail;
    } catch {
      /* not JSON */
    }
  }
  return e.message ?? "Something went wrong.";
}

function save(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export default function ProbeGenerator() {
  const [groups, setGroups] = useState(DEFAULTS);
  const [pairs, setPairs] = useState(200);
  const [seed, setSeed] = useState(7);
  const [format, setFormat] = useState<"csv" | "jsonl">("csv");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ file: string; set: string; probes: number } | null>(null);

  const setGroup = (i: number, patch: Partial<(typeof DEFAULTS)[number]>) =>
    setGroups((g) => g.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        n_pairs: pairs,
        seed,
        format,
        groups: groups.map((g) => ({ label: g.label.trim(), names: splitNames(g.names) })),
      };
      const res = await api.post<string>("/assurance/paired/probes", body, { responseType: "text", timeout: 60_000 });
      const set = String(res.headers["x-probe-set"] ?? "probes");
      const file = `bias0-probes-${set}.${format}`;
      save(res.data, file, format === "csv" ? "text/csv" : "application/x-ndjson");
      setMade({ file, set, probes: pairs * 2 });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const file = made?.file ?? `bias0-probes.${format}`;
  return (
    <section className="az-panel pt-gen" aria-labelledby="pt-gen-title">
      <span className="mono-label">Step 1 · Build the probe set</span>
      <h2 id="pt-gen-title">Name-swapped resumes, ready to send</h2>
      <p className="az-panel-sub">
        Each pair is one synthetic resume sent twice, with only the first name changed: one from each list. The
        same settings and seed always give the same file, so anyone can rebuild your probe set.
      </p>
      <div className="pt-gen-groups">
        {groups.map((g, i) => (
          <fieldset key={i} className="pt-gen-group">
            <legend className="mono-label">Version {i === 0 ? "A" : "B"}</legend>
            <label className="az-field">
              Label
              <input value={g.label} onChange={(e) => setGroup(i, { label: e.target.value })} />
            </label>
            <label className="az-field">
              Names (comma or one per line)
              <textarea rows={3} value={g.names} onChange={(e) => setGroup(i, { names: e.target.value })} />
            </label>
          </fieldset>
        ))}
      </div>
      <div className="pt-gen-opts">
        <label className="az-field">
          Pairs
          <input type="number" min={1} max={5000} value={pairs} onChange={(e) => setPairs(Number(e.target.value) || 0)} />
        </label>
        <label className="az-field">
          Seed
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} />
        </label>
        <label className="az-field">
          Format
          <select value={format} onChange={(e) => setFormat(e.target.value as "csv" | "jsonl")}>
            <option value="csv">CSV</option>
            <option value="jsonl">JSONL</option>
          </select>
        </label>
      </div>
      <div className="az-actions">
        <button type="button" className="lp-btn lp-btn-primary" onClick={() => void download()} disabled={busy}>
          {busy ? <Loader2 size={16} className="spin" aria-hidden /> : <Download size={16} aria-hidden />} Download probes
        </button>
        {made && (
          <span className="az-note" role="status" style={{ marginTop: 0 }}>
            {made.probes.toLocaleString()} probes · probe set <b>{made.set}</b> · {made.file}
          </span>
        )}
      </div>
      {error && (
        <div className="az-error" role="alert">
          {error}
        </div>
      )}
      <details className="pt-send">
        <summary>Step 2 · Send them to your screener</summary>
        <p className="az-panel-sub">
          Run this on your own machine, from <code>backend/</code>. It POSTs each probe to your endpoint and writes the
          decisions next to the probes. Start with <code>--dry-run</code> to see the exact requests, or{" "}
          <code>--endpoint mock</code> to rehearse with a built-in offline screener. Your API key stays in your shell.
        </p>
        <pre className="pt-code" tabIndex={0}>
          <code>{`python -m cli probes run ${file} \\
  --endpoint https://screener.example/v1/score \\
  --template '{"resume": "{{resume_text}}", "role": "{{role}}"}' \\
  --decision-path result.shortlisted --score-path result.score \\
  --header "Authorization: Bearer $SCREENER_KEY" \\
  --out results.csv`}</code>
        </pre>
        <p className="az-panel-sub">Then upload <code>results.csv</code> below (step 3), or gate a pipeline with <code>python -m cli paired results.csv</code>.</p>
      </details>
    </section>
  );
}
