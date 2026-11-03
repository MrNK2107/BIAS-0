/** A point estimate with its interval on a fixed scale, plus an optional threshold mark. */
export default function CiTrack({
  lo,
  hi,
  point,
  threshold,
  min = 0,
  max = 1,
  label,
}: {
  lo: number | null | undefined;
  hi: number | null | undefined;
  point: number | null | undefined;
  threshold?: number;
  min?: number;
  max?: number;
  label?: string;
}) {
  const pos = (v: number) => `${(Math.min(Math.max((v - min) / (max - min), 0), 1) * 100).toFixed(1)}%`;
  const has = lo !== null && lo !== undefined && hi !== null && hi !== undefined;
  const aria =
    label ??
    (has && point !== null && point !== undefined
      ? `${point.toFixed(2)}, 95% interval ${lo!.toFixed(2)} to ${hi!.toFixed(2)}`
      : "no interval");
  return (
    <div className="ci-track" role="img" aria-label={aria}>
      {has && (
        <span
          className="ci-band"
          style={{ left: pos(lo!), width: `calc(${pos(hi!)} - ${pos(lo!)} + 2px)` }}
        />
      )}
      {threshold !== undefined && <span className="ci-threshold" style={{ left: pos(threshold) }} />}
      {point !== null && point !== undefined && <span className="ci-point" style={{ left: pos(point) }} />}
    </div>
  );
}
