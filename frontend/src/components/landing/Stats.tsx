import { motion } from 'framer-motion';

const stats = [
  { value: '10K+', label: 'Audits Completed' },
  { value: '98%', label: 'Detection Accuracy' },
  { value: '45s', label: 'Avg. Analysis Time' },
  { value: '12M+', label: 'Records Processed' },
];

export default function Stats() {
  return (
    <section className="landing-stats-section">
      <div className="landing-container">
        <div className="landing-stats-grid">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              viewport={{ once: true }}
              className="landing-stat-item"
            >
              <span className="stat-number">{stat.value}</span>
              <span className="stat-label">{stat.label}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}