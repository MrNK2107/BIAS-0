import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ChevronLeft,
  ChevronRight,
  MapPin,
} from "lucide-react";

export interface TourStep {
  title: string;
  description: string;
  target?: string; // CSS selector to highlight
  position?: "top" | "bottom" | "left" | "right" | "center";
  icon?: React.ReactNode;
}

interface GuidedTourProps {
  steps: TourStep[];
  tourKey?: string;
  autoStart?: boolean;
  onComplete?: () => void;
}

const DEFAULT_STEPS: TourStep[] = [
  {
    title: "Welcome to BIAS-0",
    description:
      "This guided tour will walk you through the fairness auditing platform. Follow along to see how to detect, analyze, and mitigate bias in your AI models.",
    position: "center",
  },
  {
    title: "Upload Your Data",
    description:
      "Start by uploading a CSV dataset. BIAS-0 supports structured data with labeled outcomes. The platform automatically detects column types and schema.",
    position: "center",
    target: '[href="/workflow/step-1"]',
  },
  {
    title: "Configure Sensitive Attributes",
    description:
      "Select which columns represent protected attributes (gender, race, age, etc.) and which is the target variable. Choose your domain for context-appropriate thresholds.",
    position: "center",
    target: '[href="/workflow/step-2"]',
  },
  {
    title: "Data Audit & Proxy Detection",
    description:
      "The platform analyzes representation gaps and identifies proxy features — columns that correlate with sensitive attributes and could leak bias into decisions.",
    position: "center",
    target: '[href="/workflow/step-3"]',
  },
  {
    title: "Model Bias Analysis",
    description:
      "Fairness metrics like Demographic Parity and Equal Opportunity are computed across all groups. The dashboard shows which groups are most affected.",
    position: "center",
    target: '[href="/workflow/step-4"]',
  },
  {
    title: "Counterfactual Testing",
    description:
      "Flip sensitive attributes while keeping everything else identical. If decisions change, the model isn't counterfactually fair — bias is present.",
    position: "center",
    target: '[href="/workflow/step-6"]',
  },
  {
    title: "Sandbox & Fix Simulation",
    description:
      "Test bias mitigation strategies before deploying. Remove proxy features, apply SMOTE resampling, or use fairness-constrained models — see the impact on score and accuracy.",
    position: "center",
    target: '[href="/workflow/step-8"]',
  },
  {
    title: "Compliance & Monitoring",
    description:
      "Track fairness over time with drift detection and compliance status against EU AI Act, NYC Local Law 144, and GDPR requirements.",
    position: "center",
    target: '[href="/monitoring"]',
  },
];

export function useGuidedTour(tourKey: string = "main-tour") {
  const [isActive, setIsActive] = useState(false);
  const storageKey = `guided_tour_${tourKey}`;

  useEffect(() => {
    const completed = localStorage.getItem(storageKey);
    if (!completed) {
      // Don't auto-start — let the user trigger it
    }
  }, [storageKey]);

  const startTour = useCallback(() => {
    setIsActive(true);
  }, []);

  const completeTour = useCallback(() => {
    localStorage.setItem(storageKey, "completed");
    setIsActive(false);
  }, [storageKey]);

  const dismissTour = useCallback(() => {
    localStorage.setItem(storageKey, "dismissed");
    setIsActive(false);
  }, [storageKey]);

  const hasCompleted = localStorage.getItem(storageKey) === "completed";

  return { isActive, startTour, completeTour, dismissTour, hasCompleted };
}

export default function GuidedTour({
  steps = DEFAULT_STEPS,
  tourKey = "main-tour",
  autoStart = false,
  onComplete,
}: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(autoStart);

  useEffect(() => {
    const completed = localStorage.getItem(`guided_tour_${tourKey}`);
    if (autoStart && !completed) {
      setIsVisible(true);
    }
  }, [autoStart, tourKey]);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      localStorage.setItem(`guided_tour_${tourKey}`, "completed");
      setIsVisible(false);
      onComplete?.();
    }
  }, [currentStep, steps.length, tourKey, onComplete]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  const handleClose = useCallback(() => {
    localStorage.setItem(`guided_tour_${tourKey}`, "dismissed");
    setIsVisible(false);
    onComplete?.();
  }, [tourKey, onComplete]);

  const step = steps[currentStep];
  if (!step || !isVisible) return null;

  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;
  const progress = ((currentStep + 1) / steps.length) * 100;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "grid",
          placeItems: "center",
          background: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(8px)",
        }}
        onClick={handleClose}
      >
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: -20 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "min(90%, 520px)",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0))",
            backgroundColor: "#141312",
            border: "1px solid rgba(200,157,124,0.2)",
            borderRadius: 20,
            padding: "36px 32px 28px",
            boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Progress bar */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: "rgba(255,255,255,0.06)",
            }}
          >
            <motion.div
              style={{
                height: "100%",
                background: "linear-gradient(90deg, #C89D7C, #DFB99B)",
                boxShadow: "0 0 12px rgba(200,157,124,0.4)",
              }}
              initial={{ width: `${(currentStep / steps.length) * 100}%` }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>

          {/* Close button */}
          <button
            onClick={handleClose}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              color: "var(--text-secondary)",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              width: 32,
              height: 32,
            }}
          >
            <X size={16} />
          </button>

          {/* Step indicator */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "rgba(200,157,124,0.15)",
                border: "1px solid rgba(200,157,124,0.25)",
                display: "grid",
                placeItems: "center",
                color: "var(--accent)",
                fontSize: "0.8rem",
                fontWeight: 700,
              }}
            >
              {step.icon || <MapPin size={15} />}
            </div>
            <div>
              <div
                style={{
                  fontSize: "0.65rem",
                  color: "var(--text-muted)",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                Step {currentStep + 1} of {steps.length}
              </div>
            </div>
          </div>

          {/* Content */}
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.5rem",
              fontWeight: 600,
              color: "var(--text-primary)",
              margin: "0 0 12px",
              lineHeight: 1.2,
            }}
          >
            {step.title}
          </h2>
          <p
            style={{
              fontSize: "0.95rem",
              lineHeight: 1.65,
              color: "var(--text-secondary)",
              margin: "0 0 28px",
            }}
          >
            {step.description}
          </p>

          {/* Actions */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <button
              onClick={handleClose}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: "0.8rem",
                padding: "8px 12px",
                borderRadius: 6,
              }}
            >
              Skip tour
            </button>

            <div style={{ display: "flex", gap: 10 }}>
              {!isFirst && (
                <button
                  onClick={handlePrev}
                  className="btn btn-small"
                  style={{ padding: "8px 14px" }}
                >
                  <ChevronLeft size={15} /> Back
                </button>
              )}
              <button
                onClick={handleNext}
                className="btn btn-primary btn-small"
                style={{ padding: "8px 18px" }}
              >
                {isLast ? "Finish" : "Next"}
                {!isLast && <ChevronRight size={15} />}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export { DEFAULT_STEPS };
