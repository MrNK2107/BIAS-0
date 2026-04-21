type GroupMetrics = Record<string, { approval_rate: number; tpr: number; fpr: number; accuracy: number }>;

export default function FairnessTable({ data }: { data: GroupMetrics }) {
  const rows = Object.entries(data ?? {});
  const minAccuracy = Math.min(...rows.map(([, metrics]) => metrics.accuracy), 1);
  const minApproval = Math.min(...rows.map(([, metrics]) => metrics.approval_rate), 1);
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Group</th>
          <th>Approval Rate</th>
          <th>TPR</th>
          <th>FPR</th>
          <th>Accuracy</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([group, metrics]) => (
          <tr key={group}>
            <td>{group}</td>
            <td style={{ color: metrics.approval_rate === minApproval ? 'var(--red)' : undefined }}>{(metrics.approval_rate * 100).toFixed(1)}%</td>
            <td>{(metrics.tpr * 100).toFixed(1)}%</td>
            <td>{(metrics.fpr * 100).toFixed(1)}%</td>
            <td style={{ color: metrics.accuracy === minAccuracy ? 'var(--red)' : undefined }}>{(metrics.accuracy * 100).toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
