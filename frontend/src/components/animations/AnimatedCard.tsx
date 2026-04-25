import React from 'react';
import { motion } from 'framer-motion';

interface AnimatedCardProps {
  children: React.ReactNode;
  severity?: 'green' | 'amber' | 'red' | 'gray';
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const cardVariants: any = {
  hidden: { opacity: 0, y: 15 },
  visible: (customDelay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.22, 1, 0.36, 1],
      delay: customDelay,
    },
  }),
};

const getSeverityColor = (sev: string) => {
  switch (sev) {
    case 'green': return '#10b981';
    case 'amber': return '#f59e0b';
    case 'red': return '#ef4444';
    default: return '#9ca3af';
  }
};

export default function AnimatedCard({ children, severity = 'gray', delay = 0, className = 'card', style }: AnimatedCardProps) {
  const borderColor = getSeverityColor(severity);

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      custom={delay}
      whileHover={{ 
        scale: 1.02, 
        borderColor: severity !== 'gray' ? borderColor : 'rgba(255, 255, 255, 0.1)',
        boxShadow: severity !== 'gray' ? `0 8px 32px ${borderColor}20` : '0 8px 32px rgba(0,0,0,0.2)'
      }}
      className={className}
      style={{
        ...style,
        borderTop: `4px solid ${borderColor}`,
        transformOrigin: 'center center',
      }}
    >
      {children}
    </motion.div>
  );
}
