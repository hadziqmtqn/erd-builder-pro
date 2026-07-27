import { X } from 'lucide-react';
import type { ReactNode } from 'react';

type DataViewerTableTabsProps = {
  activeTable: string | null;
  openTabs: any[];
  onCloseTable: (tableName: string) => void;
  onSelectTable: (tableName: string) => void;
  onPinTable: (tableName: string) => void;
  rightActions?: ReactNode;
};

export function DataViewerTableTabs({
  activeTable,
  openTabs,
  onCloseTable,
  onSelectTable,
  onPinTable,
  rightActions,
}: DataViewerTableTabsProps) {
  if (openTabs.length === 0) return null;

  return (
    <div className="flex shrink-0 items-center gap-2 border-b bg-muted/10 px-2 py-1">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-hide">
        {openTabs.map(tab => (
          <button
            key={tab.name}
            onClick={() => onSelectTable(tab.name)}
            onDoubleClick={() => onPinTable(tab.name)}
            className={`group flex h-8 max-w-48 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors ${
              activeTable === tab.name
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
            title={tab.pinned ? `${tab.name} (pinned)` : `${tab.name} (double click to pin)`}
          >
            <span className={`truncate ${tab.pinned ? 'not-italic' : 'italic'}`}>{tab.name}</span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onCloseTable(tab.name); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onCloseTable(tab.name);
                }
              }}
              className="ml-1 rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100"
              title="Close table"
            >
              <X className="h-3 w-3" />
            </span>
          </button>
        ))}
      </div>
      {rightActions}
    </div>
  );
}
