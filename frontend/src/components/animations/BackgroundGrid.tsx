import React from 'react';
import { motion } from 'framer-motion';

export default function BackgroundGrid() {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: -1,
        overflow: 'hidden',
        backgroundColor: 'var(--bg, #0b0d12)',
      }}
    >
      {/* Grid pattern with subtle shift */}
      <motion.div
        animate={{
          backgroundPosition: ['0px 0px', '40px 40px'],
        }}
        transition={{
          repeat: Infinity,
          repeatType: 'loop',
          duration: 20,
          ease: 'linear',
        }}
        style={{
          position: 'absolute',
          width: '200vw',
          height: '200vh',
          top: '-50vh',
          left: '-50vw',
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.015) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.015) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />
      
      {/* Glowing orbs/noise for depth */}
      <div
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          background: 'radial-gradient(circle at 15% 50%, rgba(212, 163, 115, 0.06), transparent 28%), radial-gradient(circle at 85% 30%, rgba(188, 71, 73, 0.05), transparent 26%)',
        }}
      />
    </div>
  );
}
