import { useEffect } from 'react';
import { motion } from 'framer-motion';
import Header from './Header';
import Features from './Features';
import Stats from './Stats';
import HowItWorks from './HowItWorks';
import Trust from './Trust';
import Footer from './Footer';
import { BiasNetworkHero } from '../hero';

const SectionConnector = () => (
  <div className="section-connector">
    <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="section-connector-svg">
      <defs>
        <linearGradient id="connectorGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#D4A373" stopOpacity="0" />
          <stop offset="50%" stopColor="#D4A373" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#D4A373" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M 50 0 Q 50 30 100 60"
        fill="none"
        stroke="url(#connectorGradient)"
        strokeWidth="0.5"
      />
    </svg>
    <div className="section-connector-particles">
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          className="section-connector-particle"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ delay: i * 0.2, duration: 1 }}
          viewport={{ once: true }}
        />
      ))}
    </div>
  </div>
);

export default function LandingPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="landing-page">
      <Header />
      <BiasNetworkHero />
      <SectionConnector />
      <Features />
      <SectionConnector />
      <Stats />
      <SectionConnector />
      <HowItWorks />
      <SectionConnector />
      <Trust />
      <Footer />
    </div>
  );
}