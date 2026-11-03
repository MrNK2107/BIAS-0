import React, { useCallback, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  BrainCircuit,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  Search,
  Settings2,
  ShieldCheck,
  Upload,
  Activity,
  Shield,
  GitCompare,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  FileCheck2,
  Users,
} from "lucide-react";
import Hallmark from "./brand/Hallmark";
import ProjectSelector from "./ProjectSelector";
import UserMenu from "./UserMenu";
import { useAppContext } from "../context/AppContext";
import ChatButton from "./chatbot/ChatButton";
import ChatbotPanel from "./chatbot/ChatbotPanel";
import ExplainPanel from "./ExplainPanel";

export const START_ANALYSIS_EVENT = "bias:start-analysis";

const STEPS = [
  { id: 1, to: "/workflow/step-1", label: "Upload", icon: Upload },
  { id: 2, to: "/workflow/step-2", label: "Configure", icon: Settings2 },
  { id: 3, to: "/workflow/step-3", label: "Data Audit", icon: Search },
  { id: 4, to: "/workflow/step-4", label: "Model Bias", icon: BarChart3 },
  { id: 5, to: "/workflow/step-5", label: "Explanations", icon: BrainCircuit },
  { id: 6, to: "/workflow/step-6", label: "Counterfactual", icon: ShieldCheck },
  { id: 7, to: "/workflow/step-7", label: "Stress Test", icon: Gauge },
  { id: 8, to: "/workflow/step-8", label: "Sandbox", icon: FlaskConical },
  { id: 9, to: "/workflow/step-9", label: "Monitoring", icon: Activity },
];

const WORKSPACE_ITEMS = [
  { to: "/assurance", label: "Outcome Audit", icon: FileCheck2 },
  { to: "/paired", label: "Paired Test", icon: Users },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/compliance", label: "Compliance", icon: Shield },
  { to: "/versions", label: "Versions", icon: GitCompare },
];

function isStepPage(pathname: string): boolean {
  return pathname.startsWith("/workflow/step-");
}

function getCurrentStep(pathname: string): number {
  const match = pathname.match(/\/workflow\/step-(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

export default function WorkflowShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { maxStep, projectId, advanceStep, file, isAnalyzing, pipelineResults } = useAppContext();

  // Phones: the rail is one horizontally scrolling row, so bring the current page's item into view.
  useEffect(() => {
    if (window.innerWidth > 720) return;
    // After the rail's enter animation has laid it out.
    const t = window.setTimeout(() => {
      const item = document.querySelector<HTMLElement>(".workflow-rail-item.active");
      const rail = item?.closest<HTMLElement>(".workflow-rail");
      if (!item || !rail) return;
      const left = item.getBoundingClientRect().left - rail.getBoundingClientRect().left + rail.scrollLeft;
      rail.scrollLeft = Math.max(0, left - (rail.clientWidth - item.offsetWidth) / 2);
    }, 350);
    return () => window.clearTimeout(t);
  }, [location.pathname]);

  // ── Collapse state ──────────────────────────────────────────────────────
  const [collapsed, setCollapsed] = React.useState(() => {
    const saved = localStorage.getItem("sidebar_collapsed");
    return saved === "true";
  });

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar_collapsed", String(next));
      return next;
    });
  }, []);

  // ── Current step detection ──────────────────────────────────────────────
  const isStep = isStepPage(location.pathname);
  const currentStepNum = getCurrentStep(location.pathname);
  const currentStep = STEPS.find((s) => s.id === currentStepNum);

  const isWorkspacePage =
    location.pathname === "/dashboard" ||
    location.pathname === "/assurance" ||
    location.pathname === "/paired" ||
    location.pathname === "/compliance" ||
    location.pathname === "/versions" ||
    location.pathname === "/monitoring" ||
    location.pathname === "/profile" ||
    location.pathname === "/create-project";

  const topLabel = isWorkspacePage
    ? "Workspace"
    : isStep
      ? (currentStep?.label ?? "Step")
      : "";
  const topMeta = isStep
    ? `Step ${currentStepNum} of ${STEPS.length}`
    : "";

  // ── Prev / Next navigation ──────────────────────────────────────────────
  // React Router applies navigations inside startTransition. While the target
  // step's lazy chunk is still loading, React keeps rendering the old step and
  // `location` (so currentStepNum) stays stale even though window.location has
  // already changed. A Next click in that window used to be handled for the
  // old step: it re-navigated to the step already being loaded, so the
  // workflow silently stopped advancing. Remember which location a step
  // navigation started from and block step navigation until the router has
  // committed a new location (every push gets a new location.key).
  const [navFromKey, setNavFromKey] = React.useState<string | null>(null);
  const navPending = navFromKey !== null && navFromKey === location.key;

  const goToStep = useCallback(
    (to: string) => {
      setNavFromKey(location.key);
      navigate(to);
    },
    [location.key, navigate],
  );

  const handlePrev = useCallback(() => {
    if (navPending || !isStep || currentStepNum <= 1) return;
    goToStep(`/workflow/step-${currentStepNum - 1}`);
  }, [navPending, isStep, currentStepNum, goToStep]);

  const handleNext = useCallback(async () => {
    if (navPending || !isStep || currentStepNum >= STEPS.length) return;
    const nextStep = currentStepNum + 1;
    if (currentStepNum === 1 && !file && !pipelineResults) return; // need file first

    // Step 2 → 3: analysis must be triggered from Step2Config's "Start Full Analysis" button.
    // The shell's Next button only navigates if analysis has already completed.
    if (currentStepNum === 2 && nextStep > maxStep) {
      // Step2Config owns the analysis (it saves the config first), so ask it
      // to start. This button used to return here and do nothing at all.
      if (!isAnalyzing) window.dispatchEvent(new Event(START_ANALYSIS_EVENT));
      return;
    }

    if (nextStep > maxStep && nextStep > 2) return; // locked
    advanceStep(nextStep);
    goToStep(`/workflow/step-${nextStep}`);
  }, [navPending, isStep, currentStepNum, maxStep, goToStep, advanceStep, file, isAnalyzing, pipelineResults]);

  const prevDisabled = navPending || !isStep || currentStepNum <= 1;
  const nextLocked =
    navPending ||
    !isStep ||
    currentStepNum >= STEPS.length ||
    (currentStepNum === 1 && !file && !pipelineResults) ||
    isAnalyzing ||
    // Step 2: locked if no file AND no pipeline data
    (currentStepNum === 2 && !file && !pipelineResults) ||
    // Other steps: respect maxStep
    (currentStepNum > 2 && currentStepNum + 1 > maxStep && currentStepNum + 1 > 2);

  // ── Sidebar width animation ─────────────────────────────────────────────
  const railWidth = collapsed ? 64 : 220;

  return (
    <div className="workflow-shell" style={{ gridTemplateColumns: `${railWidth}px 1fr` }}>
      <motion.aside
        className="workflow-rail"
        aria-label="Workflow navigation"
        animate={{ width: railWidth }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Brand */}
        <Link to="/" className="workflow-rail-brand" aria-label="BIAS-0 home">
          <span style={{ flexShrink: 0, display: "inline-flex" }}>
            <Hallmark mark="0" size={28} ring="BIAS-0 · ASSURANCE · BIAS-0 · ASSURANCE ·" label="BIAS-0" />
          </span>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="workflow-rail-brand-text"
              >
                BIAS-0
              </motion.span>
            )}
          </AnimatePresence>
        </Link>

        <div className="workflow-rail-divider" />

        {/* Workspace nav group */}
        {!collapsed && <div className="workflow-rail-section-label">Workspace</div>}
        <nav className="workflow-rail-nav">
          {WORKSPACE_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to;
            const isLocked = !projectId && item.to !== "/dashboard" && item.to !== "/assurance" && item.to !== "/paired";
            return (
              <NavItem
                key={item.to}
                to={isLocked ? "#" : item.to}
                icon={<Icon size={17} strokeWidth={1.75} />}
                label={item.label}
                isActive={isActive}
                isLocked={isLocked}
                collapsed={collapsed}
              />
            );
          })}
        </nav>

        <div className="workflow-rail-divider" />

        {/* Pipeline nav group */}
        {!collapsed && <div className="workflow-rail-section-label">Pipeline</div>}
        <nav className="workflow-rail-nav">
          {STEPS.map((step) => {
            const Icon = step.icon;
            const isActive = location.pathname.includes(step.to);
            const isLocked = !projectId || (step.id > maxStep && step.id > 2) || (step.id === 2 && !file && !pipelineResults);
            return (
              <NavItem
                key={step.id}
                to={isLocked ? "#" : step.to}
                icon={<Icon size={17} strokeWidth={1.75} />}
                label={step.label}
                isActive={isActive}
                isLocked={isLocked}
                collapsed={collapsed}
                badge={`${step.id}`}
                title={
                  isLocked
                    ? `Complete previous steps to unlock: ${step.label}`
                    : `Step ${step.id}: ${step.label}`
                }
              />
            );
          })}
        </nav>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Collapse toggle */}
        <button
          className="workflow-rail-toggle"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeft size={16} strokeWidth={1.5} />
          ) : (
            <PanelLeftClose size={16} strokeWidth={1.5} />
          )}
          {!collapsed && (
            <span className="workflow-rail-toggle-label">Collapse</span>
          )}
        </button>
      </motion.aside>

      <div className="workflow-content-area">
        {/* Top bar */}
        <header className="workflow-topbar">
          <div className="workflow-topbar-left">
            <ProjectSelector />
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.25 }}
              className="workflow-topbar-center"
            >
              <div className="workflow-topbar-label">{topLabel}</div>
              {topMeta && (
                <div className="workflow-topbar-meta">{topMeta}</div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="workflow-topbar-right">
            <UserMenu />
          </div>
        </header>

        {/* Main content */}
        <main className="workflow-main">
          <div className="workflow-frame">{children}</div>
        </main>

        {/* Prev / Next footer — only on step pages */}
        {isStep && (
          <div className="workflow-nav-footer">
            <button
              className="btn btn-secondary"
              disabled={prevDisabled}
              onClick={handlePrev}
            >
              <ChevronLeft size={16} /> Previous
            </button>

            <div className="workflow-nav-footer-center">
              <div className="workflow-nav-footer-steps">
                {STEPS.map((step) => (
                  <span
                    key={step.id}
                    className={`workflow-nav-footer-dot ${step.id === currentStepNum ? "active" : ""} ${(step.id <= maxStep || step.id <= 2) && (step.id !== 2 || file) ? "completed" : ""}`}
                    onClick={() => {
                      const stepAccessible = step.id <= maxStep || step.id <= 2;
                      const fileOk = step.id !== 2 || !!file || !!pipelineResults;
                      if (stepAccessible && fileOk && !navPending) {
                        goToStep(step.to);
                      }
                    }}
                    title={step.label}
                  />
                ))}
              </div>
            </div>

            <button
              className="btn btn-primary"
              disabled={nextLocked}
              aria-busy={navPending || undefined}
              onClick={handleNext}
            >
              {currentStepNum === 2 && maxStep < 3 ? (
                isAnalyzing ? "Analyzing..." : "Start Full Analysis"
              ) : (
                <>Next <ChevronRight size={16} /></>
              )}
            </button>
          </div>
        )}
        <ExplainPanel />
        <ChatButton bottomOffset={isStep ? 80 : 24} />
        <ChatbotPanel />
      </div>
    </div>
  );
}

// ── NavItem sub-component ──────────────────────────────────────────────────

function NavItem({
  to,
  icon,
  label,
  isActive,
  isLocked = false,
  collapsed,
  badge,
  title,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  isLocked?: boolean;
  collapsed: boolean;
  badge?: string;
  title?: string;
}) {
  const content = (
    <>
      <span style={{ position: "relative", flexShrink: 0 }}>
        {icon}
        {badge && collapsed && (
          <span className="workflow-rail-badge">{badge}</span>
        )}
      </span>
      <AnimatePresence>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.2 }}
            className="workflow-rail-item-label"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
      {badge && !collapsed && (
        <span className="workflow-rail-step" aria-hidden>{badge.padStart(2, "0")}</span>
      )}
      {isActive && <span className="workflow-rail-active-indicator" />}
    </>
  );

  const className = `workflow-rail-item ${isActive ? "active" : ""} ${isLocked ? "locked" : ""}`;

  if (isLocked) {
    return (
      <div className={className} title={title} style={{ opacity: 0.3, cursor: "not-allowed" }}>
        {content}
      </div>
    );
  }

  return (
    <Link to={to} className={className} title={title}>
      {content}
    </Link>
  );
}
