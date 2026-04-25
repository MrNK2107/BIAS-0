import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export default function CounterfactualFlip({ original, flipped }: { original: string; flipped: string }) {
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    setIsFlipped(false);
    const timer = setTimeout(() => setIsFlipped(true), 600);
    return () => clearTimeout(timer);
  }, [original, flipped]);

  return (
    <div className="grid-2" style={{ perspective: 1200 }}>
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4 }}
        className="card" 
        style={{ borderColor: 'rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)' }}
      >
        <div className="kicker">Original decision</div>
        <h3 className="section-title" style={{ fontSize: '1.5rem', marginTop: '12px' }}>{original}</h3>
      </motion.div>
      
      <motion.div 
        initial={{ rotateX: -90, opacity: 0 }}
        animate={isFlipped ? { rotateX: 0, opacity: 1 } : { rotateX: -90, opacity: 0 }}
        transition={{ duration: 0.6, type: 'spring', bounce: 0.3 }}
        className="card" 
        style={{ 
          borderColor: 'rgba(239,68,68,0.3)', 
          background: 'rgba(239,68,68,0.08)', 
          transformOrigin: 'top center' 
        }}
      >
        <div className="kicker" style={{ borderColor: 'rgba(239,68,68,0.5)', color: '#fca5a5' }}>
          After flipping sensitive attribute
        </div>
        <h3 className="section-title" style={{ fontSize: '1.5rem', marginTop: '12px' }}>{flipped}</h3>
      </motion.div>
    </div>
  );
}
