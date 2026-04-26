import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  BrainCircuit,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  Search,
  Settings2,
  ShieldCheck,
  Upload,
} from 'lucide-react';

const STEPS = [
  { id: 1, to: '/workflow/step-1', label: 'Upload', icon: Upload },
  { id: 2, to: '/workflow/step-2', label: 'Configure', icon: Settings2 },
  { id: 3, to: '/workflow/step-3', label: 'Data Audit', icon: Search },
  { id: 4, to: '/workflow/step-4', label: 'Model Bias', icon: BarChart3 },
  { id: 5, to: '/workflow/step-5', label: 'Explanations', icon: BrainCircuit },
  { id: 6, to: '/workflow/step-6', label: 'Counterfactual', icon: ShieldCheck },
  { id: 7, to: '/workflow/step-7', label: 'Stress Test', icon: Gauge },
  { id: 8, to: '/workflow/step-8', label: 'Sandbox', icon: FlaskConical },
  { id: 9, to: '/workflow/step-9', label: 'Monitoring', icon: Activity },
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
      <aside className="workflow-rail" aria-label="Workflow navigation">
        <Link to="/" className="workflow-rail-brand" aria-label="Unbiased AI home">
          ◈
        </Link>

        <div className="workflow-rail-line" />

        <nav className="workflow-rail-nav">
          {STEPS.map((step) => {
            const Icon = step.icon;
            const isActive = location.pathname.includes(step.to);
            return (
              <Link
                key={step.id}
                to={step.to}
                className={`workflow-rail-item ${isActive ? 'active' : ''}`}
                aria-label={`Step ${step.id}: ${step.label}`}
                title={`Step ${step.id}: ${step.label}`}
              >
                <Icon size={17} strokeWidth={1.75} />
              </Link>
            );
          })}
        </nav>

        <div className="workflow-rail-line" />

        <Link
          to={isDashboard ? '/workflow/step-1' : '/dashboard'}
          className="workflow-rail-item workflow-rail-dashboard"
          aria-label={isDashboard ? 'Open workflow' : 'Open dashboard'}
          title={isDashboard ? 'Open workflow' : 'Open dashboard'}
        >
          <LayoutDashboard size={17} strokeWidth={1.75} />
        </Link>
      </aside>

      <div className="workflow-content-area">
        <header className="workflow-topbar">
          <div className="workflow-brand">
            <div className="workflow-brand-badge">◈</div>
            <div className="workflow-brand-text">
              <strong>Unbiased AI</strong>
              <span>INTELLIGENCE ENGINE</span>
            </div>
          </div>

          <div className="workflow-breadcrumb">
            <span className="workflow-breadcrumb-kicker">{isDashboard ? 'Workspace' : 'Workflow'}</span>
            <span className="workflow-breadcrumb-label">{currentLabel}</span>
            <span className="workflow-breadcrumb-meta">{currentMeta}</span>
          </div>

          <div className="workflow-step-indicator" aria-hidden={isDashboard}>
            <div className="workflow-step-track">
              <div className="workflow-step-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span>{isDashboard ? 'Dashboard' : `Step ${currentStep.id} / ${STEPS.length}`}</span>
          </div>
        </header>

        <main className="workflow-main">
          <div className="workflow-frame">{children}</div>
        </main>
      </div>

    </div>
  );
}
