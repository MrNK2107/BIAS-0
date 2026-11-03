import { useId, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { RigourAttribute, StatisticalRigour } from "../types";
import ReliabilityDiagrams from "./ReliabilityDiagrams";

const GAP_LABELS: Record<string, string> = {
  demographic_parity_difference: "Demographic parity difference",
  equal_opportunity_difference: "Equal opportunity (TPR) gap",
  fpr_gap: "False positive rate gap",
  fnr_gap: "False negative rate gap",
  equalized_odds_difference: "Equalized odds difference",
  disparate_impact_ratio: "Disparate impact ratio",
};

const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? "n/a" : `${(v * 100).toFixed(1)}%`;
const num = (v: number | null | undefined) =>
  v === null || v === undefined ? "n/a" : v.toFixed(3);

function ciText(lo: number | null, hi: number | null) {
  return lo === null || hi === null ? "not computed" : `${num(lo)} to ${num(hi)}`;
}

/** Does the CI rule out "no disparity"? (0 for gaps, 1 for the DI ratio) */
function excludesParity(key: string, lo: number | null, hi: number | null) {
  if (lo === null || hi === null) return false;
  return key === "disparate_impact_ratio" ? hi < 1 : lo > 0;
}

export default function StatisticalRigourPanel({
  rigour,
}: {
  rigour: StatisticalRigour;
}) {
  const selectId = useId();
  const options: { key: string; label: string; res: RigourAttribute }[] = [
    ...Object.entries(rigour.per_attribute ?? {}).map(([k, res]) => ({
      key: `a:${k}`,
      label: k,
      res,
    })),
    ...Object.entries(rigour.intersectional ?? {}).map(([k, res]) => ({
      key: `i:${k}`,
      label: `${k} (intersectional)`,
      res,
    })),
  ];
  const [selected, setSelected] = useState(options[0]?.key ?? "");
  if (options.length === 0) return null;
  const current = options.find((o) => o.key === selected) ?? options[0];
  const res = current.res;
  const cfg = rigour.config;
  const ciPct = Math.round((cfg?.ci_level ?? 0.95) * 100);
  const cal = res.calibration;

  return (
    <section
      className="card"
      style={{ marginBottom: 16 }}
      aria-labelledby={`${selectId}-title`}
    >
      <h2 className="section-title" id={`${selectId}-title`}>
        Statistical reliability
      </h2>
      <p className="helper" style={{ marginBottom: 12 }}>
        {ciPct}% confidence intervals from {cfg?.n_boot ?? 0} bootstrap
        resamples (stratified by group, seed {cfg?.seed}). Groups with fewer
        than {cfg?.min_group_size} rows are flagged as unreliable.
        Intersectional gaps use only groups that meet the minimum size.
      </p>

      {rigour.warnings?.length > 0 && (
        <div className="banner warning" style={{ marginBottom: 16 }}>
          <div
            style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}
          >
            <AlertTriangle size={16} aria-hidden="true" /> Small groups
          </div>
          <ul style={{ margin: "8px 0 0 18px", fontSize: "0.85rem" }}>
            {rigour.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label htmlFor={selectId} className="stat-label" style={{ marginRight: 8 }}>
          Attribute
        </label>
        <select
          id={selectId}
          className="select"
          value={current.key}
          onChange={(e) => setSelected(e.target.value)}
          style={{ maxWidth: 360 }}
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{ overflowX: "auto", position: "relative" }}
        tabIndex={0}
        role="region"
        aria-label={`Fairness gaps for ${current.label}`}
      >
        <table className="table" style={{ marginBottom: 16 }}>
          <caption className="helper" style={{ textAlign: "left", marginBottom: 8 }}>
            Fairness gaps for {current.label} with {ciPct}% confidence intervals
            ({res.gaps_scope === "reliable_groups"
              ? `${res.n_reliable_groups} of ${res.n_groups} groups large enough`
              : `all ${res.n_groups} groups`})
          </caption>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">Value</th>
              <th scope="col">{ciPct}% CI</th>
              <th scope="col">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(res.gaps).map(([key, g]) => (
              <tr key={key}>
                <td>{GAP_LABELS[key] ?? key}</td>
                <td>{num(g.point)}</td>
                <td>{ciText(g.ci_lower, g.ci_upper)}</td>
                <td>
                  {g.ci_lower === null
                    ? "Not enough groups"
                    : excludesParity(key, g.ci_lower, g.ci_upper)
                      ? "Disparity (CI excludes parity)"
                      : "Inconclusive"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{ overflowX: "auto", position: "relative" }}
        tabIndex={0}
        role="region"
        aria-label={`Per-group results for ${current.label}`}
      >
        <table className="table">
          <caption className="helper" style={{ textAlign: "left", marginBottom: 8 }}>
            Per-group rates, sample sizes and calibration for {current.label}
            {res.groups_omitted > 0
              ? ` (largest ${Object.keys(res.groups).length} groups shown, ${res.groups_omitted} more not listed)`
              : ""}
          </caption>
          <thead>
            <tr>
              <th scope="col">Group</th>
              <th scope="col">Rows</th>
              <th scope="col">Selection rate ({ciPct}% CI)</th>
              <th scope="col">TPR</th>
              <th scope="col">FPR</th>
              {cal && <th scope="col">ECE</th>}
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(res.groups).map(([name, g]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{g.count}</td>
                <td>
                  {pct(g.selection_rate)} ({pct(g.selection_rate_ci[0])} to{" "}
                  {pct(g.selection_rate_ci[1])})
                </td>
                <td>{pct(g.tpr)}</td>
                <td>{pct(g.fpr)}</td>
                {cal && <td>{num(cal.by_group[name]?.ece)}</td>}
                <td>
                  {g.warnings.length === 0 ? (
                    "OK"
                  ) : (
                    <span title={g.warnings.join(" ")}>
                      {g.reliable ? "Check rates" : "Too small"}
                      <span className="sr-only">: {g.warnings.join(" ")}</span>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cal && (
        <p className="helper" style={{ marginTop: 12, fontSize: "0.85rem" }}>
          Calibration: overall ECE {num(cal.overall.ece)}, Brier score{" "}
          {num(cal.overall.brier)}.{" "}
          {cal.ece_gap !== null
            ? `ECE differs by ${num(cal.ece_gap)} between the best- and worst-calibrated reliable groups.`
            : "Not enough reliable groups to compare calibration."}{" "}
          ECE is the average gap between predicted probability and observed
          outcome rate over {cfg?.calibration_bins ?? 10} score bins.
        </p>
      )}

      {cal && (
        <ReliabilityDiagrams
          key={current.key}
          label={current.label}
          byGroup={cal.by_group}
        />
      )}
    </section>
  );
}
