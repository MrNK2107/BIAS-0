import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import WorkflowShell from './components/WorkflowShell';
import PageTransition from './components/animations/PageTransition';
import BackgroundGrid from './components/animations/BackgroundGrid';
import { useAppContext } from './context/AppContext';
import { useEffect, useRef } from 'react';

const Step1Upload = lazy(() => import('./pages/workflow/Step1Upload'));
const Step2Config = lazy(() => import('./pages/workflow/Step2Config'));
const Step3DataAudit = lazy(() => import('./pages/workflow/Step3DataAudit'));
const Step4ModelBias = lazy(() => import('./pages/workflow/Step4ModelBias'));
const Step5Explanations = lazy(() => import('./pages/workflow/Step5Explanations'));
const Step6Counterfactual = lazy(() => import('./pages/workflow/Step6Counterfactual'));
const Step7StressTest = lazy(() => import('./pages/workflow/Step7StressTest'));
const Step8Sandbox = lazy(() => import('./pages/workflow/Step8Sandbox'));

const Dashboard = lazy(() => import('./pages/Dashboard'));
const HeroPage = lazy(() => import('./pages/HeroPage'));

export default function App() {
  const location = useLocation();
  const { projectId, projects } = useAppContext();
  const hasResumed = useRef(false);

  useEffect(() => {
    if (projectId && projects.length > 0 && !hasResumed.current && location.pathname !== '/dashboard') {
      const p = projects.find(proj => String(proj.id) === String(projectId));
      if (p && p.max_step > 1) {
        if (location.pathname === '/' || location.pathname.startsWith('/workflow')) {
          const resumeStep = Math.min(p.max_step, 8);
          hasResumed.current = true;
          window.location.href = `/workflow/step-${resumeStep}`;
        }
      }
    }
  }, [projectId, projects, location.pathname]);

  return (
    <>
      {location.pathname !== '/' && <BackgroundGrid />}
      <Routes location={location} key={location.pathname === '/' ? 'root' : 'app'}>
        <Route path="/" element={
          <Suspense fallback={null}><PageTransition locationKey="hero"><HeroPage /></PageTransition></Suspense>
        } />
        
        <Route path="/*" element={
          <WorkflowShell>
            <Suspense fallback={<div className="card" style={{ padding: 40, textAlign: 'center' }}><p className="helper">Loading...</p></div>}>
              <Routes location={location} key={location.pathname}>
                <Route path="/dashboard" element={<PageTransition locationKey="dash"><Dashboard /></PageTransition>} />
                
                <Route path="/workflow/step-1" element={<PageTransition locationKey="s1"><Step1Upload /></PageTransition>} />
                <Route path="/workflow/step-2" element={<PageTransition locationKey="s2"><Step2Config /></PageTransition>} />
                <Route path="/workflow/step-3" element={<PageTransition locationKey="s3"><Step3DataAudit /></PageTransition>} />
                <Route path="/workflow/step-4" element={<PageTransition locationKey="s4"><Step4ModelBias /></PageTransition>} />
                <Route path="/workflow/step-5" element={<PageTransition locationKey="s5"><Step5Explanations /></PageTransition>} />
                <Route path="/workflow/step-6" element={<PageTransition locationKey="s6"><Step6Counterfactual /></PageTransition>} />
                <Route path="/workflow/step-7" element={<PageTransition locationKey="s7"><Step7StressTest /></PageTransition>} />
                <Route path="/workflow/step-8" element={<PageTransition locationKey="s8"><Step8Sandbox /></PageTransition>} />
                
                <Route path="*" element={<Navigate to="/workflow/step-1" replace />} />
              </Routes>
            </Suspense>
          </WorkflowShell>
        } />
      </Routes>
    </>
  );
}
