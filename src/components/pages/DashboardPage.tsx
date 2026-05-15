import React from 'react';
import { useLocation } from 'react-router-dom';
import { useWorkspace } from '@/providers/WorkspaceProvider';

/**
 * DashboardPage — manages Dashboard-specific side effects.
 *
 * Mounted unconditionally inside WorkspaceProvider. Renders null (no visible DOM).
 * Handles:
 *  - Breadcrumb label: sets to "Dashboard" only when on `/` route
 */
export const DashboardPage = React.memo(function DashboardPage() {
  const { setBreadcrumbLabel } = useWorkspace();
  const location = useLocation();
  const isDashboard = location.pathname === '/';

  // ── Effect: Set breadcrumb only on dashboard route ──
  React.useEffect(() => {
    if (isDashboard) {
      setBreadcrumbLabel('Dashboard');
    }
    return () => {
      if (isDashboard) setBreadcrumbLabel(null);
    };
  }, [isDashboard, setBreadcrumbLabel]);

  return null;
});
