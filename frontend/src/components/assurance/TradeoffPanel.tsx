import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formApi } from "../../api/client";
import {
  breachWindow,
  buildTradeoffForm,
  num,
  pct,
  tradeoffSummary,
  type Mapping,
  type OutcomeAudit,
  type Tradeoff,
  type TradeoffPoint,
} from "../../utils/assurance";

function TradeoffTooltip({ active, payload }: { active?: boolean; payload?: { payload: TradeoffPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="az-tooltip">
      <div>
        <b>strength {p.strength.toFixed(1)}</b>
      </div>
      <div>impact ratio {num(p.impact_ratio)} · accuracy {pct(p.accuracy)}</div>
      <div>TPR gap {num(p.tpr_gap)} · selected {pct(p.selection_rate)}</div>
    </div>
  );
}

export default function TradeoffPanel({
  file,
  mapping,
  attributes,
  audit,
}: {
  file: File;
  mapping: Mapping;
  attributes: string[];
  audit: OutcomeAudit;
}) {
  const breach = breachWindow(audit);
  const [attribute, setAttribute] = useState(attributes[0]);
  // Default to the period since the earliest sustained breach: that is the decision the team faces.
  const [since, setSince] = useState<string | null>(breach?.since ?? null);
  const [data, setData] = useState<Tradeoff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    formApi
      .post<Tradeoff>("/assurance/tradeoff", buildTradeoffForm(file, file.name, mapping, attribute, since))
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Trade-off failed.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file, mapping, attribute, since]);

  const accs = data?.points.map((p) => p.accuracy) ?? [];
  const lo = accs.length ? Math.floor((Math.min(...accs) - 0.01) * 100) / 100 : 0;
  const hi = accs.length ? Math.ceil((Math.max(...accs) + 0.01) * 100) / 100 : 1;

  return (
    <section className="az-panel" aria-labelledby="tradeoff-title">
      <span className="mono-label">Mitigation trade-off · score + outcome · holdout-evaluated</span>
      <h2 id="tradeoff-title">What would closing the gap cost?</h2>
      <p className="az-panel-sub">
        Group-specific score thresholds, moved step by step from one shared threshold (strength 0) to equal selection
        rates (strength 1). Thresholds are fitted on half the rows and measured on the other half.
      </p>
      <div className="az-tabs" role="group" aria-label="Attribute for the trade-off">
        {attributes.map((a) => (
          <button type="button" key={a} className="az-chip" aria-pressed={a === attribute} onClick={() => setAttribute(a)}>
            {a}
          </button>
        ))}
      </div>
      {breach && (
        <div className="az-tabs" role="group" aria-label="Decision window">
          <button type="button" className="az-chip" aria-pressed={since !== null} onClick={() => setSince(breach.since)}>
            Since the drift breach ({breach.label})
          </button>
          <button type="button" className="az-chip" aria-pressed={since === null} onClick={() => setSince(null)}>
            All periods
          </button>
        </div>
      )}
      {loading && (
        <p className="az-panel-sub" role="status">
          <Loader2 size={14} className="spin" aria-hidden /> Sweeping thresholds…
        </p>
      )}
      {error && (
        <div className="az-error" role="alert">
          {error}
        </div>
      )}
      {data && !loading && (
        <>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 19, margin: "6px 0 14px" }}>{tradeoffSummary(data)}</p>
          <div className="az-grid-2">
            <div
              role="img"
              aria-label={`Accuracy against impact ratio for ${data.attribute}`}
              style={{ width: "100%", height: 240 }}
              className="az-drift-card"
            >
              <ResponsiveContainer>
                <LineChart data={data.points} margin={{ top: 10, right: 16, bottom: 18, left: -6 }}>
                  <CartesianGrid stroke="rgba(243,242,241,0.05)" />
                  <XAxis
                    type="number"
                    dataKey="impact_ratio"
                    domain={[0.5, 1]}
                    tickCount={6}
                    tick={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                    label={{ value: "impact ratio (holdout)", position: "insideBottom", offset: -10, fill: "var(--text-muted)", fontSize: 10 }}
                    allowDataOverflow
                  />
                  <YAxis
                    type="number"
                    dataKey="accuracy"
                    domain={[lo, hi]}
                    tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
                    tick={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                  />
                  <ReferenceLine x={data.threshold} stroke="var(--verdict-bad)" strokeDasharray="4 3" />
                  <Tooltip content={<TradeoffTooltip />} />
                  <Line
                    type="linear"
                    dataKey="accuracy"
                    stroke="var(--accent)"
                    strokeWidth={1.6}
                    isAnimationActive={false}
                    dot={(props: { cx?: number; cy?: number; index?: number; payload?: TradeoffPoint }) => {
                      const { cx, cy, index, payload } = props;
                      if (cx === undefined || cy === undefined || !payload) return <g key={`t-${index}`} />;
                      const chosen = data.smallest_sufficient?.strength === payload.strength;
                      return (
                        <circle
                          key={`t-${index}`}
                          cx={cx}
                          cy={cy}
                          r={chosen ? 6 : 3.4}
                          fill={chosen ? "var(--verdict-good)" : "var(--text-primary)"}
                          stroke={chosen ? "var(--surface)" : "none"}
                          strokeWidth={2}
                        />
                      );
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="az-table-wrap" tabIndex={0} role="region" aria-label="Trade-off points">
              <table className="az-table">
                <thead>
                  <tr>
                    <th>Strength</th>
                    <th>Impact ratio</th>
                    <th>Accuracy</th>
                    <th>TPR gap</th>
                    <th>Selected</th>
                  </tr>
                </thead>
                <tbody>
                  {data.points
                    .filter((_, i) => i % 2 === 0)
                    .map((p) => (
                      <tr key={p.strength}>
                        <td className="num">{p.strength.toFixed(1)}</td>
                        <td className="num">{num(p.impact_ratio)}</td>
                        <td className="num">{pct(p.accuracy)}</td>
                        <td className="num">{num(p.tpr_gap)}</td>
                        <td className="num">{pct(p.selection_rate)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
          <ul className="az-warnings" style={{ marginTop: 14 }}>
            <li>{data.caveat}</li>
            <li>
              {data.method} Fit {data.n_fit.toLocaleString()} rows, holdout {data.n_holdout.toLocaleString()}
              {data.window ? `, decisions since ${data.window.since}` : ", all periods"}.
            </li>
          </ul>
        </>
      )}
    </section>
  );
}
