import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

interface EmptyStateProps {
  icon?: ReactNode;
  kicker?: string;
  title: string;
  description: string;
  primaryAction?: { label: string; to: string; onClick?: () => void };
  secondaryAction?: { label: string; to?: string; onClick?: () => void };
  children?: ReactNode;
  compact?: boolean;
}

export default function EmptyState({
  icon,
  kicker,
  title,
  description,
  primaryAction,
  secondaryAction,
  children,
  compact = false,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      className="empty-state"
      data-compact={compact ? "true" : "false"}
    >
      <div className="empty-state-rule" aria-hidden="true" />

      {icon && <div className="empty-state-icon">{icon}</div>}

      {kicker && <div className="empty-state-kicker">{kicker}</div>}

      <h2 className="empty-state-title">{title}</h2>

      <p className="empty-state-description">{description}</p>

      {children && <div className="empty-state-body">{children}</div>}

      {(primaryAction || secondaryAction) && (
        <div className="empty-state-actions">
          {primaryAction &&
            (primaryAction.onClick ? (
              <button
                className="btn btn-primary"
                onClick={primaryAction.onClick}
              >
                {primaryAction.label}
                <ArrowRight size={15} />
              </button>
            ) : (
              <Link to={primaryAction.to} className="btn btn-primary">
                {primaryAction.label}
                <ArrowRight size={15} />
              </Link>
            ))}
          {secondaryAction &&
            (secondaryAction.onClick ? (
              <button
                className="btn btn-ghost"
                onClick={secondaryAction.onClick}
              >
                {secondaryAction.label}
              </button>
            ) : secondaryAction.to ? (
              <Link to={secondaryAction.to} className="btn btn-ghost">
                {secondaryAction.label}
              </Link>
            ) : null)}
        </div>
      )}
    </motion.div>
  );
}
