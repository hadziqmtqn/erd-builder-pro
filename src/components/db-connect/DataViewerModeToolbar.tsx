import { Columns, PanelRightOpen, RefreshCw, Search, TableIcon, TerminalSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type DataViewerMode = 'data' | 'erd' | 'query';

type DataViewerModeToolbarProps = {
  activeMode: DataViewerMode;
  onModeChange: (mode: DataViewerMode) => void;
};

const modes: { value: DataViewerMode; label: string; icon: typeof TableIcon }[] = [
  { value: 'data', label: 'Data', icon: TableIcon },
  { value: 'erd', label: 'ERD', icon: Columns },
  { value: 'query', label: 'Query', icon: TerminalSquare },
];

export function DataViewerModeToolbar({ activeMode, onModeChange }: DataViewerModeToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-b bg-muted/5 shrink-0">
      <div className="flex items-center gap-1">
        {modes.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => onModeChange(value)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              activeMode === value
                ? 'bg-accent text-accent-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>
      {activeMode === 'data' && (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => window.dispatchEvent(new Event('db-connect-refresh-records'))} title="Refresh records">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => window.dispatchEvent(new Event('db-connect-toggle-filters'))} title="Toggle record filters">
            <Search className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => window.dispatchEvent(new Event('db-connect-toggle-details'))} title="Open table information">
            <PanelRightOpen className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
