import React from 'react';
import { motion } from 'framer-motion';
import { Network, Shield, Gauge, Layers, Activity, Scale } from 'lucide-react';

const Section = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <section className={`hero-section h-screen ${className}`}>{children}</section>
);

const LiveBiasFeed = () => {
  const mockData = [
    { id: 1, feature: 'zip_code', risk: 'PROXY', status: 'neutralized' },
    { id: 2, feature: 'education_level', risk: 'LOW', status: 'passed' },
    { id: 3, feature: 'credit_history', risk: 'MEDIUM', status: 'flagged' },
    { id: 4, feature: 'address_area', risk: 'HIGH', status: 'neutralized' },
    { id: 5, feature: 'income_bracket', risk: 'PROXY', status: 'monitoring' },
  ];

  return (
    <div className="live-bias-feed">
      <div className="live-bias-header">
        <Activity className="live-bias-icon" size={14} />
        <span>LIVE BIAS FEED</span>
        <span className="live-bias-live-dot" />
      </div>
      <div className="live-bias-stream">
        {mockData.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: item.id * 0.15 }}
            className={`live-bias-item ${item.status}`}
          >
            <span className="live-bias-feature">{item.feature}</span>
            <span className={`live-bias-risk ${item.risk.toLowerCase()}`}>{item.risk}</span>
            <span className={`live-bias-status ${item.status}`}>{item.status}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

const ForensicBento = () => {
  const cards = [
    {
      icon: Layers,
      title: 'Deep Neural Layer Mapping',
      desc: 'Trace decision paths through 12+ hidden layers to pinpoint exactly where bias propagates.',
      color: '#D4A373',
    },
    {
      icon: Gauge,
      title: 'Real-time Rebalancing Logic',
      desc: 'Adaptive threshold tuning with <50ms latency preserves accuracy while eliminating disparity.',
      color: '#8E9196',
    },
    {
      icon: Shield,
      title: 'Regulatory Compliance',
      desc: 'EU AI Act & GDPR ready. Automated audit trails and documentation for every decision.',
      color: '#BC4749',
    },
  ];

  return (
    <div className="forensic-bento-grid">
      {cards.map((card, i) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.15 }}
          className="forensic-bento-card"
        >
          <div className="forensic-bento-icon" style={{ color: card.color }}>
            <card.icon size={22} />
          </div>
          <h4 className="forensic-bento-title">{card.title}</h4>
          <p className="forensic-bento-desc">{card.desc}</p>
        </motion.div>
      ))}
    </div>
  );
};

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
          className="hero-copy max-wide hero-panel hero-panel-extended"
        >
          <h2 className="hero-title">THE SILENT DRIFT.</h2>
          <p className="hero-brief">
            Bias doesn&apos;t announce itself. It hides in proxy variables, ZIP codes,
            browsing habits, and historical echoes that models silently learn as prejudice.
          </p>
          <LiveBiasFeed />
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
          <ForensicBento />
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
          <div className="cta-wrapper pointer-events-auto z-50 hero-cta-group">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="cta-primary cta-analysis"
            >
              START YOUR ANALYSIS
            </button>
            <button
              type="button"
              className="cta-secondary"
            >
              BOOK A DEMO
            </button>
          </div>
        </motion.div>
      </Section>
    </div>
  );
}