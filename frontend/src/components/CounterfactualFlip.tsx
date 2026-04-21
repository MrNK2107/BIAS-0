export default function CounterfactualFlip({ original, flipped }: { original: string; flipped: string }) {
  return (
    <div className="grid-2">
      <div className="card" style={{ borderColor: 'rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)' }}>
        <div className="kicker">Original decision</div>
        <h3 className="section-title">{original}</h3>
      </div>
      <div className="card" style={{ borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)' }}>
        <div className="kicker">After flipping sensitive attribute</div>
        <h3 className="section-title">{flipped}</h3>
      </div>
    </div>
  );
}
