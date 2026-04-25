import React from 'react';
import { motion } from 'framer-motion';

interface ScanningSkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
}

export function ScanningSkeleton({ width = '100%', height = '20px', borderRadius = '4px' }: ScanningSkeletonProps) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <motion.div
        initial={{ x: '-100%' }}
        animate={{ x: '100%' }}
        transition={{
          repeat: Infinity,
          repeatType: 'loop',
          duration: 1.5,
          ease: 'linear',
        }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(90deg, transparent, rgba(79, 142, 247, 0.15), transparent)',
        }}
      />
    </div>
  );
}

export function DataFlowEffect() {
  return (
    <motion.div
      initial={{ backgroundPosition: '0% 50%' }}
      animate={{ backgroundPosition: '100% 50%' }}
      transition={{
        repeat: Infinity,
        repeatType: 'mirror',
        duration: 3,
        ease: 'linear',
      }}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: 'linear-gradient(90deg, rgba(79, 142, 247, 0.03) 0%, rgba(139, 92, 246, 0.06) 50%, rgba(79, 142, 247, 0.03) 100%)',
        backgroundSize: '200% 100%',
        mixBlendMode: 'screen',
      }}
    />
  );
}
