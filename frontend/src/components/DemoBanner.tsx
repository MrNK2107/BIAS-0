import { useState } from "react";
import { isDemoMode } from "../firebase/config";

const DISMISS_KEY = "bias0.demoBannerDismissed";

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Small floating pill that makes it obvious the app runs without Firebase. */
export default function DemoBanner() {
  const [dismissed, setDismissed] = useState(readDismissed);
  if (!isDemoMode() || dismissed) return null;
  return (
    <div
      className="demo-banner"
      role="status"
      title="Running without Firebase: no sign-in, projects are kept in the API's memory and reset when it restarts."
    >
      <span className="demo-banner-dot" aria-hidden="true" />
      <span>Demo mode · local data</span>
      <button
        type="button"
        aria-label="Dismiss demo mode notice"
        onClick={() => {
          setDismissed(true);
          try {
            sessionStorage.setItem(DISMISS_KEY, "1");
          } catch {
            /* ignore */
          }
        }}
      >
        ×
      </button>
    </div>
  );
}
