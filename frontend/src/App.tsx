import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import WorkflowShell from './components/WorkflowShell';
import PageTransition from './components/animations/PageTransition';
import BackgroundGrid from './components/animations/BackgroundGrid';
import { useAppContext } from './context/AppContext';
import { useEffect, useRef } from 'react';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import { useAuth } from './context/AuthContext';

const Step1Upload = lazy(() => import('./pages/workflow/Step1Upload'));
const Step2Config = lazy(() => import('./pages/workflow/Step2Config'));
const Step3DataAudit = lazy(() => import('./pages/workflow/Step3DataAudit'));
const Step4ModelBias = lazy(() => import('./pages/workflow/Step4ModelBias'));
const Step5Explanations = lazy(() => import('./pages/workflow/Step5Explanations'));
const Step6Counterfactual = lazy(() => import('./pages/workflow/Step6Counterfactual'));
const Step7StressTest = lazy(() => import('./pages/workflow/Step7StressTest'));
const Step8Sandbox = lazy(() => import('./pages/workflow/Step8Sandbox'));
const Step9Monitoring = lazy(() => import('./pages/workflow/Step9Monitoring'));

const Dashboard = lazy(() => import('./pages/Dashboard'));
const HeroPage = lazy(() => import('./pages/HeroPage'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const Profile = lazy(() => import('./pages/Profile'));
const MonitoringDashboard = lazy(() => import('./pages/MonitoringDashboard'));
const NotFound = lazy(() => import('./pages/NotFound'));

function AuthOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <p className="helper">Loading...</p>
      </div>
    );
  }
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId, projects } = useAppContext();
  const hasResumed = useRef(false);

  useEffect(() => {
    if (projectId && projects.length > 0 && !hasResumed.current && location.pathname !== '/dashboard') {
      const p = projects.find((proj) => String(proj.id) === String(projectId));
      if (p && p.max_step > 1) {
        if (location.pathname === '/' || location.pathname.startsWith('/workflow')) {
          const resumeStep = Math.min(p.max_step, 9);
          hasResumed.current = true;
          const targetPath = `/workflow/step-${resumeStep}`;
          if (location.pathname !== targetPath) {
            navigate(targetPath, { replace: true });
          }
        }
      }
    }
  }, [projectId, projects, location.pathname, navigate]);

  const isAuthPage =
    location.pathname === '/login' || location.pathname === '/signup';
  const isHero = location.pathname === '/';

  return (
    <ErrorBoundary>
      {!isHero && !isAuthPage && <BackgroundGrid />}
      <Routes location={location} key={location.pathname === '/' ? 'root' : 'app'}>
        <Route
          path="/"
          element={
            <Suspense fallback={null}>
              <PageTransition locationKey="hero">
                <HeroPage />
              </PageTransition>
            </Suspense>
          }
        />

        <Route
          path="/login"
          element={
            <AuthOnlyRoute>
              <Suspense fallback={null}>
                <PageTransition locationKey="login">
                  <Login />
                </PageTransition>
              </Suspense>
            </AuthOnlyRoute>
          }
        />
        <Route
          path="/signup"
          element={
            <AuthOnlyRoute>
              <Suspense fallback={null}>
                <PageTransition locationKey="signup">
                  <Signup />
                </PageTransition>
              </Suspense>
            </AuthOnlyRoute>
          }
        />

        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <WorkflowShell>
                <Suspense
                  fallback={
                    <div
                      className="card"
                      style={{ padding: 40, textAlign: 'center' }}
                    >
                      <p className="helper">Loading...</p>
                    </div>
                  }
                >
                  <Routes location={location} key={location.pathname}>
                    <Route
                      path="/dashboard"
                      element={
                        <PageTransition locationKey="dash">
                          <Dashboard />
                        </PageTransition>
                      }
                    />

                    <Route
                      path="/profile"
                      element={
                        <PageTransition locationKey="profile">
                          <Profile />
                        </PageTransition>
                      }
                    />

                    <Route
                      path="/monitoring"
                      element={
                        <PageTransition locationKey="monitoring">
                          <MonitoringDashboard />
                        </PageTransition>
                      }
                    />

                    <Route
                      path="/workflow/step-1"
                      element={
                        <PageTransition locationKey="s1">
                          <Step1Upload />
                        </PageTransition>
                      }
                    />
                    <Route
                      path="/workflow/step-2"
                      element={
                        <PageTransition locationKey="s2">
                          <Step2Config />
                        </PageTransition>
                      }
                    />
                    <Route
                      path="/workflow/step-3"
                      element={
                        <PageTransition locationKey="s3">
                          <Step3DataAudit />
                        </PageTransition>
                      }
                    />
                    <Route
                      path="/workflow/step-4"
                      element={
                        <PageTransition locationKey="s4">
                          <Step4ModelBias />
                        </PageTransition>
                      }
                    />
                    <Route
                      path="/workflow/step-5"
                      element={
                        <PageTransition locationKey="s5">
                          <Step5Explanations />
                        </PageTransition>
                      }
                    />
                    <Route
                      path="/workflow/step-6"
                      element={
                        <PageTransition locationKey="s6">
                          <Step6Counterfactual />
                        </PageTransition>
                      }
                    />
                    <Route
                      path="/workflow/step-7"
                      element={
                        <PageTransition locationKey="s7">
                          <Step7StressTest />
                        </PageTransition>
                      }
                    />
                    <Route
                      path="/workflow/step-8"
                      element={
                        <PageTransition locationKey="s8">
                          <Step8Sandbox />
                        </PageTransition>
                      }
                    />
                    <Route
                      path="/workflow/step-9"
                      element={
                        <PageTransition locationKey="s9">
                          <Step9Monitoring />
                        </PageTransition>
                      }
                    />

                    <Route
                      path="/workflow"
                      element={<Navigate to="/workflow/step-1" replace />}
                    />

                    <Route
                      path="*"
                      element={
                        <PageTransition locationKey="404">
                          <NotFound />
                        </PageTransition>
                      }
                    />
                  </Routes>
                </Suspense>
              </WorkflowShell>
            </ProtectedRoute>
          }
        />
      </Routes>
    </ErrorBoundary>
  );
}
