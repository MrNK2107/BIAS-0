import { motion } from 'framer-motion';

interface ScanningSkeletonProps {
  height?: number | string;
  width?: number | string;
  borderRadius?: number | string;
}

export default function ScanningSkeleton({ 
  height = '200px', 
  width = '100%', 
  borderRadius = '14px' 
}: ScanningSkeletonProps) {
  return (
    <div 
      style={{ 
        height, 
        width, 
        borderRadius, 
        backgroundColor: 'rgba(255, 255, 255, 0.03)', 
        position: 'relative', 
        overflow: 'hidden',
        border: '1px solid rgba(148, 163, 184, 0.05)'
      }}
    >
      <motion.div
        initial={{ left: '-100%' }}
        animate={{ left: '200%' }}
        transition={{
          duration: 2,
          ease: 'easeInOut',
          repeat: Infinity,
          repeatDelay: 0.2
        }}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: '50%',
          background: 'linear-gradient(90deg, transparent 0%, rgba(79, 142, 247, 0.15) 50%, transparent 100%)',
          zIndex: 1
        }}
      />
    </div>
  );
}
