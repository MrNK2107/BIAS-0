import React from 'react';
import { motion } from 'framer-motion';

const Section = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <section className={`hero-section h-screen ${className}`}>{children}</section>
);

interface UIOverlayProps {
  navigate: (path: string) => void;
}

export default function UIOverlay({ navigate }: UIOverlayProps) {
  return (
    <div className="hero-overlay pointer-events-none">
      <Section className="hero-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          viewport={{ once: false, amount: 0.45 }}
          className="hero-copy max-center hero-panel"
        >
          <h1 className="hero-title">INTEGRITY AT SCALE.</h1>
          <p className="hero-brief">
            AI is a mirror of your data. We ensure that mirror isn&apos;t distorted. Audit,
            explain, and correct algorithmic bias in real-time.
          </p>
          <div className="cta-wrapper pointer-events-auto z-50">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="cta-enter"
            >
              ENTER PLATFORM
            </button>
          </div>
        </motion.div>
      </Section>

      <Section className="hero-left">
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7 }}
          viewport={{ once: false, amount: 0.4 }}
          className="hero-copy max-wide hero-panel"
        >
          <h2 className="hero-title">THE SILENT DRIFT.</h2>
          <p className="hero-brief">
            Bias doesn&apos;t announce itself. It hides in proxy variables, ZIP codes,
            browsing habits, and historical echoes that models silently learn as prejudice.
          </p>
        </motion.div>
      </Section>

      <Section className="hero-right">
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7 }}
          viewport={{ once: false, amount: 0.4 }}
          className="hero-copy max-wide hero-copy-right"
        >
          <div className="hero-panel">
            <h2 className="hero-title">FORENSIC TRANSPARENCY.</h2>
            <p className="hero-brief">
              Break open the black box. We surface representation gaps and map the exact
              architecture of unfairness across deep neural layers.
            </p>
          </div>
        </motion.div>
      </Section>

      <Section className="hero-center">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75 }}
          viewport={{ once: false, amount: 0.45 }}
          className="hero-copy max-center hero-panel"
        >
          <h2 className="hero-title hero-title-solution">AUTOMATED EQUITY.</h2>
          <p className="hero-brief">
            Real-time mitigation engines that rebalance logic and tune thresholds without
            compromising your model&apos;s predictive performance.
          </p>
        </motion.div>
      </Section>

      <Section className="hero-center final-cta-section">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 30 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.85, ease: 'easeOut' }}
          viewport={{ once: false, amount: 0.5 }}
          className="hero-copy max-center hero-panel"
        >
          <h2 className="hero-title">READY TO AUDIT?</h2>
          <div className="cta-wrapper pointer-events-auto z-50">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="cta-primary cta-analysis"
            >
              START YOUR ANALYSIS
            </button>
          </div>
        </motion.div>
      </Section>
    </div>
  );
}
