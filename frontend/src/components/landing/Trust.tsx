import { motion } from 'framer-motion';

export default function Trust() {
  const companies = [
    'NEXUS LABS', 'VERTEX AI', 'QUANTUM9', 'CYBELE', 'SYNTHESIS', 'NEURA CORP', 'COGNIFY', 'ATLAS ML'
  ];

  const duplicatedCompanies = [...companies, ...companies, ...companies];

  return (
    <section id="trust" className="landing-trust-section">
      <div className="landing-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="landing-trust-header"
        >
          <span className="kicker">Trusted By</span>
          <p className="landing-trust-sub">
            Innovative AI teams rely on BIAS.LAB for algorithmic fairness
          </p>
        </motion.div>

        <div className="landing-trust-ticker-wrapper">
          <motion.div
            className="landing-trust-ticker"
            initial={{ x: 0 }}
            animate={{ x: '-33.33%' }}
            transition={{
              duration: 20,
              repeat: Infinity,
              ease: 'linear'
            }}
          >
            {duplicatedCompanies.map((company, i) => (
              <div key={i} className="landing-trust-ticker-item">
                <span className="landing-trust-ticker-logo" />
                <span className="landing-trust-ticker-name">{company}</span>
              </div>
            ))}
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          viewport={{ once: true }}
          className="card card-primary landing-testimonial"
        >
          <p className="landing-testimonial-text">
            "BIAS.LAB helped us identify and mitigate proxy discrimination in our
            hiring model within hours. The automated fix recommendations saved us
            weeks of manual debugging."
          </p>
          <div className="landing-testimonial-author">
            <span className="landing-testimonial-name">Sarah Chen</span>
            <span className="landing-testimonial-role">Head of AI Ethics, TechFlow</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}