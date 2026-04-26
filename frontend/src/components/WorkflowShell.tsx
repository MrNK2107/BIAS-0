import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard } from 'lucide-react';

const STEPS = [
  { id: 1, to: '/workflow/step-1', label: 'Upload' },
  { id: 2, to: '/workflow/step-2', label: 'Configure' },
  { id: 3, to: '/workflow/step-3', label: 'Data Audit' },
  { id: 4, to: '/workflow/step-4', label: 'Model Bias' },
  { id: 5, to: '/workflow/step-5', label: 'Explanations' },
  { id: 6, to: '/workflow/step-6', label: 'Counterfactual' },
  { id: 7, to: '/workflow/step-7', label: 'Stress Test' },
  { id: 8, to: '/workflow/step-8', label: 'Sandbox' },
  { id: 9, to: '/workflow/step-9', label: 'Monitoring' },
];

export default function WorkflowShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  const isDashboard = location.pathname === '/dashboard';
  const currentStep = STEPS.find((step) => location.pathname.includes(step.to)) || STEPS[0];
  const currentIdx = Math.max(STEPS.indexOf(currentStep), 0);
  const progressPct = isDashboard ? 0 : (currentIdx / Math.max(STEPS.length - 1, 1)) * 100;
  const currentLabel = isDashboard ? 'Dashboard overview' : currentStep.label;
  const currentMeta = isDashboard ? 'Workspace' : `Step ${currentStep.id} of ${STEPS.length}`;

  return (
    <div className="workflow-shell">
      <header className="workflow-topbar">
        <Link to="/" className="workflow-brand" aria-label="Unbiased AI home">
          <div className="workflow-brand-badge">◈</div>
          <div className="workflow-brand-text">
            <strong>Unbiased AI</strong>
            <span>FAIRNESS SUITE</span>
          </div>
        </Link>

        <div className="workflow-breadcrumb">
          <span className="workflow-breadcrumb-kicker">{isDashboard ? 'Workspace' : 'Workflow'}</span>
          <span className="workflow-breadcrumb-label">{currentLabel}</span>
          <span className="workflow-breadcrumb-meta">{currentMeta}</span>
        </div>

        <div className="workflow-topbar-actions">
          <Link to={isDashboard ? '/workflow/step-1' : '/dashboard'} className="btn btn-ghost btn-small" style={{ gap: 6 }}>
            <LayoutDashboard size={14} /> {isDashboard ? 'Open workflow' : 'Dashboard'}
          </Link>
        </div>
      </header>

      <div className="workflow-progress-rail">
        <div className="workflow-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      <main className="workflow-main">
        <div className="workflow-frame">
          {children}
        </div>
      </main>
    </div>
  );
}
