import { motion } from 'framer-motion';

const steps = [
  {
    num: '01',
    title: 'Upload Data',
    desc: 'Drop your CSV. We parse headers and extract column metadata instantly.',
  },
  {
    num: '02',
    title: 'Configure',
    desc: 'Select sensitive columns, target variable, and fairness priorities.',
  },
  {
    num: '03',
    title: 'Analyze',
    desc: '8-stage pipeline runs: audit, proxy detection, bias, SHAP, counterfactual, stress, fix.',
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="landing-section landing-how-section">
      <div className="landing-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="landing-section-header"
        >
          <span className="kicker">Workflow</span>
          <h2 className="section-title landing-section-title">
            Three Steps to Compliance
          </h2>
        </motion.div>

        <div className="landing-steps">
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              viewport={{ once: true }}
              className="landing-step"
            >
              <div className="landing-step-num">{step.num}</div>
              <h3 className="landing-step-title">{step.title}</h3>
              <p className="landing-step-desc">{step.desc}</p>
              {i < steps.length - 1 && <div className="landing-step-line" />}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}