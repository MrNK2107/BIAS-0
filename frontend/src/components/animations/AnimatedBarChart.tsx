import { motion } from 'framer-motion';
import { useState } from 'react';

interface AnimatedBarChartProps {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  maxDomain?: number;
  valueSuffix?: string;
}

export default function AnimatedBarChart({ 
  data, 
  height = 250, 
  maxDomain = 100,
  valueSuffix = '%'
}: AnimatedBarChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const getBarColor = (value: number, defaultColor?: string) => {
    if (defaultColor) return defaultColor;
    if (value < 40) return '#ef4444'; // Red
    if (value < 60) return '#f59e0b'; // Amber
    return '#10b981'; // Green
  };

  return (
    <div style={{ height, display: 'flex', alignItems: 'flex-end', gap: '12px', padding: '20px 0', position: 'relative' }}>
      {/* Background grid lines */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ borderTop: '1px dashed rgba(148, 163, 184, 0.15)', width: '100%', height: 1 }} />
        ))}
      </div>

      {data.map((item, index) => {
        const percentage = Math.max(5, Math.min(100, (item.value / maxDomain) * 100)); // Min 5% height to always be visible
        const color = getBarColor(item.value, item.color);
        const isHovered = hoveredIndex === index;

        return (
          <div 
            key={index} 
            style={{ 
              flex: 1, 
              display: 'flex', 
              flexDirection: 'column', 
              justifyContent: 'flex-end', 
              alignItems: 'center',
              height: '100%',
              zIndex: 1
            }}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {/* Tooltip */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: isHovered ? 1 : 0, y: isHovered ? 0 : 10 }}
              style={{
                background: '#1a1f2b',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#fff',
                marginBottom: '8px',
                pointerEvents: 'none',
                border: '1px solid rgba(148, 163, 184, 0.1)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
              }}
            >
              {item.value}{valueSuffix}
            </motion.div>

            {/* Bar */}
            <motion.div
              initial={{ height: '0%', opacity: 0 }}
              animate={{ height: `${percentage}%`, opacity: hoveredIndex === null || isHovered ? 1 : 0.4 }}
              transition={{ duration: 0.6, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
              style={{
                width: '100%',
                maxWidth: '48px',
                backgroundColor: color,
                borderRadius: '6px 6px 0 0',
                boxShadow: isHovered ? `0 0 16px ${color}40` : 'none',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {/* Internal glow */}
              <motion.div 
                animate={{ opacity: isHovered ? 1 : 0.3 }}
                style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, height: '40%',
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 100%)'
                }}
              />
            </motion.div>
            
            {/* Label */}
            <div style={{ 
              marginTop: '12px', 
              fontSize: '0.75rem', 
              color: '#8b9ab3', 
              fontWeight: 500,
              textAlign: 'center',
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              width: '100%'
            }}>
              {item.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
