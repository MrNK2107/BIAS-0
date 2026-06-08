import { Link } from 'react-router-dom';
import { Compass, Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '70vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: 540,
          width: '100%',
          textAlign: 'center',
          padding: '56px 32px',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'rgba(200, 157, 124, 0.1)',
            border: '0.5px solid rgba(200, 157, 124, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 18px',
            color: 'var(--accent)',
          }}
        >
          <Compass size={32} />
        </div>
        <div className="kicker" style={{ marginBottom: 12 }}>404</div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2.2rem',
            fontWeight: 700,
            margin: 0,
            marginBottom: 12,
            color: 'var(--text-primary)',
          }}
        >
          Page not found
        </h1>
        <p
          className="helper"
          style={{
            maxWidth: 420,
            margin: '0 auto 24px',
            fontSize: '0.98rem',
            lineHeight: 1.55,
          }}
        >
          The page you're looking for doesn't exist or has been moved. Let's get you back on
          the audit trail.
        </p>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <Link to="/dashboard" className="btn btn-primary">
            <Home size={14} /> Dashboard
          </Link>
          <button
            className="btn"
            onClick={() => window.history.back()}
          >
            <ArrowLeft size={14} /> Go back
          </button>
        </div>
      </div>
    </div>
  );
}
