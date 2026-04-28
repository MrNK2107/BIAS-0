import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  BrainCircuit,
  FlaskConical,
  FolderPlus,
  Gauge,
  LayoutDashboard,
  Search,
  Settings2,
  ShieldCheck,
  Upload,
  LayoutGrid,
} from 'lucide-react';
import ProjectSelector from './ProjectSelector';
import { useAppContext } from '../context/AppContext';

const STEPS = [
  { id: 1, to: '/workflow/step-1', label: 'Upload', icon: Upload },
  { id: 2, to: '/workflow/step-2', label: 'Configure', icon: Settings2 },
  { id: 3, to: '/workflow/step-3', label: 'Data Audit', icon: Search },
  { id: 4, to: '/workflow/step-4', label: 'Model Bias', icon: BarChart3 },
  { id: 5, to: '/workflow/step-5', label: 'Explanations', icon: BrainCircuit },
  { id: 6, to: '/workflow/step-6', label: 'Counterfactual', icon: ShieldCheck },
  { id: 7, to: '/workflow/step-7', label: 'Stress Test', icon: Gauge },
  { id: 8, to: '/workflow/step-8', label: 'Sandbox', icon: FlaskConical },
  { id: 9, to: '/workflow/step-9', label: 'Setup Monitor', icon: Settings2 },
  { id: 10, to: '/monitoring', label: 'Live Monitor', icon: Activity },
];

export default function WorkflowShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { maxStep } = useAppContext();

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

        <Link
          to="/dashboard"
          className={`workflow-rail-item ${location.pathname === '/dashboard' ? 'active' : ''}`}
          aria-label="Open dashboard"
          title="Open dashboard"
        >
          <LayoutDashboard size={17} strokeWidth={1.75} />
        </Link>

        <div className="workflow-rail-line" style={{ height: 1, width: '60%', margin: '0 auto' }} />

        <nav className="workflow-rail-nav">
          {STEPS.map((step) => {
            const Icon = step.icon;
            const isActive = location.pathname.includes(step.to);
            const isLocked = step.id > maxStep && step.id > 2;
            // Allow step 1 and 2 always; lock rest until unlocked

            return (
              <Link
                key={step.id}
                to={isLocked ? '#' : step.to}
                className={`workflow-rail-item ${isActive ? 'active' : ''} ${isLocked ? 'locked' : ''}`}
                aria-label={`Step ${step.id}: ${step.label}`}
                title={isLocked ? `Complete previous steps to unlock: ${step.label}` : `Step ${step.id}: ${step.label}`}
                style={{ 
                  opacity: isLocked ? 0.3 : 1,
                  cursor: isLocked ? 'not-allowed' : 'pointer',
                  pointerEvents: isLocked ? 'none' : 'auto'
                }}
              >
                <Icon size={17} strokeWidth={1.75} />
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="workflow-content-area">
        <header className="workflow-topbar" style={{ 
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
          padding: '0 32px', height: 72, background: 'rgba(10, 10, 10, 0.8)',
          backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, zIndex: 100
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <ProjectSelector />
            <div style={{ width: 1, height: 24, background: 'var(--border)', opacity: 0.3 }} />
          </div>

          <div style={{ minWidth: 280, textAlign: 'right' }}>
            <div style={{ 
              color: '#fff', fontWeight: 700, fontSize: '0.95rem', letterSpacing: '1.5px', 
              textTransform: 'uppercase', opacity: 0.9 
            }}>
              {currentLabel}
            </div>
          </div>
        </header>

        <main className="workflow-main">
          <div className="workflow-frame">{children}</div>
        </main>
      </div>

    </div>
  );
}
