import { useState, useCallback } from 'react';
import { Sparkles, LayoutDashboard } from 'lucide-react';
import { DashboardRoute } from '@/routes/DashboardRoute';
import { NewDashboardPreview } from '@/components/dashboard/NewDashboardPreview';

type DashboardMode = 'ai' | 'classic';

const STORAGE_KEY = 'erd-builder-dashboard-mode';

function getStoredMode(): DashboardMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'classic' || stored === 'ai') return stored;
  return 'classic';
}

export function DashboardSwitcher() {
  const [mode] = useState<DashboardMode>(getStoredMode);

  return (
    <div className="relative h-full w-full">
      {/* ── Active dashboard (default: classic) ── */}
      <DashboardRoute />
    </div>
  );
}
