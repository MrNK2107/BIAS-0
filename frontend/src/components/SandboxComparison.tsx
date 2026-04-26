import { motion, AnimatePresence } from 'framer-motion';
import AnimatedNumber from './animations/AnimatedNumber';

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
        <AnimatePresence>
          {scenarios.map((scenario, index) => (
            <motion.tr 
              key={scenario.name} 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              style={scenario.fairness_score === best ? { outline: '0.5px solid rgba(212,163,115,0.72)', background: 'rgba(212,163,115,0.1)' } : undefined}
            >
              <td>{scenario.name}</td>
              <td>{(scenario.accuracy * 100).toFixed(1)}%</td>
              <td>
                <div className="progress-track" style={{ maxWidth: 200, marginBottom: 6 }}>
                  <motion.div 
                    className="progress-fill" 
                    initial={{ width: 0 }}
                    animate={{ width: `${scenario.fairness_score}%` }}
                    transition={{ duration: 0.8, delay: index * 0.1 + 0.2 }}
                  />
                </div>
                <AnimatedNumber value={scenario.fairness_score} />
              </td>
              <td>{scenario.risk_level}</td>
              <td>{scenario.notes}</td>
            </motion.tr>
          ))}
        </AnimatePresence>
      </tbody>
    </table>
  );
}
