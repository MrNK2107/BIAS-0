import { useEffect, useState } from 'react';
import { Flag, Send } from 'lucide-react';
import Modal from './Modal';

interface FlagDecisionModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void> | void;
  recordId?: string | number;
  recordLabel?: string;
  context?: string;
}

const QUICK_REASONS = [
  'Disparate impact across protected group',
  'Proxy feature likely driving outcome',
  'Counterfactual flip detected',
  'Insufficient evidence for rejection',
  'Other — describe below',
];

export default function FlagDecisionModal({
  open,
  onClose,
  onSubmit,
  recordId,
  recordLabel,
  context,
}: FlagDecisionModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError('Please describe why this decision is being flagged.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(reason.trim());
      onClose();
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? 'Could not flag this decision.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const heading = recordId != null
    ? `Flag Record #${recordId}${recordLabel ? ` — ${recordLabel}` : ''}`
    : 'Flag this decision for review';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={heading}
      size="sm"
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting || !reason.trim()}
          >
            <Send size={14} />
            {submitting ? 'Submitting...' : 'Flag for review'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'rgba(162, 74, 70, 0.14)',
            border: '0.5px solid rgba(162, 74, 70, 0.4)',
            color: 'var(--warning)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Flag size={16} />
        </div>
        <p
          className="helper"
          style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5, paddingTop: 4 }}
        >
          {context ??
            'Flagging sends this record to the Monitoring team for further review. Provide a short, specific reason so reviewers can act quickly.'}
        </p>
      </div>

      <label
        className="stat-label"
        style={{ display: 'block', marginBottom: 8 }}
      >
        Quick reasons
      </label>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          marginBottom: 16,
        }}
      >
        {QUICK_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReason(r === 'Other — describe below' ? '' : r)}
            className="pill"
            style={{
              cursor: 'pointer',
              borderColor:
                reason === r ? 'rgba(200, 157, 124, 0.6)' : 'var(--border)',
              color: reason === r ? 'var(--accent)' : 'var(--text-secondary)',
              background:
                reason === r ? 'rgba(200, 157, 124, 0.12)' : 'rgba(255,255,255,0.02)',
            }}
          >
            {r}
          </button>
        ))}
      </div>

      <label className="stat-label" style={{ display: 'block', marginBottom: 8 }}>
        Reason
      </label>
      <textarea
        className="input"
        rows={4}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Describe what's wrong with this decision..."
        style={{ resize: 'vertical', minHeight: 90, fontFamily: 'inherit' }}
        autoFocus
      />

      {error && (
        <p
          role="alert"
          style={{
            marginTop: 12,
            color: 'var(--warning)',
            fontSize: '0.85rem',
          }}
        >
          {error}
        </p>
      )}
    </Modal>
  );
}
