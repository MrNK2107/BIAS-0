type ScoreGaugeProps = {
  score: number;
  label?: string;
};

const radius = 54;
const circumference = 2 * Math.PI * radius;

export default function ScoreGauge({ score, label = 'Fairness Score' }: ScoreGaugeProps) {
  const normalized = Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - normalized / 100);
  const color = normalized < 50 ? 'var(--red)' : normalized < 75 ? 'var(--yellow)' : 'var(--green)';

  return (
    <div style={{ display: 'grid', placeItems: 'center' }}>
      <svg width="180" height="180" viewBox="0 0 180 180" aria-label={label}>
        <circle cx="90" cy="90" r={radius} stroke="rgba(148,163,184,0.18)" strokeWidth="14" fill="none" />
        <circle
          cx="90"
          cy="90"
          r={radius}
          stroke={color}
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 90 90)"
        />
        <text x="90" y="90" textAnchor="middle" dominantBaseline="central" fill="var(--text-primary)" fontSize="34" fontWeight="700">
          {Math.round(normalized)}
        </text>
        <text x="90" y="122" textAnchor="middle" fill="var(--text-secondary)" fontSize="11">
          {label}
        </text>
      </svg>
    </div>
  );
}
