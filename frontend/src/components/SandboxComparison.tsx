type Scenario = {
  name: string;
  accuracy: number;
  fairness_score: number;
  risk_level: string;
  notes: string;
};

export default function SandboxComparison({ scenarios }: { scenarios: Scenario[] }) {
  const best = Math.max(...scenarios.map((scenario) => scenario.fairness_score), 0);
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Scenario</th>
          <th>Accuracy</th>
          <th>Fairness Score</th>
          <th>Risk Level</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {scenarios.map((scenario) => (
          <tr key={scenario.name} style={scenario.fairness_score === best ? { outline: '1px solid rgba(34,197,94,0.45)', background: 'rgba(34,197,94,0.06)' } : undefined}>
            <td>{scenario.name}</td>
            <td>{(scenario.accuracy * 100).toFixed(1)}%</td>
            <td>
              <div className="progress-track" style={{ maxWidth: 200, marginBottom: 6 }}>
                <div className="progress-fill" style={{ width: `${scenario.fairness_score}%` }} />
              </div>
              {scenario.fairness_score}
            </td>
            <td>{scenario.risk_level}</td>
            <td>{scenario.notes}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
