import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signup, getIdTokenCurrent, mapAuthError } from "../firebase/auth";
import { api } from "../api/client";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (password.length < 6) {
        throw new Error("Password must be at least 6 characters");
      }
      await signup(email, password, name);
      const token = await getIdTokenCurrent();
      if (token) {
        api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      }
      navigate("/dashboard");
    } catch (err) {
      if (
        err instanceof Error &&
        err.message === "Password must be at least 6 characters"
      ) {
        setError(err.message);
      } else {
        const msg = mapAuthError(err);
        if (msg) setError(msg);
        else setError("Signup failed");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <img src="/logo.png" alt="BIAS LAB" className="auth-logo" />
          <h1 className="auth-title">BIAS LAB</h1>
          <p className="auth-subtitle">Create your account</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          <label className="auth-label">Name</label>
          <input
            type="text"
            className="auth-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            required
          />

          <label className="auth-label">Email</label>
          <input
            type="email"
            className="auth-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />

          <label className="auth-label">Password</label>
          <input
            type="password"
            className="auth-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            required
            minLength={6}
          />

          <button type="submit" className="auth-btn" disabled={submitting}>
            {submitting ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
