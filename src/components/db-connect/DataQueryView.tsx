import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql as sqlLang } from '@codemirror/lang-sql';
import { autocompletion } from '@codemirror/autocomplete';
import { oneDark } from '@codemirror/theme-one-dark';
import { Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { Play, Plus, Sparkles, Square, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import ConfirmModal from '@/components/ConfirmModal';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { localPersistence } from '@/lib/localPersistence';
import { buildSqlCompletions } from './query-autocomplete';
import { DataQueryResultTable } from './DataQueryResultTable';
import { DataQueryToolbar } from './DataQueryToolbar';
import { useAIAction } from '@/contexts/AIActionContext';
import { buildDbClientQueryContext } from '@/lib/db-client-ai-context';
import { DataQuerySidebar, type QueryExecution } from './DataQuerySidebar';
import { beautifySql, emptyQueryState, newQueryTab, readQueryState, sanitizeQueryState, type QueryTab } from './data-query-state';

type DataQueryViewProps = {
  connectionId: number;
  diagramId: number;
  initialTable: string | null;
  openNonce?: number;
};

const SQL_QUERY_DRAFT_TYPE = 'sql_query_tabs';

const isQueryDirty = (tab: QueryTab, query?: any) => !query
  || tab.groupName !== (query.groupName || 'Ungrouped')
  || tab.name !== (query.name || 'SQL Query')
  || tab.script !== (query.script || '');

export function DataQueryView({ connectionId, diagramId, initialTable, openNonce = 0 }: DataQueryViewProps) {
  const { resolvedTheme } = useWorkspace();
  const { setActionContextData } = useAIAction();
  const storageKey = `erd-production-db-query-tabs:${diagramId}:${connectionId}`;
  const [tables, setTables] = useState<any[]>([]);
  const [queries, setQueries] = useState<any[]>([]);
  const [queriesLoaded, setQueriesLoaded] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [queryState, setQueryState] = useState(() => readQueryState(storageKey));
  const { tabs, activeKey } = queryState;
  const activeTab = tabs.find(tab => tab.key === activeKey) || tabs[0] || null;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dbType, setDbType] = useState<string | null>(null);
  const [connectionSecurity, setConnectionSecurity] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<QueryExecution[]>(() => {
    try { return JSON.parse(localStorage.getItem(`erd-db-query-history:${connectionId}`) || '[]'); } catch { return []; }
  });
  const runningIdRef = useRef<string | null>(null);
  const [beautifying, setBeautifying] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const activeTabRef = useRef<QueryTab | null>(activeTab);
  const storageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beautifyFrameRef = useRef<number | null>(null);
  const completion = useMemo(() => buildSqlCompletions(tables, initialTable), [tables, initialTable]);
  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const query of queries) {
      const key = query.groupName || 'Ungrouped';
      map.set(key, [...(map.get(key) || []), query]);
    }
    return [...map.entries()];
  }, [queries]);
  const queryById = useMemo(() => new Map(queries.map((query: any) => [query.id, query])), [queries]);
  const dirtyQueryIds = useMemo(() => new Set(tabs.filter(tab => tab.id && isQueryDirty(tab, queryById.get(tab.id))).map(tab => tab.id)), [queryById, tabs]);

  const load = useCallback(async () => {
    setQueriesLoaded(false);
    const [schemaRes, queryRes] = await Promise.all([
      apiFetch(`/api/catalogs/${connectionId}/schema`, { method: 'POST' }),
      apiFetch(`/api/catalogs/${connectionId}/queries?diagramId=${diagramId}`),
    ]);
    const schemaData = await schemaRes.json();
    const queryData = await queryRes.json();
    if (!schemaRes.ok) throw new Error(schemaData.error || 'Failed to load schema');
    if (!queryRes.ok) throw new Error(queryData.error || 'Failed to load SQL queries');
    setTables(schemaData.schema || []);
    setDbType(schemaData.dbType || null);
    setConnectionSecurity(schemaData.connectionSecurity || null);
    setQueries(queryData.queries || []);
    setQueriesLoaded(true);
  }, [connectionId, diagramId]);

  useEffect(() => { load().catch((err: any) => setLoadError(err.message)); }, [load]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setActionContextData({ aiContextText: buildDbClientQueryContext(dbType, activeTab, tables) });
    }, 300);
    return () => clearTimeout(timer);
  }, [activeTab, dbType, setActionContextData, tables]);
  useEffect(() => () => setActionContextData(null), [setActionContextData]);
  useEffect(() => {
    let cancelled = false;
    setDraftLoaded(false);
    localPersistence.getResource(storageKey).then((resource) => {
      if (cancelled) return;
      const saved = sanitizeQueryState(resource?.data);
      if (saved) {
        setQueryState(saved);
      } else {
        setQueryState(readQueryState(storageKey));
      }
    }).catch(() => {
      if (!cancelled) setQueryState(readQueryState(storageKey));
    }).finally(() => {
      if (!cancelled) setDraftLoaded(true);
    });
    return () => { cancelled = true; };
  }, [storageKey]);
  useEffect(() => {
    if (!draftLoaded) return;
    if (storageTimerRef.current) clearTimeout(storageTimerRef.current);
    storageTimerRef.current = setTimeout(() => {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify({
          tabs: tabs.map(tab => ({ ...tab, result: null, error: null })),
          activeKey,
        }));
        localPersistence.saveResource({
          id: storageKey,
          type: SQL_QUERY_DRAFT_TYPE,
          data: { tabs: tabs.map(tab => ({ ...tab, result: null, error: null })), activeKey },
          updated_at: Date.now(),
        }).catch(() => {});
      } catch {}
    }, 400);
    return () => {
      if (storageTimerRef.current) clearTimeout(storageTimerRef.current);
    };
  }, [activeKey, draftLoaded, storageKey, tabs]);
  useEffect(() => () => {
    if (beautifyFrameRef.current !== null) cancelAnimationFrame(beautifyFrameRef.current);
  }, []);

  const patchTab = useCallback((key: string, patch: Partial<QueryTab>) => {
    setQueryState(prev => ({ ...prev, tabs: prev.tabs.map(tab => tab.key === key ? { ...tab, ...patch } : tab) }));
  }, []);

  const patchActiveTab = (patch: Partial<QueryTab>) => {
    if (!activeKey) return;
    patchTab(activeKey, patch);
  };

  const addTab = useCallback((table?: string | null) => {
    const tab = newQueryTab(table);
    setQueryState(prev => ({ tabs: [...prev.tabs, tab], activeKey: tab.key }));
  }, []);

  const openQuery = (query: any) => {
    const existing = tabs.find(tab => tab.id === query.id);
    if (existing) return setQueryState(prev => ({ ...prev, activeKey: existing.key }));
    const tab = {
      key: crypto.randomUUID(),
      id: query.id,
      groupName: query.groupName || 'Ungrouped',
      name: query.name || 'SQL Query',
      script: query.script || '',
      result: null,
      resultPage: 1,
      error: null,
    };
    setQueryState(prev => ({ tabs: [...prev.tabs, tab], activeKey: tab.key }));
  };

  const closeTab = (key: string) => {
    setQueryState(prev => {
      const next = prev.tabs.filter(tab => tab.key !== key);
      if (next.length) {
        return { tabs: next, activeKey: prev.activeKey === key ? next.at(-1)!.key : prev.activeKey };
      }
      return emptyQueryState;
    });
  };

  useEffect(() => {
    if (openNonce <= 0) return;
    const nonceKey = `${storageKey}:openNonce`;
    if (sessionStorage.getItem(nonceKey) === String(openNonce)) return;
    sessionStorage.setItem(nonceKey, String(openNonce));
    addTab(initialTable);
  }, [openNonce, initialTable, addTab, storageKey]);
  useEffect(() => {
    if (draftLoaded && queriesLoaded && queries.length === 0 && tabs.length === 0) addTab(initialTable);
  }, [addTab, draftLoaded, initialTable, queries.length, queriesLoaded, tabs.length]);

  const save = async () => {
    if (!activeTab) return;
    const tab = activeTab;
    const res = await apiFetch(`/api/catalogs/${connectionId}/queries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tab.id, diagramId, groupName: tab.groupName, name: tab.name, script: tab.script }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save SQL query');
    patchTab(tab.key, { id: data.query.id });
    await load();
    toast.success('SQL query saved');
  };

  const deleteActiveQuery = async () => {
    if (!activeTab?.id) return;
    const res = await apiFetch(`/api/catalogs/${connectionId}/queries/${activeTab.id}?diagramId=${diagramId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete SQL query');
    setQueryState(prev => {
      const next = prev.tabs.filter(tab => tab.id !== activeTab.id);
      return next.length ? { tabs: next, activeKey: next.at(-1)!.key } : emptyQueryState;
    });
    await load();
    toast.success('SQL query deleted');
  };

  const run = useCallback(async (scriptOverride?: string) => {
    const tab = activeTabRef.current;
    if (!tab) return;
    setRunning(true);
    const runId = crypto.randomUUID();
    runningIdRef.current = runId;
    const started = Date.now();
    let status: QueryExecution['status'] = 'success';
    patchTab(tab.key, { error: null });
    try {
      const res = await apiFetch(`/api/catalogs/${connectionId}/query/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: scriptOverride ?? tab.script, runId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to run SQL query');
      patchTab(tab.key, { result: data, resultPage: 1 });
    } catch (err: any) {
      status = runningIdRef.current ? 'error' : 'cancelled';
      patchTab(tab.key, { error: err.message });
    } finally {
      const entry: QueryExecution = { id: runId, script: scriptOverride ?? tab.script, status, durationMs: Date.now() - started, executedAt: new Date().toISOString() };
      setHistory(previous => {
        const next = [entry, ...previous].slice(0, 100);
        try { localStorage.setItem(`erd-db-query-history:${connectionId}`, JSON.stringify(next)); } catch {}
        return next;
      });
      runningIdRef.current = null;
      setRunning(false);
    }
  }, [connectionId, patchTab]);

  const cancelRun = useCallback(async () => {
    const runId = runningIdRef.current;
    if (!runId) return;
    runningIdRef.current = null;
    await apiFetch(`/api/catalogs/${connectionId}/query/cancel/${runId}`, { method: 'POST' });
  }, [connectionId]);

  const beautifyActiveTab = useCallback((scriptOverride?: string) => {
    const tab = activeTabRef.current;
    if (!tab) return;
    const script = scriptOverride ?? tab.script;
    if (beautifyFrameRef.current !== null) cancelAnimationFrame(beautifyFrameRef.current);
    setBeautifying(true);
    beautifyFrameRef.current = requestAnimationFrame(() => {
      const formatted = beautifySql(script);
      startTransition(() => {
        if (formatted !== script) patchTab(tab.key, { script: formatted });
        setBeautifying(false);
      });
    });
  }, [patchTab]);

  const codeMirrorExtensions = useMemo(() => [
    sqlLang(),
    autocompletion({ override: [completion], selectOnOpen: true }),
    Prec.highest(keymap.of([
      { key: 'Cmd-Enter', run: (view) => { void run(view.state.doc.toString()); return true; } },
      { key: 'Ctrl-Enter', run: (view) => { void run(view.state.doc.toString()); return true; } },
      { key: 'Cmd-i', run: (view) => { beautifyActiveTab(view.state.doc.toString()); return true; } },
      { key: 'Ctrl-i', run: (view) => { beautifyActiveTab(view.state.doc.toString()); return true; } },
    ])),
  ], [beautifyActiveTab, completion, run]);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <DataQuerySidebar groups={groups} history={history} activeQueryId={activeTab?.id || null} dirtyQueryIds={dirtyQueryIds} onOpenQuery={openQuery} onOpenHistory={entry => patchActiveTab({ script: entry.script })} />
      <main className="grid min-h-0 min-w-0 flex-1 grid-rows-[auto_auto_minmax(120px,30%)_minmax(0,1fr)] overflow-hidden">
        <div className="flex items-center gap-1 overflow-x-auto border-b bg-muted/10 px-2 py-1">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setQueryState(prev => ({ ...prev, activeKey: tab.key }))} className={`group flex h-8 max-w-48 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium ${activeKey === tab.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>
              <span className="truncate">{tab.name}</span>
              {isQueryDirty(tab, tab.id ? queryById.get(tab.id) : undefined) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" title="Not synced to database" />}
              <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); closeTab(tab.key); }} className="ml-1 rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100" title="Close query">
                <X className="h-3 w-3" />
              </span>
            </button>
          ))}
          <Button size="icon-sm" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => addTab(initialTable)} title="New SQL query">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {activeTab ? (
          <>
            <DataQueryToolbar
              groupName={activeTab.groupName}
              name={activeTab.name}
              result={activeTab.result}
              onGroupChange={groupName => patchActiveTab({ groupName })}
              onNameChange={name => patchActiveTab({ name })}
              onDelete={activeTab.id ? () => setDeleteConfirmOpen(true) : undefined}
              onSave={() => save().catch((err: any) => toast.error(err.message))}
              security={connectionSecurity}
            />
            <div className="min-h-0 overflow-hidden">
              <div className="flex h-full min-h-0 flex-col">
                <div className="min-h-0 flex-1">
                  <CodeMirror
                    value={activeTab.script}
                    height="100%"
                    theme={resolvedTheme === 'dark' ? oneDark : undefined}
                    basicSetup={{ autocompletion: true, lineNumbers: true }}
                    extensions={codeMirrorExtensions}
                    onChange={(script) => patchActiveTab({ script })}
                    className="h-full text-sm"
                  />
                </div>
                <div className="flex shrink-0 justify-end gap-2 border-t px-2 py-1">
                  <Button size="sm" variant="outline" onClick={() => beautifyActiveTab()} disabled={beautifying}>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" /> {beautifying ? 'Beautifying' : 'Beautify'}
                  </Button>
                  <Button size="sm" variant={running ? 'destructive' : 'default'} onClick={() => running ? cancelRun() : run()}>
                    {running ? <Square className="mr-1.5 h-3.5 w-3.5" /> : <Play className="mr-1.5 h-3.5 w-3.5" />} {running ? 'Stop' : 'Run'}
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="min-h-0 border-b p-3 text-sm text-muted-foreground">
            No SQL query tab open
          </div>
        )}
        <div className="min-h-0 overflow-hidden border-t">
          <DataQueryResultTable
            emptyText={activeTab ? 'Run a query to view results' : 'Open or create a SQL query'}
            error={loadError || activeTab?.error || null}
            result={activeTab?.result || null}
            resultPage={activeTab?.resultPage || 1}
            onPageChange={(resultPage) => activeTab && patchTab(activeTab.key, { resultPage })}
          />
        </div>
      </main>
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="Delete SQL Query?"
        message={`This will permanently delete "${activeTab?.name || 'SQL Query'}". This action cannot be undone.`}
        confirmText="Delete Query"
        variant="danger"
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          deleteActiveQuery().catch((err: any) => toast.error(err.message));
        }}
      />
    </div>
  );
}
