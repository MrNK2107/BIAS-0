import { motion } from 'framer-motion';

const features = [
  {
    icon: '◉',
    title: 'Data Audit',
    desc: 'Comprehensive statistical analysis of your dataset revealing class imbalances and representation gaps.',
  },
  {
    icon: '◇',
    title: 'Proxy Detection',
    desc: 'Identify features acting as proxies for protected attributes using correlation and clustering analysis.',
  },
  {
    icon: '△',
    title: 'Model Bias Analysis',
    desc: 'Measure Demographic Parity and Equal Opportunity gaps across all demographic groups.',
  },
  {
    icon: '□',
    title: 'SHAP Explanations',
    desc: 'Explain individual predictions with feature importance scores and counterfactual narratives.',
  },
  {
    icon: '○',
    title: 'Counterfactual Testing',
    desc: 'Flip sensitive attributes to measure decision variance and identify discriminatory patterns.',
  },
  {
    icon: '⬡',
    title: 'Stress Testing',
    desc: 'Subject your model to extreme conditions: minority undersampling, label noise, and distribution shift.',
  },
];

export default function Features() {
  return (
    <section id="features" className="landing-section">
      <div className="landing-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="landing-section-header"
        >
          <span className="kicker">Capabilities</span>
          <h2 className="section-title landing-section-title">
            Full-Stack Fairness Engine
          </h2>
          <p className="landing-section-desc">
            From data ingestion to automated remediation, every stage of the bias 
            detection pipeline is handled in a single unified compute sweep.
          </p>
        </motion.div>

        <div className="landing-features-grid">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              viewport={{ once: true }}
              className="card landing-feature-card"
            >
              <div className="landing-feature-icon">{feature.icon}</div>
              <h3 className="landing-feature-title">{feature.title}</h3>
              <p className="landing-feature-desc">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}