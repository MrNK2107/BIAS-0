import React from 'react';
import { motion } from 'framer-motion';

const Section = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <section className={`h-screen flex flex-col justify-center px-12 md:px-24 ${className}`}>
    {children}
  </section>
);

interface UIOverlayProps {
  navigate: (path: string) => void;
}

export default function UIOverlay({ navigate }: UIOverlayProps) {
  return (
    <div className="w-full text-white pointer-events-none">
      {/* 1. HERO */}
      <Section className="items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
        >
          <h1 className="font-display text-7xl md:text-9xl mb-6 tracking-tighter">
            EVERY DECISION<br />
            <span className="text-teal-400">MATTERS.</span>
          </h1>
          <p className="font-sans text-xl md:text-2xl text-slate-400 max-w-2xl mx-auto">
            Decisions are not neutral. They are the sum of patterns hidden in plain sight.
          </p>
        </motion.div>
      </Section>

      {/* 2. THE PROBLEM */}
      <Section className="items-start">
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-xl"
        >
          <h2 className="font-display text-5xl mb-4">HIDDEN BIAS.</h2>
          <p className="font-sans text-lg text-slate-400">
            Bias doesn’t announce itself. It hides in clusters, patterns, and historical echoes.
            See how a single attribute can ripple through a system.
          </p>
        </motion.div>
      </Section>

      {/* 3. DATA AUDIT */}
      <Section className="items-end text-right">
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-xl"
        >
          <h2 className="font-display text-5xl mb-4">DATA AUDIT.</h2>
          <p className="font-sans text-lg text-slate-400">
            We surface what's buried. Group disparities, missing features, and representation gaps.
            Visualizing the architecture of unfairness.
          </p>
        </motion.div>
      </Section>

      {/* 4. MODEL BIAS */}
      <Section className="items-start">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="max-w-xl"
        >
          <h2 className="font-display text-5xl mb-4">MODEL BIAS.</h2>
          <p className="font-sans text-lg text-slate-400">
            Even with "fair" data, models can learn prejudice. 
            Watch how decision engines amplify subtle signals into systemic rejection.
          </p>
        </motion.div>
      </Section>

      {/* 5. EXPLAINABILITY */}
      <Section className="items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          className="max-w-3xl"
        >
          <h2 className="font-display text-6xl mb-6">WHY IT HAPPENED.</h2>
          <p className="font-sans text-xl text-slate-400">
            Proxy features like ZIP codes or browsing habits can become stand-ins for protected groups.
            We break the black box.
          </p>
        </motion.div>
      </Section>

      {/* 6. COUNTERFACTUAL */}
      <Section className="items-start">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-xl"
        >
          <h2 className="font-display text-5xl mb-4">FLIP REALITY.</h2>
          <p className="font-sans text-lg text-slate-400">
            Change the attribute. Change the outcome. 
            Observe how the system treats identical individuals differently based on sensitive traits.
          </p>
        </motion.div>
      </Section>

      {/* 7. STRESS TEST */}
      <Section className="items-end text-right">
        <motion.div
          initial={{ opacity: 0, rotate: -2 }}
          whileInView={{ opacity: 1, rotate: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-xl"
        >
          <h2 className="font-display text-5xl mb-4 text-red-500">SYSTEM FRAGILITY.</h2>
          <p className="font-sans text-lg text-slate-400">
            Fairness is fragile. We perturb the system, inject noise, and shift data distributions
            to see when the logic breaks down.
          </p>
        </motion.div>
      </Section>

      {/* 8. MITIGATION */}
      <Section className="items-start">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-xl"
        >
          <h2 className="font-display text-5xl mb-4 text-teal-400">FIXING BIAS.</h2>
          <p className="font-sans text-lg text-slate-400">
            Threshold tuning. Feature removal. Rebalancing. 
            Watch the system shift from red to green as fairness is restored.
          </p>
        </motion.div>
      </Section>

      {/* 9. MONITORING */}
      <Section className="items-center text-center">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="max-w-3xl"
        >
          <h2 className="font-display text-6xl mb-6">LIVE SYSTEM.</h2>
          <p className="font-sans text-xl text-slate-400">
            Fairness isn’t a one-time check. It’s continuous. 
            Real-time monitoring of every decision, every drift, every alert.
          </p>
        </motion.div>
      </Section>

      {/* 10. FINAL CTA */}
      <Section className="items-center text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="max-w-3xl"
        >
          <h1 className="font-display text-8xl mb-8">AUDIT.<br />UNDERSTAND.<br />CORRECT.</h1>
          <button 
            onClick={() => navigate('/workflow/step-1')}
            className="pointer-events-auto bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold px-12 py-5 rounded-full text-2xl transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(45,212,191,0.3)]"
          >
            START YOUR ANALYSIS
          </button>
        </motion.div>
      </Section>
    </div>
  );
}
