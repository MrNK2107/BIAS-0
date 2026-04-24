import { Navigate, Route, Routes } from 'react-router-dom';
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

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WorkflowShell><Dashboard /></WorkflowShell>} />
      
      <Route path="/workflow/step-1" element={<WorkflowShell><Step1Upload /></WorkflowShell>} />
      <Route path="/workflow/step-2" element={<WorkflowShell><Step2Config /></WorkflowShell>} />
      <Route path="/workflow/step-3" element={<WorkflowShell><Step3DataAudit /></WorkflowShell>} />
      <Route path="/workflow/step-4" element={<WorkflowShell><Step4ModelBias /></WorkflowShell>} />
      <Route path="/workflow/step-5" element={<WorkflowShell><Step5Explanations /></WorkflowShell>} />
      <Route path="/workflow/step-6" element={<WorkflowShell><Step6Counterfactual /></WorkflowShell>} />
      <Route path="/workflow/step-7" element={<WorkflowShell><Step7StressTest /></WorkflowShell>} />
      <Route path="/workflow/step-8" element={<WorkflowShell><Step8Sandbox /></WorkflowShell>} />
      <Route path="/workflow/step-9" element={<WorkflowShell><Step9Monitoring /></WorkflowShell>} />
      
      <Route path="*" element={<Navigate to="/workflow/step-1" replace />} />
    </Routes>
  );
}
