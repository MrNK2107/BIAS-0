import { useId } from "react";
import type { Tone } from "../../utils/assurance";

const TONE_COLOUR: Record<Tone, string> = {
  bad: "var(--verdict-bad)",
  warn: "var(--verdict-warn)",
  good: "var(--verdict-good)",
  muted: "var(--text-secondary)",
};

/**
 * The BIAS-0 hallmark: an assay-office style stamp. Assay offices test a metal
 * and stamp what they found, which is the job of an audit report.
 */
export default function Hallmark({
  mark,
  tone = "muted",
  size = 132,
  ring = "BIAS-0 · OUTCOME AUDIT · FAIRNESS ASSURANCE ·",
  label,
}: {
  mark: string;
  tone?: Tone;
  size?: number;
  ring?: string;
  label?: string;
}) {
  const id = useId().replace(/:/g, "");
  const colour = TONE_COLOUR[tone];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      role="img"
      aria-label={label ?? `Hallmark ${mark}`}
      className="hallmark"
    >
      <defs>
        <path id={`ring-${id}`} d="M80,80 m-58,0 a58,58 0 1,1 116,0 a58,58 0 1,1 -116,0" />
      </defs>
      <circle cx="80" cy="80" r="77" fill="none" stroke="var(--accent)" strokeWidth="1.2" />
      <circle cx="80" cy="80" r="71" fill="none" stroke="var(--accent)" strokeOpacity="0.45" strokeWidth="0.8" />
      <circle cx="80" cy="80" r="45" fill="var(--surface-inset)" stroke={colour} strokeWidth="2.2" />
      <text className="hallmark-ring">
        <textPath href={`#ring-${id}`}>{ring}</textPath>
      </text>
      <text x="80" y="97" textAnchor="middle" className="hallmark-mark" style={{ fill: colour }}>
        {mark}
      </text>
    </svg>
  );
}
