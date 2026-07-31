import { Columns, PanelRightOpen, RefreshCw, Search, TableIcon, TerminalSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type DataViewerMode = 'data' | 'erd' | 'query';

type DataViewerModeToolbarProps = {
  activeMode: DataViewerMode;
  dbType?: string | null;
  onModeChange: (mode: DataViewerMode) => void;
};

const modes: { value: DataViewerMode; label: string; icon: typeof TableIcon }[] = [
  { value: 'data', label: 'Data', icon: TableIcon },
  { value: 'erd', label: 'ERD', icon: Columns },
  { value: 'query', label: 'Query', icon: TerminalSquare },
];

function DriverBadge({ dbType }: { dbType?: string | null }) {
  if (!dbType) return null;
  const label = dbType === 'postgresql' ? 'PG' : dbType === 'mysql' ? 'MySQL' : dbType === 'sqlite' ? 'SQLite' : dbType;
  const className = dbType === 'mysql'
    ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
    : dbType === 'postgresql'
      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
      : dbType === 'sqlite'
        ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300'
        : 'bg-muted text-muted-foreground';
  return <Badge className={className}>{label}</Badge>;
}

export function DataViewerModeToolbar({ activeMode, dbType, onModeChange }: DataViewerModeToolbarProps) {
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
          <DriverBadge dbType={dbType} />
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
