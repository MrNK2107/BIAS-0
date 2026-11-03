import { motion } from "framer-motion";
import HelpButton from "./HelpButton";

type GroupMetrics = Record<
  string,
  { approval_rate: number; tpr: number | null; fpr: number | null; accuracy: number }
>;

// TPR (FPR) is null for a group with no actual positives (negatives).
const rate = (v: number | null) =>
  v === null || v === undefined ? "n/a" : `${(v * 100).toFixed(1)}%`;

export default function FairnessTable({ data }: { data: GroupMetrics }) {
  const rows = Object.entries(data ?? {});
  const minAccuracy = Math.min(
    ...rows.map(([, metrics]) => metrics.accuracy),
    1,
  );
  const minApproval = Math.min(
    ...rows.map(([, metrics]) => metrics.approval_rate),
    1,
  );
  return (
    <div
      style={{ overflowX: "auto", position: "relative" }}
      tabIndex={0}
      role="region"
      aria-label="Per-group model performance"
    >
    <table className="table">
      <thead>
        <tr>
          <th>Group</th>
          <th>
            Approval Rate
            <HelpButton
              module="model_bias"
              metricName="approval_rate"
            />
          </th>
          <th>
            TPR
            <HelpButton
              module="model_bias"
              metricName="tpr"
            />
          </th>
          <th>
            FPR
            <HelpButton
              module="model_bias"
              metricName="fpr"
            />
          </th>
          <th>
            Accuracy
            <HelpButton
              module="model_bias"
              metricName="accuracy"
            />
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([group, metrics], index) => (
          <motion.tr
            key={group}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            whileHover={{ backgroundColor: "rgba(255,255,255,0.04)" }}
          >
            <td>{group}</td>
            <td
              style={{
                color:
                  metrics.approval_rate === minApproval
                    ? "var(--red)"
                    : undefined,
              }}
            >
              {(metrics.approval_rate * 100).toFixed(1)}%
            </td>
            <td>{rate(metrics.tpr)}</td>
            <td>{rate(metrics.fpr)}</td>
            <td
              style={{
                color:
                  metrics.accuracy === minAccuracy ? "var(--red)" : undefined,
              }}
            >
              {(metrics.accuracy * 100).toFixed(1)}%
            </td>
          </motion.tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
