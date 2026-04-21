import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Activity, BarChart3, Beaker, Home, Scale, Shuffle, Upload, Zap } from 'lucide-react';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import UploadPage from './pages/Upload';
import AuditReport from './pages/AuditReport';
import BiasReport from './pages/BiasReport';
import Counterfactual from './pages/Counterfactual';
import StressTest from './pages/StressTest';
import Sandbox from './pages/Sandbox';
import Monitoring from './pages/Monitoring';

const navItems = [
  { to: '/', label: 'Dashboard', icon: Home },
  { to: '/upload', label: 'Upload', icon: Upload },
  { to: '/audit-report', label: 'Data Audit', icon: BarChart3 },
  { to: '/bias-report', label: 'Bias Analysis', icon: Scale },
  { to: '/counterfactual', label: 'Counterfactual', icon: Shuffle },
  { to: '/stress-test', label: 'Stress Test', icon: Zap },
  { to: '/sandbox', label: 'Sandbox', icon: Beaker },
  { to: '/monitoring', label: 'Monitoring', icon: Activity },
];

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  return (
    <div className="app-shell">
      <Navbar items={navItems} activePath={location.pathname} />
      <main className="main-content">
        <div className="page-frame">{children}</div>
      </main>
    </div>
  );
};

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell><Dashboard /></AppShell>} />
      <Route path="/upload" element={<AppShell><UploadPage /></AppShell>} />
      <Route path="/audit-report" element={<AppShell><AuditReport /></AppShell>} />
      <Route path="/bias-report" element={<AppShell><BiasReport /></AppShell>} />
      <Route path="/counterfactual" element={<AppShell><Counterfactual /></AppShell>} />
      <Route path="/stress-test" element={<AppShell><StressTest /></AppShell>} />
      <Route path="/sandbox" element={<AppShell><Sandbox /></AppShell>} />
      <Route path="/monitoring" element={<AppShell><Monitoring /></AppShell>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
