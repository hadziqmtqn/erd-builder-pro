import { useState } from 'react';
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
  const [mode, setMode] = useState<DashboardMode>(getStoredMode);

  return (
    <div className="relative h-full w-full">
      {/* ── Switch button ── */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2 rounded-lg border border-border/60 bg-card/80 backdrop-blur-sm px-2.5 py-1.5 shadow-xs">
        <button
          onClick={() => { setMode('classic'); localStorage.setItem(STORAGE_KEY, 'classic'); }}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
            mode === 'classic'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground/60 hover:text-foreground'
          }`}
        >
          <LayoutDashboard className="size-3.5" />
          Classic
        </button>
        <button
          onClick={() => { setMode('ai'); localStorage.setItem(STORAGE_KEY, 'ai'); }}
          title="Preview — not yet functional"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
            mode === 'ai'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground/60 hover:text-foreground'
          }`}
        >
          <Sparkles className="size-3.5" />
          AI
          <span className="ml-0.5 text-[9px] font-semibold uppercase tracking-wider opacity-50">Preview</span>
        </button>
      </div>

      {/* ── Active dashboard ── */}
      {mode === 'classic' ? <DashboardRoute /> : <NewDashboardPreview />}
    </div>
  );
}
