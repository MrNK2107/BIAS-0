import React, { useState, useMemo } from 'react';
import { AlertTriangle, Filter, Users, TrendingDown } from 'lucide-react';

export interface SubgroupBias {
  id: string;
  definition: string;
  attributes: Record<string, string>;
  metricDifference: string;
  metricValue: number;
  sampleSize: number;
  metricName: string;
}

interface HiddenBiasExplorerProps {
  subgroups?: SubgroupBias[];
}

const mockSubgroups: SubgroupBias[] = [
  {
    id: '1',
    definition: 'Female + Low Income + Rural',
    attributes: { gender: 'Female', income: 'Low Income', location: 'Rural' },
    metricDifference: '-32%',
    metricValue: -0.32,
    sampleSize: 124,
    metricName: 'Approval Rate'
  },
  {
    id: '2',
    definition: 'Male + Low Income + Urban',
    attributes: { gender: 'Male', income: 'Low Income', location: 'Urban' },
    metricDifference: '-28%',
    metricValue: -0.28,
    sampleSize: 342,
    metricName: 'Approval Rate'
  },
  {
    id: '3',
    definition: 'Female + Middle Income + Suburban',
    attributes: { gender: 'Female', income: 'Middle Income', location: 'Suburban' },
    metricDifference: '-15%',
    metricValue: -0.15,
    sampleSize: 512,
    metricName: 'Approval Rate'
  },
  {
    id: '4',
    definition: 'Non-binary + Low Income',
    attributes: { gender: 'Non-binary', income: 'Low Income' },
    metricDifference: '-22%',
    metricValue: -0.22,
    sampleSize: 89,
    metricName: 'Approval Rate'
  },
  {
    id: '5',
    definition: 'Male + High Income + Rural',
    attributes: { gender: 'Male', income: 'High Income', location: 'Rural' },
    metricDifference: '+8%',
    metricValue: 0.08,
    sampleSize: 210,
    metricName: 'Approval Rate'
  },
  {
    id: '6',
    definition: 'Female + High Income + Urban',
    attributes: { gender: 'Female', income: 'High Income', location: 'Urban' },
    metricDifference: '+2%',
    metricValue: 0.02,
    sampleSize: 430,
    metricName: 'Approval Rate'
  }
];

export default function HiddenBiasExplorer({ subgroups = mockSubgroups }: HiddenBiasExplorerProps) {
  const [selectedAttributes, setSelectedAttributes] = useState<string[]>([]);

  // Extract all unique attribute keys available in the data
  const availableAttributes = useMemo(() => {
    const keys = new Set<string>();
    subgroups.forEach(sg => {
      Object.keys(sg.attributes).forEach(k => keys.add(k));
    });
    return Array.from(keys);
  }, [subgroups]);

  const toggleAttribute = (attr: string) => {
    setSelectedAttributes(prev => 
      prev.includes(attr) ? prev.filter(a => a !== attr) : [...prev, attr]
    );
  };

  // Filter subgroups based on selected attribute keys. 
  // If a filter is selected, we only show subgroups that include AT LEAST ONE of the selected attributes in their definition.
  // Or, if strict, only subgroups that HAVE those attribute keys. 
  // Let's go with: if an attribute filter is active, the subgroup must have a value for that attribute.
  const filteredSubgroups = useMemo(() => {
    let filtered = subgroups;
    if (selectedAttributes.length > 0) {
      filtered = subgroups.filter(sg => 
        selectedAttributes.some(attr => Object.keys(sg.attributes).includes(attr))
      );
    }
    
    // Sort by absolute metric value to find the "most biased" (furthest from 0)
    return filtered.sort((a, b) => Math.abs(b.metricValue) - Math.abs(a.metricValue));
  }, [subgroups, selectedAttributes]);

  const worstSubgroup = filteredSubgroups.length > 0 ? filteredSubgroups[0] : null;
  const topBiased = filteredSubgroups.slice(0, 5);

  if (subgroups.length === 0) {
    return null;
  }

  return (
    <div className="card" style={{ marginBottom: '24px', backgroundColor: '#fafafa' }}>
      <div style={{ marginBottom: '24px' }}>
        <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TrendingDown size={20} color="#ef4444" />
          Hidden Bias Explorer
        </h3>
        <p className="helper">
          Group-level fairness metrics can hide intersectional bias. This tool surfaces specific subgroups where the model performs significantly worse.
        </p>
      </div>

      {/* Worst Subgroup Highlight */}
      {worstSubgroup && (
        <div style={{ 
          backgroundColor: '#fef2f2', 
          border: '1px solid #fecaca', 
          borderRadius: '8px', 
          padding: '20px',
          marginBottom: '24px',
          display: 'flex',
          gap: '16px',
          alignItems: 'flex-start'
        }}>
          <AlertTriangle color="#ef4444" style={{ marginTop: '4px', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600, color: '#991b1b', marginBottom: '4px' }}>Highest Intersectional Risk</div>
            <div style={{ fontSize: '1.1rem', color: '#7f1d1d' }}>
              <strong>{worstSubgroup.definition}</strong> → {Math.abs(worstSubgroup.metricValue * 100).toFixed(0)}% lower {worstSubgroup.metricName.toLowerCase()}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#ef4444', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Users size={14} /> Sample size: {worstSubgroup.sampleSize}
            </div>
          </div>
        </div>
      )}

      {/* Filtering */}
      {availableAttributes.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Filter size={16} color="#6b7280" />
            <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#374151' }}>Filter by attributes:</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {availableAttributes.map(attr => (
              <button
                key={attr}
                onClick={() => toggleAttribute(attr)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '16px',
                  border: `1px solid ${selectedAttributes.includes(attr) ? '#3b82f6' : '#d1d5db'}`,
                  backgroundColor: selectedAttributes.includes(attr) ? '#eff6ff' : '#ffffff',
                  color: selectedAttributes.includes(attr) ? '#1d4ed8' : '#4b5563',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  fontWeight: selectedAttributes.includes(attr) ? 600 : 400,
                  transition: 'all 0.2s'
                }}
              >
                {attr.charAt(0).toUpperCase() + attr.slice(1)}
              </button>
            ))}
            {selectedAttributes.length > 0 && (
              <button
                onClick={() => setSelectedAttributes([])}
                style={{
                  padding: '4px 12px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#6b7280',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top 5 Rankings */}
      <div>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Top 5 Most Biased Subgroups
        </div>
        
        {topBiased.length === 0 ? (
          <div className="helper">No subgroups match the selected filters.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '12px 8px', color: '#6b7280', fontWeight: 500 }}>Subgroup Definition</th>
                  <th style={{ padding: '12px 8px', color: '#6b7280', fontWeight: 500 }}>Metric Difference</th>
                  <th style={{ padding: '12px 8px', color: '#6b7280', fontWeight: 500 }}>Sample Size</th>
                </tr>
              </thead>
              <tbody>
                {topBiased.map((sg, idx) => {
                  const isNegative = sg.metricValue < 0;
                  return (
                    <tr key={sg.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '12px 8px', fontWeight: 500, color: '#111827' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            width: '24px', 
                            height: '24px', 
                            borderRadius: '50%', 
                            backgroundColor: idx === 0 ? '#fee2e2' : '#f3f4f6',
                            color: idx === 0 ? '#ef4444' : '#6b7280',
                            fontSize: '0.8rem',
                            fontWeight: 700
                          }}>
                            {idx + 1}
                          </span>
                          {sg.definition}
                        </div>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <span className={`pill ${isNegative ? 'red' : 'green'}`} style={{ fontWeight: 600 }}>
                          {sg.metricDifference}
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px', color: '#6b7280' }}>
                        {sg.sampleSize}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
