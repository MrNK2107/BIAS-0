import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, Briefcase, Download, FileText, GitCommitHorizontal, Landmark, Scale, Loader2, Play, Printer, Upload } from "lucide-react";
import { api, formApi } from "../api/client";
import Hallmark from "../components/brand/Hallmark";
import CiTrack from "../components/brand/CiTrack";
import DriftChart from "../components/assurance/DriftChart";
import TradeoffPanel from "../components/assurance/TradeoffPanel";
import ReproducePanel from "../components/assurance/ReproducePanel";
import {
  CONTROL_LABEL,
  buildAuditForm,
  findingCounts,
  intervalText,
  mappingFromInspection,
  mappingProblems,
  num,
  pct,
  reportFilename,
  toneOf,
  tradeoffAttributes,
  biggestChange,
  decisionLogTemplate,
  driftLabel,
  driftTone,
  groupActions,
  linkFor,
  type ActionPriority,
  type Inspection,
  type SampleInfo,
  type LedgerHistory,
  type Mapping,
  type OutcomeAudit,
  type Tone,
} from "../utils/assurance";
import "../styles/brand.css";

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`tone-pill tone-${tone}`}>{children}</span>;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// ── Upload + mapping ────────────────────────────────────────────────────────

function UploadPanel({
  onFile,
  busy,
}: {
  onFile: (f: File) => void;
  busy: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <section
      className={`az-drop${dragging ? " dragging" : ""}`}
      aria-label="Upload a decision log"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      <div>
        <span className="mono-label">Your data · decision log</span>
        <h2>Drop a CSV of decisions here</h2>
        <p>
          One row per decision, with the decision and the group columns. Outcome, score and timestamp columns are
          optional and unlock error-rate, scoring-rate and drift analysis. A version column lets BIAS-0 link drift to
          a release. Up to 50 MB.
        </p>
      </div>
      <div className="az-drop-actions">
        <button
          type="button"
          className="lp-btn lp-btn-ghost"
          onClick={() => saveBlob(new Blob([decisionLogTemplate()], { type: "text/csv" }), "bias0-decision-log-template.csv")}
        >
          <Download size={16} aria-hidden /> Template
        </button>
        <label className="lp-btn az-file-btn">
          <Upload size={16} aria-hidden /> Choose file
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Choose a decision log CSV"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </section>
  );
}

// Shown when /assurance/samples cannot be reached; mirrors backend/utils/samples.py.
const FALLBACK_SAMPLES: Pick<SampleInfo, "id" | "title" | "sector" | "rows" | "window" | "story" | "frameworks">[] = [
  {
    id: "lending",
    title: "Personal-loan underwriting",
    sector: "Lending",
    rows: 6000,
    window: "Nov 2025 - Oct 2026",
    story: "A model update in May 2026 penalises rural and ST applicants.",
    frameworks: ["RBI FREE-AI", "EU AI Act Annex III"],
  },
  {
    id: "hiring",
    title: "AI resume screener",
    sector: "Hiring",
    rows: 4000,
    window: "Jan - Oct 2026",
    story: "Screener s1.5 adds an employment-gap feature in July 2026.",
    frameworks: ["NYC LL144", "EU AI Act Annex III"],
  },
];

function SampleGallery({ samples, onPick, busy }: {
  samples: SampleInfo[] | null;
  onPick: (id: string) => void;
  busy: boolean;
}) {
  const list = samples ?? FALLBACK_SAMPLES;
  return (
    <section className="az-samples" aria-labelledby="samples-title">
      <div className="az-samples-head">
        <span className="mono-label">No data to hand? · 30-second demo</span>
        <h2 id="samples-title">Run a bundled audit</h2>
        <p>Synthetic decision logs with a planted problem for BIAS-0 to find. No real person is in either file.</p>
      </div>
      <div className="az-sample-grid">
        {list.map((s) => {
          const Icon = s.sector === "Hiring" ? Briefcase : Landmark;
          return (
            <article className="az-sample" key={s.id}>
              <header>
                <span className="az-sample-icon" aria-hidden>
                  <Icon size={18} />
                </span>
                <span className="mono-label">{s.sector}</span>
                <span className="az-sample-meta">
                  {s.rows.toLocaleString()} rows · {s.window}
                </span>
              </header>
              <h3>{s.title}</h3>
              <p>{s.story}</p>
              <ul className="az-sample-tags" aria-label="Frameworks">
                {s.frameworks.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <button
                type="button"
                className="lp-btn lp-btn-primary"
                onClick={() => onPick(s.id)}
                disabled={busy}
                aria-label={`Run the ${s.sector.toLowerCase()} sample audit`}
              >
                Run this audit <ArrowRight size={16} aria-hidden />
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const PRIORITY_LABEL: Record<ActionPriority, string> = { now: "Act now", next: "Next", record: "For the record" };

function ActionPlanPanel({ audit }: { audit: OutcomeAudit }) {
  const groups = groupActions(audit.action_plan);
  if (!groups.length) return null;
  return (
    <section className="az-panel az-plan" aria-labelledby="plan-title">
      <span className="mono-label">For the reviewer · plain language</span>
      <h2 id="plan-title">What to do next</h2>
      <p className="az-panel-sub">
        Follow-ups derived from the findings below, in order. Owners are roles. The same list opens the downloadable
        report.
      </p>
      <div className="az-plan-cols">
        {groups.map((g) => (
          <div key={g.priority} className={`az-plan-col az-plan-${g.priority}`}>
            <h3>
              {PRIORITY_LABEL[g.priority]} <small>{g.items.length}</small>
            </h3>
            <ol>
              {g.items.map((a) => (
                <li key={a.title}>
                  <strong>{a.title}</strong>
                  <span className="az-plan-owner">{a.owner}</span>
                  <p>{a.detail}</p>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}

function MappingPanel({
  inspection,
  mapping,
  setMapping,
  onRun,
  running,
}: {
  inspection: Inspection;
  mapping: Mapping;
  setMapping: (m: Mapping) => void;
  onRun: () => void;
  running: boolean;
}) {
  const cols = inspection.columns;
  const problems = mappingProblems(mapping);
  const groupCandidates = cols.filter(
    (c) => c.n_unique >= 2 && c.n_unique <= 50 && c.name !== mapping.decision_col && c.name !== mapping.outcome_col,
  );
  const decisionInfo = cols.find((c) => c.name === mapping.decision_col);
  const set = <K extends keyof Mapping>(k: K, v: Mapping[K]) => setMapping({ ...mapping, [k]: v });

  const select = (key: "decision_col" | "outcome_col" | "score_col" | "time_col", label: string, hint: string, optional = true) => (
    <label className="az-field">
      {label}
      <select value={mapping[key]} onChange={(e) => set(key, e.target.value)}>
        {optional && <option value="">Not supplied</option>}
        {!optional && <option value="">Choose…</option>}
        {cols.map((c) => (
          <option key={c.name} value={c.name}>
            {c.name}
          </option>
        ))}
      </select>
      <span className="az-field-hint">{hint}</span>
    </label>
  );

  return (
    <section className="az-panel" aria-labelledby="map-title">
      <span className="mono-label">Step 2 · Map columns</span>
      <h2 id="map-title">{inspection.filename}</h2>
      <p className="az-panel-sub">
        {inspection.n_rows.toLocaleString()} rows · SHA-256 <code className="az-ref">{inspection.sha256.slice(0, 16)}…</code> ·
        suggestions are pre-filled; check them.
      </p>
      <div className="az-map">
        {select("decision_col", "Decision", "The system's decision, e.g. approved / declined.", false)}
        {select("outcome_col", "Outcome (optional)", "Ground truth, e.g. repaid. Enables error-rate gaps.")}
        {select("time_col", "Timestamp (optional)", "Enables fairness drift by period.")}
        {select("score_col", "Score (optional)", "Model score. Enables LL144 scoring rates.")}
        <label className="az-field">
          Favourable decision
          <select value={mapping.positive_decision} onChange={(e) => set("positive_decision", e.target.value)}>
            <option value="">Infer from wording</option>
            {(decisionInfo?.examples ?? []).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <span className="az-field-hint">Which value counts as selected.</span>
        </label>
        <label className="az-field">
          Drift period
          <select value={mapping.period} onChange={(e) => set("period", e.target.value as Mapping["period"])}>
            <option value="auto">Automatic</option>
            <option value="W">Week</option>
            <option value="M">Month</option>
            <option value="Q">Quarter</option>
          </select>
          <span className="az-field-hint">Automatic picks from the date span.</span>
        </label>
      </div>

      <div className="az-field" style={{ marginTop: 18 }}>
        Protected attributes ({mapping.group_cols.length} selected)
        <div className="az-chips" role="group" aria-label="Protected attributes">
          {groupCandidates.map((c) => {
            const on = mapping.group_cols.includes(c.name);
            return (
              <button
                type="button"
                key={c.name}
                className="az-chip"
                aria-pressed={on}
                onClick={() =>
                  set("group_cols", on ? mapping.group_cols.filter((g) => g !== c.name) : [...mapping.group_cols, c.name])
                }
              >
                {c.name} <small>{c.n_unique}</small>
              </button>
            );
          })}
        </div>
        <span className="az-field-hint">
          Pairs of the first four become intersections. Missing values form an unknown category, which is excluded and
          counted.
        </span>
      </div>

      <div className="az-map" style={{ marginTop: 18 }}>
        <label className="az-field">
          System name (for the report)
          <input value={mapping.system_name} maxLength={200} placeholder="e.g. Personal-loan underwriting" onChange={(e) => set("system_name", e.target.value)} />
        </label>
        <label className="az-field">
          Organisation (for the report)
          <input value={mapping.organisation} maxLength={200} placeholder="e.g. Example Finance Pvt Ltd" onChange={(e) => set("organisation", e.target.value)} />
        </label>
        <label className="az-field">
          Materiality threshold
          <input
            type="number"
            min={0.5}
            max={1}
            step={0.05}
            value={mapping.threshold}
            onChange={(e) => set("threshold", Number(e.target.value))}
          />
          <span className="az-field-hint">0.80 is the EEOC four-fifths heuristic, not a legal pass mark.</span>
        </label>
      </div>

      <div className="az-actions">
        <button type="button" className="lp-btn lp-btn-primary" onClick={onRun} disabled={running || problems.length > 0}>
          {running ? <Loader2 size={16} className="spin" aria-hidden /> : <Play size={16} aria-hidden />}
          {running ? "Auditing…" : "Run outcome audit"}
        </button>
        {problems.length > 0 && <span className="az-problems">{problems[0]}</span>}
      </div>
    </section>
  );
}

// ── Results ─────────────────────────────────────────────────────────────────

function VerdictCard({ audit, onReport, onOpen, onJson, onSummary, reporting }: {
  audit: OutcomeAudit;
  onReport: () => void;
  onOpen: () => void;
  onJson: () => void;
  onSummary: () => void;
  reporting: boolean;
}) {
  const v = audit.verdict;
  const counts = findingCounts(audit.findings);
  const window =
    audit.drift && audit.drift.periods.length
      ? `${audit.drift.periods[0].period} → ${audit.drift.periods[audit.drift.periods.length - 1].period}`
      : "no time column";
  return (
    <section className="az-verdict" aria-labelledby="verdict-title">
      <Hallmark mark={v.grade} tone={toneOf(v.status)} size={128} label={`Grade ${v.grade}`} />
      <div>
        <span className="mono-label">Verdict</span>
        <h2 id="verdict-title">{v.label}</h2>
        <p>{v.rule}</p>
        <div className="az-verdict-meta">
          <span><b>{audit.n_decisions.toLocaleString()}</b> decisions</span>
          <span>selection rate <b>{pct(audit.overall_selection_rate)}</b></span>
          <span>window <b>{window}</b></span>
          <span>{audit.config.n_boot} bootstrap resamples · seed {audit.config.seed}</span>
          {audit.provenance && <span>sha256 <b>{audit.provenance.sha256.slice(0, 12)}…</b></span>}
          {audit.ledger && (
            <span>
              ledger entry <b>#{audit.ledger.seq}</b> · <b>{audit.ledger.entry_sha256.slice(0, 12)}…</b>
            </span>
          )}
        </div>
        <LedgerDelta audit={audit} />
      </div>
      <div className="az-verdict-side">
        <div className="az-counts" aria-label="Findings by severity">
          <Pill tone="bad">{counts.disparity} disparity</Pill>
          <Pill tone="warn">{counts.inconclusive} inconclusive</Pill>
          <Pill tone="good">{counts.no_material_disparity} clear</Pill>
        </div>
        <div className="az-drop-actions">
          <button type="button" className="lp-btn lp-btn-primary" onClick={onReport} disabled={reporting}>
            {reporting ? <Loader2 size={16} className="spin" aria-hidden /> : <FileText size={16} aria-hidden />} Download report
          </button>
          <button type="button" className="lp-btn" onClick={onOpen} disabled={reporting}>
            <Printer size={16} aria-hidden /> Open to print
          </button>
          <button type="button" className="lp-btn" onClick={onJson}>
            <Download size={16} aria-hidden /> JSON
          </button>
          <button
            type="button"
            className="lp-btn"
            onClick={onSummary}
            disabled={reporting}
            title="The public summary an NYC employer posts for an automated employment decision tool (6 RCNY 5-303)"
          >
            <Scale size={16} aria-hidden /> LL144 summary
          </button>
        </div>
      </div>
    </section>
  );
}

function LedgerDelta({ audit }: { audit: OutcomeAudit }) {
  const cmp = audit.ledger?.compared_to_previous;
  const best = biggestChange(cmp);
  if (!cmp || !best) return null;
  return (
    <p className="az-note" style={{ marginTop: 10 }}>
      Since audit #{cmp.previous_seq} of this system ({cmp.previous_recorded_at.slice(0, 10)}
      {cmp.same_input ? ", same input file" : ""}): grade {cmp.grade_from} → {cmp.grade_to}; largest move{" "}
      <b>{best.name}</b> {num(best.from)} → {num(best.to)} ({best.delta > 0 ? "+" : ""}
      {num(best.delta)}).
    </p>
  );
}

function HistoryPanel({ history }: { history: LedgerHistory | null }) {
  if (!history || history.entries.length === 0) return null;
  const { chain } = history;
  return (
    <section className="az-panel" aria-labelledby="history-title">
      <div className="az-head" style={{ alignItems: "center" }}>
        <div>
          <span className="mono-label">Audit ledger · hash-chained</span>
          <h2 id="history-title">Audit history</h2>
          <p className="az-panel-sub" style={{ marginBottom: 0 }}>
            Every recorded audit is a summary entry linked to the previous one by SHA-256. Editing or deleting a past
            entry breaks the chain. Head <code className="az-ref">{chain.head_sha256.slice(0, 16)}…</code>: anchor it
            in a ticket or email to make the history checkable later.
          </p>
        </div>
        <Pill tone={chain.ok ? "good" : "bad"}>
          {chain.ok ? `Chain verified · ${chain.n_entries} entries` : `Chain broken · ${chain.problems.length} problem(s)`}
        </Pill>
      </div>
      {!chain.ok && (
        <ul className="az-warnings" style={{ margin: "12px 0" }}>
          {chain.problems.map((p) => (
            <li key={p} style={{ borderLeftColor: "var(--verdict-bad)" }}>{p}</li>
          ))}
        </ul>
      )}
      <div className="az-table-wrap" tabIndex={0} role="region" aria-label="Audit history" style={{ marginTop: 14 }}>
        <table className="az-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Recorded (UTC)</th>
              <th>System</th>
              <th>Input</th>
              <th>Grade</th>
              <th>Verdict</th>
              <th>Worst ratio</th>
              <th>Drift alerts</th>
              <th>Entry hash</th>
            </tr>
          </thead>
          <tbody>
            {history.entries.map((e) => (
              <tr key={e.seq}>
                <td className="num">{e.seq}</td>
                <td className="num">{e.recorded_at.replace("T", " ").slice(0, 16)}</td>
                <td>{e.system_name ?? "–"}</td>
                <td>
                  {e.input.filename ?? "–"}{" "}
                  <span className="az-ref">{e.input.sha256?.slice(0, 8)}</span>
                </td>
                <td className="num" style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>{e.verdict.grade}</td>
                <td>
                  <Pill tone={toneOf(e.verdict.status)}>{e.verdict.status.replace(/_/g, " ")}</Pill>
                </td>
                <td className="num">{num(e.verdict.worst_impact_ratio)}</td>
                <td className="num">{e.drift_alerts}</td>
                <td className="az-ref">{e.entry_sha256.slice(0, 10)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ImpactPanel({ audit }: { audit: OutcomeAudit }) {
  const attrs = Object.keys(audit.attributes);
  const [active, setActive] = useState(attrs[0]);
  const [rateType, setRateType] = useState<"selection" | "scoring">("selection");
  const block = audit.attributes[active];
  const tables = rateType === "scoring" && audit.ll144.scoring ? audit.ll144.scoring : audit.ll144.selection;
  const table = tables.attributes[active];
  if (!block || !table) return null;
  const di = block.gaps.disparate_impact_ratio;
  return (
    <section className="az-panel" aria-labelledby="impact-title">
      <span className="mono-label">NYC LL144 5-301 · selection rates and impact ratios</span>
      <h2 id="impact-title">By attribute</h2>
      <div className="az-tabs" role="group" aria-label="Attribute">
        {attrs.map((a) => (
          <button type="button" key={a} className="az-chip" aria-pressed={a === active} onClick={() => setActive(a)}>
            {a} <Pill tone={toneOf(audit.attributes[a].verdict.status)}>{audit.attributes[a].verdict.label}</Pill>
          </button>
        ))}
      </div>
      <p className="az-panel-sub">
        {block.verdict.reason} Selection-rate gap {intervalText(block.gaps.demographic_parity_difference)}.
      </p>
      {audit.ll144.scoring && (
        <div className="az-tabs" role="group" aria-label="Rate type">
          <button type="button" className="az-chip" aria-pressed={rateType === "selection"} onClick={() => setRateType("selection")}>
            Selection rate (5-301(b))
          </button>
          <button type="button" className="az-chip" aria-pressed={rateType === "scoring"} onClick={() => setRateType("scoring")}>
            Scoring rate (5-301(c))
          </button>
        </div>
      )}
      <div className="az-table-wrap" tabIndex={0} role="region" aria-label={`Impact ratios for ${active}`}>
        <table className="az-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>n</th>
              <th>{rateType === "scoring" ? "Scoring rate" : "Selection rate"}</th>
              <th>95% CI (Wilson)</th>
              <th style={{ minWidth: 140 }}>Interval</th>
              <th>Impact ratio</th>
            </tr>
          </thead>
          <tbody>
            {table.categories.map((r) => {
              const small = r.reliable === false;
              return (
                <tr key={r.category} className={small ? "small-group" : undefined}>
                  <td>
                    {r.category} {small && <Pill tone="muted">small group</Pill>}
                  </td>
                  <td className="num">{r.n ?? ""}</td>
                  <td className="num">{pct(r.rate)}</td>
                  <td className="num">{r.rate_ci ? `${pct(r.rate_ci[0])} – ${pct(r.rate_ci[1])}` : "–"}</td>
                  <td>{r.rate_ci ? <CiTrack lo={r.rate_ci[0]} hi={r.rate_ci[1]} point={r.rate} /> : null}</td>
                  <td className="num">{num(r.impact_ratio)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="az-note">
        Impact ratio over reliable groups: {intervalText(di)}. Most selected: {table.most_selected ?? "n/a"}.
        {table.unknown_count > 0 && ` ${table.unknown_count} unknown-category decisions excluded and counted.`} LL144
        sets no pass mark; the verdict uses the materiality threshold {num(audit.threshold)}.
      </p>
      {block.error_rates && (
        <p className="az-note">
          Against the outcome ({block.error_rates.n_rows.toLocaleString()} rows): equal-opportunity gap{" "}
          {intervalText(block.error_rates.gaps.equal_opportunity_difference)}, FPR gap{" "}
          {intervalText(block.error_rates.gaps.fpr_gap)}.
        </p>
      )}
    </section>
  );
}

function IntersectionPanel({ audit }: { audit: OutcomeAudit }) {
  const rows = Object.entries(audit.intersections);
  if (!rows.length) return null;
  return (
    <section className="az-panel" aria-labelledby="inter-title">
      <span className="mono-label">Intersectional analysis</span>
      <h2 id="inter-title">Where single attributes hide the gap</h2>
      <p className="az-panel-sub">
        Pairs analysed as one attribute. Cells under {audit.config.min_group_size} decisions are suppressed (shown in
        the count, never ranked).
      </p>
      <div className="az-table-wrap" tabIndex={0} role="region" aria-label="Intersections">
        <table className="az-table">
          <thead>
            <tr>
              <th>Intersection</th>
              <th>Cells</th>
              <th>Suppressed</th>
              <th style={{ minWidth: 140 }}>Impact ratio</th>
              <th>95% CI</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, b]) => {
              const di = b.gaps.disparate_impact_ratio;
              return (
                <tr key={name}>
                  <td>{name}</td>
                  <td className="num">{b.n_reliable_groups}</td>
                  <td className="num">{b.n_small_groups}</td>
                  <td>
                    <CiTrack lo={di.ci_lower} hi={di.ci_upper} point={di.point} threshold={audit.threshold} min={0.3} max={1} />
                  </td>
                  <td className="num">{di.point === null ? "n/a" : `${num(di.point)} (${num(di.ci_lower)}–${num(di.ci_upper)})`}</td>
                  <td>
                    <Pill tone={toneOf(b.verdict.status)}>{b.verdict.label}</Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DriftPanel({ audit }: { audit: OutcomeAudit }) {
  const d = audit.drift;
  if (!d || !d.periods.length) {
    return (
      <section className="az-panel">
        <span className="mono-label">Fairness drift</span>
        <h2>No timestamp column</h2>
        <p className="az-panel-sub">Map a date column to see each attribute's impact ratio by period, with breach alerts.</p>
      </section>
    );
  }
  return (
    <section className="az-panel" aria-labelledby="drift-title">
      <span className="mono-label">Fairness drift · EU AI Act Art. 72 post-market monitoring</span>
      <h2 id="drift-title">Impact ratio by {d.period_label}</h2>
      <p className="az-panel-sub">
        Band: 95% bootstrap interval ({d.n_boot} resamples per point). Red dashes: threshold {num(d.threshold)}. Breach
        means the whole band is below it; watch means only the point is. Gaps mark periods with too few decisions.
      </p>
      {d.alerts.length > 0 && (
        <ul className="az-warnings" style={{ marginBottom: 16 }}>
          {d.alerts.map((a) => (
            <li key={a.attribute + a.period} style={{ borderLeftColor: a.level === "breach" ? "var(--verdict-bad)" : undefined }}>
              {a.message}
            </li>
          ))}
        </ul>
      )}
      <div className="az-drift-grid">
        {Object.entries(d.series).map(([attr, s]) => {
          const latest = s.points[s.points.length - 1];
          const link = linkFor(audit.change_points, attr);
          return (
            <article className="az-drift-card" key={attr}>
              <header>
                <h3>{attr}</h3>
                <Pill tone={driftTone(s.breach_start, latest.status)}>
                  {driftLabel(s.breach_start, latest.status)}
                </Pill>
              </header>
              <DriftChart
                series={s}
                threshold={d.threshold}
                label={`${attr} impact ratio by ${d.period_label}`}
                marker={link ? { period: link.period, label: link.to } : undefined}
              />
              {link && (
                <p className="az-change">
                  <GitCommitHorizontal size={14} aria-hidden />
                  <span>
                    <b>{link.column}</b> {link.from} → {link.to} in {link.period}: impact ratio{" "}
                    <b>{num(link.impact_ratio_before)}</b> → <b className="bad">{num(link.impact_ratio_after)}</b>.
                    Same time, not proven cause.
                  </span>
                </p>
              )}
              <footer>
                trend {s.trend_per_period === null ? "n/a" : `${s.trend_per_period > 0 ? "+" : ""}${s.trend_per_period.toFixed(3)}`}/
                {d.period_label} · breaches {s.breach_periods} · insufficient {s.insufficient_periods}
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function FrameworkPanel({ audit }: { audit: OutcomeAudit }) {
  const fw = audit.frameworks;
  const keys = Object.keys(fw.summary);
  const [active, setActive] = useState(keys[0]);
  const controls = fw.controls.filter((c) => c.framework === active);
  const meta = fw.catalogue[active];
  return (
    <section className="az-panel az-fw" aria-labelledby="fw-title">
      <div>
        <span className="mono-label">Regulatory mapping</span>
        <h2 id="fw-title">What this audit evidences, and what it doesn't</h2>
        <p className="az-panel-sub">{fw.disclaimer}</p>
      </div>
      <div className="az-fw-summary" role="group" aria-label="Framework">
        {keys.map((k) => {
          const s = fw.summary[k];
          return (
            <button type="button" key={k} className="az-fw-card" aria-pressed={k === active} onClick={() => setActive(k)}>
              <h3>{s.name}</h3>
              <div className="az-fw-bar" aria-hidden>
                <span style={{ width: `${(s.evidenced / s.total) * 100}%` }} />
                <span style={{ width: `${(s.partial / s.total) * 100}%` }} />
                <span style={{ width: `${(s.not_evidenced / s.total) * 100}%` }} />
              </div>
              <small>
                {s.evidenced} evidenced · {s.partial} partial · {s.not_evidenced} not evidenced
              </small>
            </button>
          );
        })}
      </div>
      {meta && (
        <p className="az-note" style={{ marginTop: 0 }}>
          {meta.scope} {meta.status_note}
        </p>
      )}
      <div className="az-table-wrap" tabIndex={0} role="region" aria-label="Controls">
        <table className="az-table">
          <thead>
            <tr>
              <th>Ref</th>
              <th>Requirement</th>
              <th>Status</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {controls.map((c) => (
              <tr key={c.ref}>
                <td className="az-ref">{c.ref}</td>
                <td>{c.requirement}</td>
                <td>
                  <Pill tone={toneOf(c.status)}>{CONTROL_LABEL[c.status]}</Pill>
                </td>
                <td style={{ color: "var(--text-secondary)" }}>{c.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function Assurance() {
  const [params] = useSearchParams();
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [audit, setAudit] = useState<OutcomeAudit | null>(null);
  const [busy, setBusy] = useState<"inspect" | "run" | "report" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<LedgerHistory | null>(null);
  const [auditMapping, setAuditMapping] = useState<Mapping | null>(null);
  const [samples, setSamples] = useState<SampleInfo[] | null>(null);
  const autoRan = useRef(false);
  const resultRef = useRef<HTMLDivElement | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await api.get<LedgerHistory>("/assurance/history");
      setHistory(res.data);
    } catch {
      // History is a convenience; the audit itself does not depend on it.
    }
  }, []);

  useEffect(() => {
    void loadHistory();
    api
      .get<{ samples: SampleInfo[] }>("/assurance/samples")
      .then((res) => setSamples(res.data.samples))
      .catch(() => setSamples(null));
  }, [loadHistory]);

  const run = useCallback(async (f: File, m: Mapping) => {
    setBusy("run");
    setError(null);
    try {
      const res = await formApi.post<OutcomeAudit>("/assurance/outcome-audit", buildAuditForm(f, f.name, m), {
        timeout: 180_000,
      });
      setAudit(res.data);
      setAuditMapping(m);
      void loadHistory();
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }, [loadHistory]);

  const inspect = useCallback(async (f: File, preset?: Partial<Mapping>, autoRun = false) => {
    setBusy("inspect");
    setError(null);
    setAudit(null);
    setFile(f);
    try {
      const fd = new FormData();
      fd.append("file", f, f.name);
      const res = await formApi.post<Inspection>("/assurance/inspect", fd);
      const m = { ...mappingFromInspection(res.data), ...preset };
      setInspection(res.data);
      setMapping(m);
      setBusy(null);
      if (autoRun && mappingProblems(m).length === 0) await run(f, m);
    } catch (err) {
      setError(errorText(err));
      setBusy(null);
    }
  }, [run]);

  const loadSample = useCallback(async (id = "lending") => {
    setBusy("inspect");
    setError(null);
    try {
      const res = await api.get<string>("/assurance/sample", { params: { name: id }, responseType: "text" });
      const info = samples?.find((s) => s.id === id);
      const fallback = id === "hiring"
        ? { filename: "sample_hiring_screen.csv", system_name: "TalentLens resume screener (s1.x)", organisation: "Example Staffing, New York (synthetic)" }
        : { filename: "sample_lending_decisions.csv", system_name: "Personal-loan underwriting (PL-Score v2.x)", organisation: "Example Finance (synthetic)" };
      const f = new File([res.data], info?.filename ?? fallback.filename, { type: "text/csv" });
      await inspect(
        f,
        { system_name: info?.system_name ?? fallback.system_name, organisation: info?.organisation ?? fallback.organisation },
        true,
      );
    } catch (err) {
      setError(errorText(err));
      setBusy(null);
    }
  }, [inspect, samples]);

  useEffect(() => {
    const wanted = params.get("sample");
    if (wanted && !autoRan.current) {
      autoRan.current = true;
      void loadSample(wanted === "hiring" ? "hiring" : "lending");
    }
  }, [params, loadSample]);

  const fetchReport = useCallback(async (path = "/assurance/outcome-audit/report"): Promise<Blob | null> => {
    if (!file || !mapping) return null;
    setBusy("report");
    setError(null);
    try {
      const res = await formApi.post<string>(path, buildAuditForm(file, file.name, mapping, true), {
        responseType: "text",
        timeout: 180_000,
      });
      return new Blob([res.data], { type: "text/html" });
    } catch (err) {
      setError(errorText(err));
      return null;
    } finally {
      setBusy(null);
    }
  }, [file, mapping]);

  const downloadReport = useCallback(async () => {
    const blob = await fetchReport();
    if (blob && audit) saveBlob(blob, reportFilename(audit));
  }, [fetchReport, audit]);

  const openReport = useCallback(async (path?: string) => {
    const tab = window.open("", "_blank");
    const blob = await fetchReport(path);
    if (!blob) {
      tab?.close();
      return;
    }
    const url = URL.createObjectURL(blob);
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, [fetchReport]);

  const downloadJson = useCallback(() => {
    if (!audit) return;
    saveBlob(
      new Blob([JSON.stringify(audit, null, 2)], { type: "application/json" }),
      reportFilename(audit).replace(/\.html$/, ".json"),
    );
  }, [audit]);

  const warnings = useMemo(() => audit?.warnings ?? [], [audit]);

  return (
    <div className="az">
      <header className="az-head">
        <div>
          <span className="mono-label">Outcome audit · Mode A · no model access</span>
          <h1>Audit the decisions you actually made</h1>
          <p>
            Upload a decision log from your loan engine, ATS or claims system. BIAS-0 measures selection-rate disparity
            with confidence intervals, guards small groups, tracks drift over time and maps the evidence to the EU AI
            Act, NYC LL144 and RBI FREE-AI.
          </p>
        </div>
      </header>

      <UploadPanel onFile={(f) => void inspect(f)} busy={busy !== null} />
      {!audit && !inspection && (
        <SampleGallery samples={samples} onPick={(id) => void loadSample(id)} busy={busy !== null} />
      )}

      {busy === "inspect" && (
        <p className="az-panel-sub" role="status">
          <Loader2 size={14} className="spin" aria-hidden /> Reading columns…
        </p>
      )}
      {error && (
        <div className="az-error" role="alert">
          {error}
        </div>
      )}

      {inspection && mapping && file && (
        <MappingPanel
          inspection={inspection}
          mapping={mapping}
          setMapping={setMapping}
          onRun={() => void run(file, mapping)}
          running={busy === "run"}
        />
      )}

      {busy === "run" && (
        <p className="az-panel-sub" role="status">
          <Loader2 size={14} className="spin" aria-hidden /> Bootstrapping intervals and drift…
        </p>
      )}

      {audit && (
        <div className="az" ref={resultRef} aria-live="polite" style={{ scrollMarginTop: 96 }}>
          <VerdictCard
            audit={audit}
            onReport={() => void downloadReport()}
            onOpen={() => void openReport()}
            onSummary={() => void openReport("/assurance/ll144-summary")}
            onJson={downloadJson}
            reporting={busy === "report"}
          />
          <ActionPlanPanel audit={audit} />
          <div className="az-grid-2">
            <section className="az-panel" aria-labelledby="findings-title">
              <span className="mono-label">Key findings</span>
              <h2 id="findings-title">Most severe first</h2>
              <ul className="az-findings">
                {audit.findings.map((f, i) => (
                  <li key={`${f.scope}-${f.name}-${i}`}>
                    <div className="row">
                      <Pill tone={toneOf(f.status)}>{f.label}</Pill>
                      <strong>{f.name}</strong>
                    </div>
                    <p>{f.text}</p>
                  </li>
                ))}
              </ul>
            </section>
            <section className="az-panel" aria-labelledby="warn-title">
              <span className="mono-label">Reliability</span>
              <h2 id="warn-title">What to keep in mind</h2>
              <ul className="az-warnings">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
                <li>
                  The verdict uses the impact-ratio interval over groups with at least {audit.config.min_group_size}{" "}
                  decisions. A disparity is a measured gap, not proof of its cause or of unlawful discrimination.
                </li>
                {audit.outcome_coverage === null && (
                  <li>No outcome column: error-rate fairness (equal opportunity, FPR) was not assessed.</li>
                )}
              </ul>
            </section>
          </div>
          <ImpactPanel audit={audit} />
          <IntersectionPanel audit={audit} />
          <DriftPanel audit={audit} />
          {file && mapping && tradeoffAttributes(audit).length > 0 && (
            <TradeoffPanel
              key={audit.provenance?.sha256 ?? "tradeoff"}
              file={file}
              mapping={auditMapping ?? mapping}
              attributes={tradeoffAttributes(audit)}
              audit={audit}
            />
          )}
          <FrameworkPanel audit={audit} />
        </div>
      )}

      <HistoryPanel history={history} />
      <ReproducePanel />
    </div>
  );
}
