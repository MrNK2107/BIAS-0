import React from 'react';
import { HelpCircle } from 'lucide-react';
import AnimatedCard from './animations/AnimatedCard';
import AnimatedNumber from './animations/AnimatedNumber';

interface FairnessMetricsPanelProps {
  biasResult: any;
  counterfactualResult: any;
}

interface MetricItemProps {
  title: string;
  value: number | string;
  description: string;
  thresholds: {
    good: (v: number) => boolean;
    moderate: (v: number) => boolean;
  };
  isPercentage?: boolean;
  index: number;
}

const MetricCard: React.FC<MetricItemProps> = ({ title, value, description, thresholds, isPercentage, index }) => {
  const numValue = typeof value === 'number' ? value : parseFloat(value as string);
  
  let severity: 'green' | 'amber' | 'red' | 'gray' = 'red';
  let interpretation = 'High disparity';
  
  if (!isNaN(numValue)) {
    if (thresholds.good(numValue)) {
      severity = 'green';
      interpretation = 'Acceptable range';
    } else if (thresholds.moderate(numValue)) {
      severity = 'amber';
      interpretation = 'Moderate disparity';
    }
  } else {
    severity = 'gray';
    interpretation = 'No data';
  }

  const getSeverityColor = (sev: string) => {
    switch (sev) {
      case 'green': return 'var(--accent)';
      case 'amber': return 'var(--accent)';
      case 'red': return 'var(--warning)';
      default: return 'var(--text-secondary)';
    }
  };

  return (
    <AnimatedCard severity={severity} delay={index * 0.1} style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{title}</h4>
        <div title={description} style={{ cursor: 'help', color: '#9ca3af' }}>
          <HelpCircle size={16} />
        </div>
      </div>
      
      <div className="stat-number" style={{ fontSize: '2rem', marginBottom: '8px' }}>
        <AnimatedNumber value={numValue} isPercentage={isPercentage} />
      </div>
      
      <div style={{ 
        display: 'inline-block',
        padding: '4px 8px', 
        borderRadius: '4px', 
        fontSize: '0.875rem',
        backgroundColor: `${getSeverityColor(severity)}20`,
        color: getSeverityColor(severity),
        fontWeight: 500
      }}>
        {interpretation}
      </div>
    </AnimatedCard>
  );
};

export default function FairnessMetricsPanel({ biasResult, counterfactualResult }: FairnessMetricsPanelProps) {
  // Use fallbacks if some data is missing
  const dpGap = biasResult?.metrics?.demographic_parity_difference ?? NaN;
  const eoGap = biasResult?.metrics?.equal_opportunity_difference ?? NaN;
  // Fallback to baseline accuracy from stress tests if not in biasResult
  const accuracy = biasResult?.metrics?.accuracy ?? NaN; 
  const flipRate = counterfactualResult?.flip_rate ?? NaN;

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h3 className="section-title" style={{ marginBottom: '4px' }}>Multi-Metric Fairness Analysis</h3>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem' }}>
          Fairness cannot be reduced to a single number. These metrics show different perspectives of model behavior across groups.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <MetricCard
          index={0}
          title="Demographic Parity Gap"
          value={dpGap}
          description="Difference in selection rates between groups. A value closer to 0 indicates groups are selected at similar rates."
          thresholds={{
            good: (v) => Math.abs(v) <= 0.1,
            moderate: (v) => Math.abs(v) <= 0.2,
          }}
        />
        <MetricCard
          index={1}
          title="Equal Opportunity Gap"
          value={eoGap}
          description="Difference in true positive rates between groups. A value closer to 0 indicates qualified individuals from all groups have similar chances."
          thresholds={{
            good: (v) => Math.abs(v) <= 0.1,
            moderate: (v) => Math.abs(v) <= 0.2,
          }}
        />
        <MetricCard
          index={2}
          title="Counterfactual Flip Rate"
          value={flipRate}
          isPercentage={true}
          description="Percentage of predictions that change when only the sensitive attribute is modified. A lower flip rate means the model is less reliant on the sensitive attribute."
          thresholds={{
            good: (v) => v <= 0.05,
            moderate: (v) => v <= 0.15,
          }}
        />
        <MetricCard
          index={3}
          title="Overall Accuracy"
          value={accuracy}
          isPercentage={true}
          description="Overall predictive accuracy of the model across all groups."
          thresholds={{
            good: (v) => v >= 0.8,
            moderate: (v) => v >= 0.7,
          }}
        />
      </div>
    </div>
  );
}
