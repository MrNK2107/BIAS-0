import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAppContext } from "../context/AppContext";

export default function ProjectGuard() {
  const { projectId, projects, projectsLoaded } = useAppContext();
  const location = useLocation();
  const navigate = useNavigate();

  // A projectId is only valid when it actually exists in the user's project
  // list fetched from Firestore.  No escape hatch for empty lists — if
  // Firestore returned zero projects any stale localStorage ID must be
  // rejected.
  const validProjectId =
    projectId !== null &&
    projects.some((p) => String(p.id) === String(projectId));

  useEffect(() => {
    if (!validProjectId && projectsLoaded) {
      navigate("/dashboard#open-selector", { replace: true });
    }
  }, [validProjectId, projectsLoaded, navigate, location.pathname]);

  // Don't render anything until the Firestore project list has arrived.
  // This prevents a flash of stale content during the ~800ms fetch.
  if (!projectsLoaded) {
    return null;
  }

  if (!validProjectId) {
    return null;
  }

  return <Outlet />;
}
