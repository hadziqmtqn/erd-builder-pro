import { RefObject } from 'react';
import { AlertCircle, Database, Search, TableIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

type DataViewerSidebarProps = {
  activeTable: string | null;
  error: string | null;
  filteredTables: any[];
  isLoadingTables: boolean;
  searchRef: RefObject<HTMLInputElement | null>;
  shortcutLabel: string;
  tableSearch: string;
  tables: any[];
  onSelectTable: (tableName: string) => void;
  setTableSearch: (value: string) => void;
};

export function DataViewerSidebar({
  activeTable,
  error,
  filteredTables,
  isLoadingTables,
  searchRef,
  shortcutLabel,
  tableSearch,
  tables,
  onSelectTable,
  setTableSearch,
}: DataViewerSidebarProps) {
  return (
    <div className="w-64 shrink-0 border-r bg-muted/20 flex flex-col overflow-hidden">
      <div className="px-3 py-2.5 border-b">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5" />
          Tables
        </h3>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            ref={searchRef}
            value={tableSearch}
            onChange={e => setTableSearch(e.target.value)}
            placeholder={`Search tables... (${shortcutLabel})`}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-1.5 space-y-0.5">
          {isLoadingTables ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-8 w-full rounded-md" />)}
            </div>
          ) : tables.length === 0 ? (
            <div className="p-3 text-center text-xs text-muted-foreground">
              {error ? (
                <div className="flex flex-col items-center gap-2 text-destructive">
                  <AlertCircle className="w-4 h-4" />
                  <span>{error}</span>
                </div>
              ) : (
                'No tables found'
              )}
            </div>
          ) : filteredTables.length === 0 ? (
            <div className="p-3 text-center text-xs text-muted-foreground">No matching tables</div>
          ) : (
            filteredTables.map((table: any) => (
              <button
                key={table.table_name}
                onClick={() => onSelectTable(table.table_name)}
                className={`w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-colors flex items-center gap-2 ${
                  activeTable === table.table_name
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5 shrink-0 opacity-60" />
                <span className="truncate">{table.table_name}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
