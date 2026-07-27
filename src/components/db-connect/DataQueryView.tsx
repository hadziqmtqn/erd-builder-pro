import { useCallback, useEffect, useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql as sqlLang } from '@codemirror/lang-sql';
import { autocompletion } from '@codemirror/autocomplete';
import { Play, Save } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { buildSqlCompletions } from './query-autocomplete';

type DataQueryViewProps = {
  connectionId: number;
  diagramId: number;
  initialTable: string | null;
};

export function DataQueryView({ connectionId, diagramId, initialTable }: DataQueryViewProps) {
  const [tables, setTables] = useState<any[]>([]);
  const [queries, setQueries] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [groupName, setGroupName] = useState('Ungrouped');
  const [name, setName] = useState('New SQL Query');
  const [script, setScript] = useState(`SELECT *\nFROM ${initialTable || ''}`);
  const [result, setResult] = useState<{ columns: string[]; rows: any[]; durationMs?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const completion = useMemo(() => buildSqlCompletions(tables, initialTable), [tables, initialTable]);
  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const query of queries) {
      const key = query.groupName || 'Ungrouped';
      map.set(key, [...(map.get(key) || []), query]);
    }
    return [...map.entries()];
  }, [queries]);

  const load = useCallback(async () => {
    const [schemaRes, queryRes] = await Promise.all([
      apiFetch(`/api/catalogs/${connectionId}/schema`, { method: 'POST' }),
      apiFetch(`/api/catalogs/${connectionId}/queries?diagramId=${diagramId}`),
    ]);
    const schemaData = await schemaRes.json();
    const queryData = await queryRes.json();
    if (!schemaRes.ok) throw new Error(schemaData.error || 'Failed to load schema');
    if (!queryRes.ok) throw new Error(queryData.error || 'Failed to load SQL queries');
    setTables(schemaData.schema || []);
    setQueries(queryData.queries || []);
  }, [connectionId, diagramId]);

  useEffect(() => { load().catch((err: any) => setError(err.message)); }, [load]);

  const openQuery = (query: any) => {
    setActiveId(query.id);
    setGroupName(query.groupName || 'Ungrouped');
    setName(query.name || 'SQL Query');
    setScript(query.script || '');
    setResult(null);
    setError(null);
  };

  const save = async () => {
    const res = await apiFetch(`/api/catalogs/${connectionId}/queries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: activeId, diagramId, groupName, name, script }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save SQL query');
    setActiveId(data.query.id);
    await load();
    toast.success('SQL query saved');
  };

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/catalogs/${connectionId}/query/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, limit: 200 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to run SQL query');
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="w-72 shrink-0 border-r bg-muted/10 p-3">
        <div className="mb-3 text-xs font-semibold text-muted-foreground">SQL Query History</div>
        <div className="space-y-3">
          {groups.map(([group, items]) => (
            <div key={group}>
              <div className="mb-1 truncate text-xs font-medium text-foreground">{group}</div>
              {items.map(query => (
                <button
                  key={query.id}
                  onClick={() => openQuery(query)}
                  className={`block w-full truncate rounded px-2 py-1.5 text-left text-xs ${activeId === query.id ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
                >
                  {query.name}
                </button>
              ))}
            </div>
          ))}
          {queries.length === 0 && <div className="text-xs text-muted-foreground">No saved queries</div>}
        </div>
      </aside>
      <main className="grid min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)_minmax(160px,35%)] overflow-hidden">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Input className="h-8 w-40" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Group" />
          <Input className="h-8 max-w-sm" value={name} onChange={e => setName(e.target.value)} placeholder="Query name" />
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => save().catch((err: any) => toast.error(err.message))}>
              <Save className="mr-1.5 h-3.5 w-3.5" /> Save
            </Button>
            <Button size="sm" onClick={run} disabled={running}>
              <Play className="mr-1.5 h-3.5 w-3.5" /> {running ? 'Running' : 'Run'}
            </Button>
          </div>
        </div>
        <div className="min-h-0 overflow-hidden">
          <CodeMirror
            value={script}
            height="100%"
            basicSetup={{ autocompletion: true, lineNumbers: true }}
            extensions={[sqlLang(), autocompletion({ override: [completion], selectOnOpen: true })]}
            onChange={setScript}
            className="h-full text-sm"
          />
        </div>
        <div className="min-h-0 overflow-auto border-t">
          {error ? <div className="p-3 text-sm text-destructive">{error}</div> : null}
          {result ? (
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-background">
                <tr>{result.columns.map(column => <th key={column} className="border-b px-2 py-1.5 text-left font-medium">{column}</th>)}</tr>
              </thead>
              <tbody>
                {result.rows.map((row, index) => (
                  <tr key={index} className="odd:bg-muted/30">
                    {result.columns.map(column => <td key={column} className="max-w-64 truncate border-b px-2 py-1.5">{String(row[column] ?? '')}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="p-3 text-sm text-muted-foreground">Run a query to view results</div>}
        </div>
      </main>
    </div>
  );
}
