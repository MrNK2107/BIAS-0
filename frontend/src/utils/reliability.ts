/** Reliability-diagram geometry shared by the Step 4 chart and the HTML report. */

import type { CalibrationSummary } from "../types";

export type ReliabilityBin = CalibrationSummary["bins"][number];

export interface ReliabilityGeometry {
  size: number;
  pad: number;
  /** polyline through (mean predicted, observed rate) of every non-empty bin */
  path: string;
  /** perfect-calibration diagonal */
  diagonal: string;
  points: { cx: number; cy: number; r: number; bin: ReliabilityBin }[];
  ticks: { value: number; pos: number }[];
}

/** Largest groups first, at most ``limit`` (ties by name, so it is stable). */
export function chartGroups(
  byGroup: Record<string, CalibrationSummary>,
  limit = 8,
): [string, CalibrationSummary][] {
  return Object.entries(byGroup)
    .filter(([, s]) => s.bins.length > 0)
    .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

export function reliabilityGeometry(
  bins: ReliabilityBin[],
  size = 160,
  pad = 24,
): ReliabilityGeometry {
  const inner = size - 2 * pad;
  const x = (v: number) => pad + Math.max(0, Math.min(1, v)) * inner;
  const y = (v: number) => size - pad - Math.max(0, Math.min(1, v)) * inner;
  const total = bins.reduce((s, b) => s + b.count, 0) || 1;
  const points = bins.map((bin) => ({
    cx: +x(bin.mean_predicted).toFixed(1),
    cy: +y(bin.observed_rate).toFixed(1),
    // area roughly proportional to the bin's share of rows, clamped for legibility
    r: +Math.max(2, Math.min(6, 2 + 10 * Math.sqrt(bin.count / total))).toFixed(1),
    bin,
  }));
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.cx} ${p.cy}`)
    .join(" ");
  return {
    size,
    pad,
    path,
    diagonal: `M${x(0)} ${y(0)} L${x(1)} ${y(1)}`,
    points,
    ticks: [0, 0.5, 1].map((value) => ({ value, pos: x(value) })),
  };
}

const f2 = (v: number | null | undefined) =>
  v === null || v === undefined ? "n/a" : v.toFixed(2);

/** One-sentence text alternative for a group's reliability diagram. */
export function reliabilitySummary(name: string, s: CalibrationSummary): string {
  const worst = s.bins.reduce<ReliabilityBin | null>(
    (w, b) =>
      w === null ||
      Math.abs(b.observed_rate - b.mean_predicted) >
        Math.abs(w.observed_rate - w.mean_predicted)
        ? b
        : w,
    null,
  );
  const dir =
    worst === null
      ? ""
      : worst.observed_rate < worst.mean_predicted
        ? "over-confident"
        : "under-confident";
  return (
    `Reliability diagram for ${name}: ${s.n} rows in ${s.bins.length} score bins, ` +
    `ECE ${f2(s.ece)}.` +
    (worst
      ? ` Largest gap in the ${f2(worst.lower)}-${f2(worst.upper)} bin: predicted ` +
        `${f2(worst.mean_predicted)}, observed ${f2(worst.observed_rate)} (${dir}).`
      : "") +
    (s.reliable === false ? " Group is below the minimum size, so this is unreliable." : "")
  );
}
