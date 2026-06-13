# Project Route Guard

**Problem:** Routes `/workflow/step-*`, `/compliance`, `/versions`, `/monitoring` are accessible without a project selected. The existing `useEffect` guard in `App.tsx` fires *after* render (causing a flash), only covers `/workflow/*`, and doesn't prevent accessing the other routes.

## Changes

### 1. Create `frontend/src/components/ProjectGuard.tsx`

New React Router v6 layout-route component:

```tsx
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAppContext } from "../context/AppContext";

export default function ProjectGuard() {
  const { projectId } = useAppContext();
  const location = useLocation();
  if (!projectId) return <Navigate to="/dashboard#open-selector" replace />;
  return <Outlet />;
}
```

### 2. Restructure routes in `App.tsx`

**Remove:**
- `initializing` state (line 66) and its `useEffect` (lines 68-70)
- `useState` from React imports
- The `useEffect` guard (lines 73-78)
- `useNavigate` from imports if no longer needed (check if resume effect still needs it — yes it does, keep it)

**Restructure nested routes inside `/*` → `ProtectedRoute` → `WorkflowShell`:**

```tsx
<Routes location={location} key={location.pathname}>
  {/* Public-but-authenticated routes */}
  <Route path="/dashboard" element={<PageTransition locationKey="dash"><Dashboard /></PageTransition>} />
  <Route path="/profile" element={<PageTransition locationKey="profile"><Profile /></PageTransition>} />
  <Route path="/create-project" element={<PageTransition locationKey="create"><CreateProject /></PageTransition>} />

  {/* Routes requiring a project */}
  <Route element={<ProjectGuard />}>
    <Route path="/monitoring" element={<PageTransition locationKey="monitoring"><MonitoringDashboard /></PageTransition>} />
    <Route path="/compliance" element={<PageTransition locationKey="compliance"><ComplianceDashboard /></PageTransition>} />
    <Route path="/versions" element={<PageTransition locationKey="versions"><ModelVersionComparison /></PageTransition>} />
    <Route path="/workflow/step-1" ... />
    <Route path="/workflow/step-2" ... />
    ... (steps 3-9)
    <Route path="/workflow" element={<Navigate to="/workflow/step-1" replace />} />
  </Route>

  <Route path="*" element={...} />
</Routes>
```

Import `ProjectGuard` at top of file.

### 3. Lock workspace sidebar items in `WorkflowShell.tsx`

Currently only pipeline steps check `!projectId` (line 183). Add the same check to workspace items (Compliance, Versions):

```tsx
{WORKSPACE_ITEMS.map((item) => {
  const Icon = item.icon;
  const isActive = location.pathname === item.to;
  const isLocked = !projectId && item.to !== "/dashboard";
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
```

This disables the sidebar links + grays them out (same visual treatment as locked pipeline steps).

## Rationale

- **Component guard** (`ProjectGuard`) prevents child mount entirely, unlike `useEffect` which fires after mount.
- React Router v6 layout routes make this clean and declarative — no `useEffect` workarounds.
- Sidebar locking provides consistent UX — users see disabled items rather than clicking into a redirect.
- `EmptyState` fallbacks in page components are kept as belt-and-suspenders.

## Files affected
- `frontend/src/components/ProjectGuard.tsx` — NEW
- `frontend/src/App.tsx` — restructure routes, remove old guard
- `frontend/src/components/WorkflowShell.tsx` — lock workspace nav items
