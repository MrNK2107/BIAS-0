import { Link, useLocation } from 'react-router-dom';
import { 
  Upload, 
  Settings, 
  BarChart3, 
  Scale, 
  FileSearch, 
  Shuffle, 
  Zap, 
  Beaker, 
  Activity 
} from 'lucide-react';

const workflowSteps = [
  { id: 1, to: '/workflow/step-1', label: 'Upload Dataset', icon: Upload },
  { id: 2, to: '/workflow/step-2', label: 'Configuration', icon: Settings },
  { id: 3, to: '/workflow/step-3', label: 'Data Audit', icon: BarChart3 },
  { id: 4, to: '/workflow/step-4', label: 'Model Bias', icon: Scale },
  { id: 5, to: '/workflow/step-5', label: 'Explanations', icon: FileSearch },
  { id: 6, to: '/workflow/step-6', label: 'Counterfactual', icon: Shuffle },
  { id: 7, to: '/workflow/step-7', label: 'Stress Test', icon: Zap },
  { id: 8, to: '/workflow/step-8', label: 'Sandbox', icon: Beaker },
  { id: 9, to: '/workflow/step-9', label: 'Monitoring', icon: Activity },
];

export default function WorkflowShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const currentStepId = workflowSteps.find(s => location.pathname.includes(s.to))?.id || 1;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-badge">◈</div>
          <div>
            <strong>Unbiased AI</strong>
            <span>FAIRNESS SUITE</span>
          </div>
        </div>
        <div className="nav-group">
          <div className="nav-label">Audit Workflow</div>
          {workflowSteps.map((step) => {
            const Icon = step.icon;
            const isActive = currentStepId === step.id;
            const isPast = currentStepId > step.id;
            
            return (
              <Link 
                key={step.to} 
                to={step.to} 
                className={`nav-link ${isActive ? 'active' : ''}`}
                style={{ 
                  opacity: isPast ? 0.8 : (isActive ? 1 : 0.5),
                  pointerEvents: isPast || isActive ? 'auto' : 'none' // Prevent skipping ahead freely unless they know the URL, or we can just leave it open
                }}
              >
                <Icon size={16} />
                <span>{step.id}. {step.label}</span>
                {isPast && <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--green)' }}>✔</span>}
              </Link>
            );
          })}
        </div>
      </aside>
      <main className="main-content">
        <div className="page-frame">{children}</div>
      </main>
    </div>
  );
}
