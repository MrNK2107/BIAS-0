import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`landing-header ${scrolled ? "is-scrolled" : ""}`}
    >
      <div className="landing-header-inner">
        <div className="landing-brand" onClick={() => navigate("/")}>
          <img
            src="/logo.png"
            alt="BIAS LAB Logo"
            className="landing-brand-logo-img"
            style={{ width: "28px", height: "28px" }}
          />
          <span className="landing-brand-text">BIAS</span>
          <span className="landing-brand-tag">LAB</span>
        </div>

        <nav className="landing-nav">
          <a href="#features" className="landing-nav-link">
            Features
          </a>
          <a href="#how-it-works" className="landing-nav-link">
            How It Works
          </a>
          <a href="#trust" className="landing-nav-link">
            Case Studies
          </a>
          <a href="#" className="landing-nav-link">
            Documentation
          </a>
        </nav>

        <div className="landing-header-actions">
          <button
            className="btn btn-ghost btn-small landing-login-btn"
            onClick={() => navigate("/login")}
          >
            Sign In
          </button>
          <button
            className="btn btn-primary btn-small"
            onClick={() => navigate("/signup")}
          >
            Get Started
          </button>
          <button
            className="btn btn-secondary btn-small"
            onClick={() => navigate("/dashboard")}
          >
            Demo
          </button>
        </div>
      </div>
    </motion.header>
  );
}
