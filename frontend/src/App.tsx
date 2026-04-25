import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import WorkflowShell from './components/WorkflowShell';
import Step1Upload from './pages/workflow/Step1Upload';
import Step2Config from './pages/workflow/Step2Config';
import Step3DataAudit from './pages/workflow/Step3DataAudit';
import Step4ModelBias from './pages/workflow/Step4ModelBias';
import Step5Explanations from './pages/workflow/Step5Explanations';
import Step6Counterfactual from './pages/workflow/Step6Counterfactual';
import Step7StressTest from './pages/workflow/Step7StressTest';
import Step8Sandbox from './pages/workflow/Step8Sandbox';
import Step9Monitoring from './pages/workflow/Step9Monitoring';

import Dashboard from './pages/Dashboard';
import HeroPage from './pages/HeroPage';
import PageTransition from './components/animations/PageTransition';
import BackgroundGrid from './components/animations/BackgroundGrid';

export default function App() {
  const location = useLocation();

  return (
    <>
      {location.pathname !== '/' && <BackgroundGrid />}
      <Routes location={location} key={location.pathname === '/' ? 'root' : 'app'}>
        <Route path="/" element={<PageTransition locationKey="hero"><HeroPage /></PageTransition>} />
        
        <Route path="/*" element={
          <WorkflowShell>
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
              <Route path="/workflow/step-9" element={<PageTransition locationKey="s9"><Step9Monitoring /></PageTransition>} />
              
              <Route path="*" element={<Navigate to="/workflow/step-1" replace />} />
            </Routes>
          </WorkflowShell>
        } />
      </Routes>
    </>
  );
}
