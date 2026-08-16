export type QueryExecution = {
  id: string;
  script: string;
  status: 'success' | 'error' | 'cancelled';
  durationMs: number;
  executedAt: string;
};

type Props = {
  groups: [string, any[]][];
  history: QueryExecution[];
  activeQueryId: number | null;
  dirtyQueryIds: Set<number>;
  onOpenQuery: (query: any) => void;
  onOpenHistory: (entry: QueryExecution) => void;
};

export function DataQuerySidebar({ groups, history, activeQueryId, dirtyQueryIds, onOpenQuery, onOpenHistory }: Props) {
  return (
    <aside className="w-60 shrink-0 overflow-y-auto border-r bg-muted/10 p-2">
      <div className="mb-2 text-xs font-semibold text-muted-foreground">Saved Queries</div>
      <div className="space-y-3">
        {groups.map(([group, items]) => <div key={group}><div className="mb-1 truncate text-xs font-medium">{group}</div>{items.map(query => (
          <button key={query.id} onClick={() => onOpenQuery(query)} className={`flex w-full items-center rounded px-2 py-1.5 text-left text-xs ${activeQueryId === query.id ? 'bg-accent' : 'hover:bg-accent/50'}`}><span className="truncate">{query.name}</span>{dirtyQueryIds.has(query.id) && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-amber-500" />}</button>
        ))}</div>)}
        {groups.length === 0 && <div className="text-xs text-muted-foreground">No saved queries</div>}
      </div>
      <div className="mb-2 mt-5 text-xs font-semibold text-muted-foreground">Execution History</div>
      <div className="space-y-1">
        {history.map(entry => (
          <button key={entry.id} onClick={() => onOpenHistory(entry)} className="w-full rounded px-2 py-1.5 text-left hover:bg-accent/50">
            <div className="truncate font-mono text-[11px]">{entry.script.replace(/\s+/g, ' ')}</div>
            <div className={`text-[10px] ${entry.status === 'success' ? 'text-emerald-600' : 'text-destructive'}`}>{entry.status} · {entry.durationMs}ms</div>
          </button>
        ))}
        {history.length === 0 && <div className="text-xs text-muted-foreground">No executions yet</div>}
      </div>
    </aside>
  );
}
