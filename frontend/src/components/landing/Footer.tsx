import { useNavigate } from 'react-router-dom';

export default function Footer() {
  const navigate = useNavigate();

  return (
    <footer className="landing-footer">
      <div className="landing-container">
        <div className="landing-footer-grid">
          <div className="landing-footer-brand">
            <div className="landing-brand">
              <img src="/logo.png" alt="BIAS LAB Logo" className="landing-brand-logo" style={{ width: '32px', height: '32px', marginRight: '10px' }} />
              <span className="landing-brand-text">BIAS</span>
              <span className="landing-brand-tag">LAB</span>
            </div>
            <p className="landing-footer-tagline">
              Algorithmic fairness at enterprise scale.
            </p>
          </div>

          <div className="landing-footer-links">
            <div className="landing-footer-col">
              <h4>Product</h4>
              <a href="#features">Features</a>
              <a href="#how-it-works">How It Works</a>
              <a href="#trust">Customers</a>
            </div>
            <div className="landing-footer-col">
              <h4>Company</h4>
              <a href="#">About</a>
              <a href="#">Careers</a>
              <a href="#">Contact</a>
            </div>
            <div className="landing-footer-col">
              <h4>Legal</h4>
              <a href="#">Privacy</a>
              <a href="#">Terms</a>
              <a href="#">Security</a>
            </div>
          </div>
        </div>

        <div className="landing-footer-bottom">
          <p>© 2026 BIAS.LAB. All rights reserved.</p>
          <button className="btn btn-ghost btn-small" onClick={() => navigate('/dashboard')}>
            Start Your Analysis →
          </button>
        </div>
      </div>
    </footer>
  );
}