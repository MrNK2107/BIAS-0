import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, Loader2, Play, Upload, Users } from "lucide-react";
import { api, formApi } from "../api/client";
import { guessPairedColumns, parseCsvHead as parseHead, pct, toneOf, type PairedColumns as Cols, type PairedResult } from "../utils/assurance";
import ProbeGenerator from "../components/ProbeGenerator";
import "../styles/brand.css";

function errorText(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } }; message?: string };
  const d = e.response?.data?.detail;
  return typeof d === "string" ? d : e.message ?? "Something went wrong.";
}

function Bar({ value, label, tone }: { value: number; label: string; tone: "bad" | "good" | "muted" }) {
  return (
    <div className="pt-bar">
      <div className="pt-bar-head">
        <span>{label}</span>
        <b>{pct(value)}</b>
      </div>
      <div className="pt-bar-track">
        <span className={`pt-bar-fill ${tone}`} style={{ width: `${Math.max(2, value * 100)}%` }} />
      </div>
    </div>
  );
}

function Result({ r }: { r: PairedResult }) {
  const t = r.table;
  const tone = toneOf(r.verdict.status);
  const loser = r.favoured === r.reference ? r.other : r.reference;
  return (
    <div className="az" aria-live="polite">
      <section className="az-verdict pt-verdict" aria-labelledby="pt-verdict-title">
        <div className={`pt-flip tone-${tone}`} aria-hidden>
          <span>{pct(r.flip_rate ?? 0)}</span>
          <small>flipped</small>
        </div>
        <div>
          <span className="mono-label">Paired test · {r.n_pairs.toLocaleString()} matched pairs</span>
          <h2 id="pt-verdict-title">{r.verdict.label}</h2>
          <p>{r.verdict.reason}</p>
          <div className="az-verdict-meta">
            <span>McNemar exact p <b>{r.mcnemar_p < 0.0001 ? "< 0.0001" : r.mcnemar_p.toFixed(4)}</b></span>
            <span>flip rate <b>{pct(r.flip_rate ?? 0)}</b> (95% CI {pct(r.flip_rate_ci?.[0] ?? 0)}–{pct(r.flip_rate_ci?.[1] ?? 0)})</span>
            <span>{r.config.n_boot} bootstrap resamples · seed {r.config.seed}</span>
            {r.provenance && <span>sha256 <b>{r.provenance.sha256.slice(0, 12)}…</b></span>}
          </div>
        </div>
      </section>

      <div className="az-grid-2">
        <section className="az-panel" aria-labelledby="pt-table-title">
          <span className="mono-label">The 2 × 2 table</span>
          <h2 id="pt-table-title">How each pair was decided</h2>
          <p className="az-panel-sub">Only the pairs decided differently carry evidence. If the signal did not matter they would split evenly.</p>
          <table className="pt-2x2">
            <thead>
              <tr>
                <th />
                <th scope="col">{r.other}: selected</th>
                <th scope="col">{r.other}: not selected</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{r.reference}: selected</th>
                <td>{t.both_selected}</td>
                <td className={r.favoured === r.reference ? "hot" : ""}>{t.only_reference}</td>
              </tr>
              <tr>
                <th scope="row">{r.reference}: not selected</th>
                <td className={r.favoured === r.other ? "hot" : ""}>{t.only_other}</td>
                <td>{t.neither}</td>
              </tr>
            </tbody>
          </table>
          {r.favoured && (
            <p className="az-note">
              Highlighted: pairs where only the <b>{r.favoured}</b> version was shortlisted. The opposite happened{" "}
              {r.favoured === r.reference ? t.only_other : t.only_reference} times.
            </p>
          )}
        </section>
        <section className="az-panel" aria-labelledby="pt-rates-title">
          <span className="mono-label">Same applications, different signal</span>
          <h2 id="pt-rates-title">Selection rate by version</h2>
          <Bar value={r.selection_rate[r.reference]} label={r.reference} tone={r.favoured === r.reference ? "good" : "bad"} />
          <Bar value={r.selection_rate[r.other]} label={r.other} tone={r.favoured === r.other ? "good" : "bad"} />
          <p className="az-panel-sub" style={{ marginTop: 14 }}>
            Difference {r.rate_difference > 0 ? "+" : ""}
            {pct(r.rate_difference)} (95% CI {pct(r.rate_difference_ci[0])} to {pct(r.rate_difference_ci[1])}), {r.reference} minus {r.other}.
            {r.score && (
              <>
                {" "}Mean score difference {r.score.mean_difference > 0 ? "+" : ""}
                {r.score.mean_difference.toFixed(3)} (95% CI {r.score.ci[0].toFixed(3)} to {r.score.ci[1].toFixed(3)}).
              </>
            )}
          </p>
          {r.verdict.status === "disparity" && r.favoured && (
            <p className="az-change" style={{ margin: 0 }}>
              <span>
                The only difference within each pair was the {r.mapping.variant_col.replace(/_/g, " ")}. Treating{" "}
                <b>{loser}</b> applications worse on that basis can amount to disparate treatment. Raise it with the vendor before
                deployment.
              </span>
            </p>
          )}
        </section>
      </div>
      {r.warnings.length > 0 && (
        <ul className="az-warnings">
          {r.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PairedTest() {
  const [params] = useSearchParams();
  const [file, setFile] = useState<File | null>(null);
  const [header, setHeader] = useState<string[]>([]);
  const [cols, setCols] = useState<Cols | null>(null);
  const [result, setResult] = useState<PairedResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  const run = useCallback(async (f: File, c: Cols) => {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", f, f.name);
      for (const [k, v] of Object.entries(c)) if (v) fd.append(k, v);
      const res = await formApi.post<PairedResult>("/assurance/paired", fd, { timeout: 120_000 });
      setResult(res.data);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const load = useCallback(async (f: File, preset?: Partial<Cols>, autoRun = false) => {
    setResult(null);
    setError(null);
    setFile(f);
    const { header: h, rows } = parseHead(await f.text());
    const c = { ...guessPairedColumns(h, rows), ...preset };
    setHeader(h);
    setCols(c);
    if (autoRun) await run(f, c);
  }, [run]);

  const loadSample = useCallback(async () => {
    setBusy(true);
    try {
      const res = await api.get<string>("/assurance/paired/sample", { responseType: "text" });
      await load(new File([res.data], "sample_paired_probes.csv", { type: "text/csv" }), { reference: "male-coded" }, true);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }, [load]);

  useEffect(() => {
    if (params.get("sample") === "1" && !ran.current) {
      ran.current = true;
      void loadSample();
    }
  }, [params, loadSample]);

  const ready = useMemo(() => !!(file && cols && cols.pair_col && cols.variant_col && cols.decision_col), [file, cols]);
  const select = (key: keyof Cols, label: string, optional = false) => (
    <label className="az-field">
      {label}
      <select value={cols?.[key] ?? ""} onChange={(e) => cols && setCols({ ...cols, [key]: e.target.value })}>
        {optional && <option value="">(none)</option>}
        {!optional && !cols?.[key] && <option value="">Choose…</option>}
        {header.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="az">
      <header className="az-head">
        <div>
          <span className="mono-label">Paired test · Mode B · vendor APIs and LLM screeners</span>
          <h1>Same application, one signal changed</h1>
          <p>
            Send a tool pairs of applications that are identical except for one signal, such as a name that reads as
            female or male, and upload what it decided. BIAS-0 builds the probes, counts the pairs decided differently
            and tests whether they lean one way. No model access, and evidence of disparate treatment rather than impact.
          </p>
        </div>
      </header>

      <ProbeGenerator />

      <section className="az-drop" aria-label="Upload paired-probe results">
        <div>
          <span className="mono-label">Step 3 · Upload results · one row per probe</span>
          <h2>Drop a CSV of probe results</h2>
          <p>Columns: a pair id, the signal that differs within the pair (exactly two values), the tool's decision, and optionally its score.</p>
        </div>
        <div className="az-drop-actions">
          <label className="lp-btn az-file-btn">
            <Upload size={16} aria-hidden /> Choose file
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label="Choose a paired-probe CSV"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void load(f);
                e.target.value = "";
              }}
            />
          </label>
          <button type="button" className="lp-btn lp-btn-primary" onClick={() => void loadSample()} disabled={busy}>
            <Users size={16} aria-hidden /> Run the LLM-screener sample <ArrowRight size={16} aria-hidden />
          </button>
        </div>
      </section>

      {cols && file && (
        <section className="az-panel" aria-labelledby="pt-map-title">
          <span className="mono-label">Columns</span>
          <h2 id="pt-map-title">{file.name}</h2>
          <div className="az-map">
            {select("pair_col", "Pair id")}
            {select("variant_col", "Signal that differs")}
            {select("decision_col", "Decision")}
            {select("score_col", "Score", true)}
            <label className="az-field">
              Reference version
              <input
                value={cols.reference}
                placeholder="first value alphabetically"
                onChange={(e) => setCols({ ...cols, reference: e.target.value })}
              />
            </label>
          </div>
          <div className="az-actions">
            <button type="button" className="lp-btn lp-btn-primary" disabled={!ready || busy} onClick={() => file && cols && void run(file, cols)}>
              {busy ? <Loader2 size={16} className="spin" aria-hidden /> : <Play size={16} aria-hidden />} Analyse pairs
            </button>
          </div>
        </section>
      )}

      {error && (
        <div className="az-error" role="alert">
          {error}
        </div>
      )}
      {busy && !result && (
        <p className="az-panel-sub" role="status">
          <Loader2 size={14} className="spin" aria-hidden /> Counting flips and bootstrapping…
        </p>
      )}
      {result && <Result r={result} />}
    </div>
  );
}
