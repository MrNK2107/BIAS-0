import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Caught:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '60vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 560,
              width: '100%',
              textAlign: 'center',
              padding: '40px 32px',
              borderColor: 'rgba(162, 74, 70, 0.4)',
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'rgba(162, 74, 70, 0.12)',
                border: '0.5px solid rgba(162, 74, 70, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 18px',
                color: 'var(--warning)',
              }}
            >
              <AlertTriangle size={28} />
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.5rem',
                marginBottom: 10,
                color: 'var(--text-primary)',
              }}
            >
              {this.props.fallbackTitle ?? 'Something went wrong'}
            </h2>
            <p
              className="helper"
              style={{ maxWidth: 440, margin: '0 auto 18px', fontSize: '0.95rem' }}
            >
              An unexpected error occurred while rendering this view. The rest of the app is still
              working. You can retry or head back to the dashboard.
            </p>
            {this.state.error && (
              <pre
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '0.5px solid var(--border)',
                  borderRadius: 8,
                  padding: 12,
                  fontSize: '0.78rem',
                  color: 'var(--warning)',
                  textAlign: 'left',
                  maxHeight: 140,
                  overflow: 'auto',
                  margin: '0 0 22px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {this.state.error.message}
              </pre>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn" onClick={this.handleReset}>
                <RotateCcw size={14} /> Try Again
              </button>
              <Link to="/dashboard" className="btn btn-primary">
                <Home size={14} /> Dashboard
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
