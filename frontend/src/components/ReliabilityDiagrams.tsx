import { useId } from "react";
import type { CalibrationSummary } from "../types";
import {
  chartGroups,
  reliabilityGeometry,
  reliabilitySummary,
} from "../utils/reliability";

const MAX_CHARTS = 8;
const SIZE = 200;
const PAD = 30;

const f2 = (v: number | null | undefined) =>
  v === null || v === undefined ? "n/a" : v.toFixed(2);

/**
 * Small-multiple reliability diagrams, one per group (largest groups first).
 * Each chart is a focusable image with a text summary; the exact bin values are
 * in a table behind a disclosure for screen-reader and keyboard users.
 */
export default function ReliabilityDiagrams({
  label,
  byGroup,
}: {
  label: string;
  byGroup: Record<string, CalibrationSummary>;
}) {
  const baseId = useId();
  const groups = chartGroups(byGroup, MAX_CHARTS);
  if (groups.length === 0) return null;
  const hidden = Object.keys(byGroup).length - groups.length;

  return (
    <div className="reliability" style={{ marginTop: 16 }}>
      <h3 className="stat-label" id={`${baseId}-h`} style={{ marginBottom: 4 }}>
        Reliability diagrams ({label})
      </h3>
      <p className="helper" style={{ fontSize: "0.85rem", marginBottom: 12 }}>
        Each point is a score bin: predicted probability (across) against the
        observed outcome rate (up). Points on the dashed diagonal are well
        calibrated; below it the model is over-confident. Larger points hold
        more rows.
        {hidden > 0 ? ` Showing the ${groups.length} largest groups; ${hidden} more are in the table.` : ""}
      </p>
      <ul className="reliability-grid" aria-labelledby={`${baseId}-h`}>
        {groups.map(([name, s], gi) => {
          const geo = reliabilityGeometry(s.bins, SIZE, PAD);
          const titleId = `${baseId}-t${gi}`;
          const descId = `${baseId}-d${gi}`;
          const unreliable = s.reliable === false;
          return (
            <li key={name}>
            <figure className="reliability-figure">
              <svg
                viewBox={`0 0 ${SIZE} ${SIZE}`}
                role="img"
                tabIndex={0}
                aria-labelledby={`${titleId} ${descId}`}
                className="reliability-svg"
              >
                <title id={titleId}>{name}</title>
                <desc id={descId}>{reliabilitySummary(name, s)}</desc>
                <rect
                  x={PAD}
                  y={PAD}
                  width={SIZE - 2 * PAD}
                  height={SIZE - 2 * PAD}
                  fill="none"
                  stroke="var(--border-strong)"
                />
                {geo.ticks.map((t) => (
                  <g key={t.value} aria-hidden="true">
                    <text
                      x={t.pos}
                      y={SIZE - PAD + 13}
                      textAnchor="middle"
                      className="reliability-tick"
                    >
                      {t.value}
                    </text>
                    <text
                      x={PAD - 5}
                      y={SIZE - t.pos + 3}
                      textAnchor="end"
                      className="reliability-tick"
                    >
                      {t.value}
                    </text>
                  </g>
                ))}
                <text
                  x={SIZE / 2}
                  y={SIZE - 4}
                  textAnchor="middle"
                  className="reliability-axis"
                  aria-hidden="true"
                >
                  Predicted
                </text>
                <text
                  x={10}
                  y={SIZE / 2}
                  textAnchor="middle"
                  transform={`rotate(-90 10 ${SIZE / 2})`}
                  className="reliability-axis"
                  aria-hidden="true"
                >
                  Observed
                </text>
                <path
                  d={geo.diagonal}
                  stroke="var(--text-muted)"
                  strokeDasharray="4 4"
                  fill="none"
                />
                <path
                  d={geo.path}
                  stroke={unreliable ? "var(--text-secondary)" : "var(--accent)"}
                  strokeWidth={2}
                  strokeDasharray={unreliable ? "2 3" : undefined}
                  fill="none"
                />
                {geo.points.map((p) => (
                  <circle
                    key={p.bin.lower}
                    cx={p.cx}
                    cy={p.cy}
                    r={p.r}
                    fill={unreliable ? "var(--text-secondary)" : "var(--accent)"}
                  />
                ))}
              </svg>
              <figcaption className="helper reliability-caption">
                <strong>{name}</strong> · n={s.n} · ECE {f2(s.ece)}
                {unreliable ? " · too small" : ""}
              </figcaption>
            </figure>
            </li>
          );
        })}
      </ul>

      <details style={{ marginTop: 12 }}>
        <summary className="helper" style={{ cursor: "pointer" }}>
          Reliability data as a table
        </summary>
        <div
          style={{ overflowX: "auto", position: "relative", marginTop: 8 }}
          tabIndex={0}
          role="region"
          aria-label={`Reliability bins for ${label}`}
        >
          <table className="table">
            <caption className="helper" style={{ textAlign: "left", marginBottom: 8 }}>
              Calibration bins per group for {label}
            </caption>
            <thead>
              <tr>
                <th scope="col">Group</th>
                <th scope="col">Score bin</th>
                <th scope="col">Rows</th>
                <th scope="col">Mean predicted</th>
                <th scope="col">Observed rate</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(byGroup).flatMap(([name, s]) =>
                s.bins.map((b) => (
                  <tr key={`${name}-${b.lower}`}>
                    <td>{name}</td>
                    <td>
                      {f2(b.lower)} to {f2(b.upper)}
                    </td>
                    <td>{b.count}</td>
                    <td>{f2(b.mean_predicted)}</td>
                    <td>{f2(b.observed_rate)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
