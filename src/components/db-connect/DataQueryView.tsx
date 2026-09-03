import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import type { EditorView } from '@codemirror/view';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import ConfirmModal from '@/components/ConfirmModal';
import { localPersistence } from '@/lib/localPersistence';
import { DataQueryResultTable } from './DataQueryResultTable';
import { DataQueryToolbar } from './DataQueryToolbar';
import { DataQueryEditorActions } from './DataQueryEditorActions';
import { SqlQueryEditor } from './SqlQueryEditor';
import { useSetActionContextData } from '@/contexts/AIActionContext';
import { buildDbClientQueryContext } from '@/lib/db-client-ai-context';
import { DataQuerySidebar, type QueryExecution } from './DataQuerySidebar';
import { beautifySql, emptyQueryState, getQueryCache, newQueryTab, readQueryState, reconcileLiveTab, runnableSql, sanitizeQueryState, setQueryCache, type QueryTab } from './data-query-state';
import { getSchemaCache, setSchemaCache } from '@/hooks/useDataViewerHelpers';

type DataQueryViewProps = {
  connectionId: number;
  dbClientId: number;
  initialTable: string | null;
  openNonce?: number;
};

const SQL_QUERY_DRAFT_TYPE = 'sql_query_tabs';

const isQueryDirty = (tab: QueryTab, query?: any) => !query
  || tab.groupName !== (query.groupName || 'Ungrouped')
  || tab.name !== (query.name || 'SQL Query')
  || tab.script !== (query.script || '');

export const DataQueryView = memo(function DataQueryView({ connectionId, dbClientId, initialTable, openNonce = 0 }: DataQueryViewProps) {
  const { resolvedTheme } = useWorkspace();
  const setActionContextData = useSetActionContextData();
  const storageKey = `db-client-query-tabs:${dbClientId}:${connectionId}`;
  const queryCacheKey = `${dbClientId}:${connectionId}`;
  const [tables, setTables] = useState<any[]>([]);
  const [queries, setQueries] = useState<any[]>([]);
  const [queriesLoaded, setQueriesLoaded] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [queryState, setQueryState] = useState(() => readQueryState(storageKey));
  const queryStateRef = useRef(queryState);
  const { tabs, activeKey } = queryState;
  const activeTab = tabs.find(tab => tab.key === activeKey) || tabs[0] || null;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dbType, setDbType] = useState<string | null>(null);
  const [connectionSecurity, setConnectionSecurity] = useState<any>(null);
  const [runningMode, setRunningMode] = useState<'run' | 'explain' | null>(null);
  const [history, setHistory] = useState<QueryExecution[]>(() => {
    try { return JSON.parse(localStorage.getItem(`erd-db-query-history:${connectionId}`) || '[]'); } catch { return []; }
  });
  const runningIdRef = useRef<string | null>(null);
  const queryEditorRef = useRef<EditorView | null>(null);
  const [beautifying, setBeautifying] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const activeTabRef = useRef<QueryTab | null>(activeTab);
  const storageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beautifyFrameRef = useRef<number | null>(null);
  const draftEditedRef = useRef(false);
  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const query of queries) {
      const key = query.groupName || 'Ungrouped';
      map.set(key, [...(map.get(key) || []), query]);
    }
    return [...map.entries()];
  }, [queries]);
  const queryById = useMemo(() => new Map(queries.map((query: any) => [query.id, query])), [queries]);
  const dirtyQueryIds = useMemo(() => new Set(tabs.flatMap(tab => tab.id !== null && isQueryDirty(tab, queryById.get(tab.id)) ? [tab.id] : [])), [queryById, tabs]);

  const load = useCallback(async () => {
    setQueriesLoaded(false);
    const cachedSchema = getSchemaCache(connectionId);
    const cachedQueries = getQueryCache(queryCacheKey);
    const [schemaRes, queryRes] = await Promise.all([
      cachedSchema ? null : apiFetch(`/api/catalogs/${connectionId}/schema`, { method: 'POST' }),
      cachedQueries ? null : apiFetch(`/api/catalogs/${connectionId}/queries?dbClientId=${dbClientId}`),
    ]);
    const schemaData = cachedSchema || await schemaRes!.json();
    const queryData = cachedQueries ? { queries: cachedQueries } : await queryRes!.json();
    if (schemaRes && !schemaRes.ok) throw new Error(schemaData.error || 'Failed to load schema');
    if (queryRes && !queryRes.ok) throw new Error(queryData.error || 'Failed to load SQL queries');
    if (!cachedSchema) setSchemaCache(connectionId, schemaData);
    if (!cachedQueries) setQueryCache(queryCacheKey, queryData.queries || []);
    setTables(schemaData.schema || []);
    setDbType(schemaData.dbType || null);
    setConnectionSecurity(schemaData.connectionSecurity || null);
    setQueries(queryData.queries || []);
    setQueriesLoaded(true);
  }, [connectionId, dbClientId, queryCacheKey]);

  useEffect(() => { const timer = setTimeout(() => { load().catch((err: any) => setLoadError(err.message)); }); return () => clearTimeout(timer); }, [load]);
  useEffect(() => { queryStateRef.current = queryState; }, [queryState]);
  useEffect(() => { activeTabRef.current = reconcileLiveTab(activeTab, activeTabRef.current); }, [activeTab]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setActionContextData({ aiContextText: buildDbClientQueryContext(dbType, activeTab, tables) });
    }, 300);
    return () => clearTimeout(timer);
  }, [activeTab, dbType, setActionContextData, tables]);
  useEffect(() => () => setActionContextData(null), [setActionContextData]);
  useEffect(() => {
    let cancelled = false;
    draftEditedRef.current = false;
    setDraftLoaded(false);
    localPersistence.getResource(storageKey).then((resource) => {
      if (cancelled || draftEditedRef.current) return;
      const saved = sanitizeQueryState(resource?.data);
      setQueryState(saved || readQueryState(storageKey));
    }).catch(() => {
      if (!cancelled && !draftEditedRef.current) setQueryState(readQueryState(storageKey));
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
    if (draftEditedRef.current) {
      const state = queryStateRef.current;
      const data = { tabs: state.tabs.map(tab => ({ ...tab, result: null, error: null })), activeKey: state.activeKey };
      try { sessionStorage.setItem(storageKey, JSON.stringify(data)); } catch {}
      localPersistence.saveResource({ id: storageKey, type: SQL_QUERY_DRAFT_TYPE, data, updated_at: Date.now() }).catch(() => {});
    }
  }, [storageKey]);
  const patchTab = useCallback((key: string, patch: Partial<QueryTab>) => {
    if (patch.script !== undefined && activeTabRef.current?.key === key) activeTabRef.current = { ...activeTabRef.current, ...patch };
    setQueryState(prev => {
      const next = { ...prev, tabs: prev.tabs.map(tab => tab.key === key ? { ...tab, ...patch } : tab) };
      queryStateRef.current = next;
      return next;
    });
  }, []);

  const patchActiveTab = (patch: Partial<QueryTab>) => {
    if (!activeKey) return;
    patchTab(activeKey, patch);
  };

  const updateScript = useCallback((script: string) => {
    const tab = activeTabRef.current;
    if (!tab) return;
    draftEditedRef.current = true;
    patchTab(tab.key, { script });
  }, [patchTab]);

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
    const tab = activeTabRef.current;
    if (!tab) return;
    const res = await apiFetch(`/api/catalogs/${connectionId}/queries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tab.id, dbClientId, groupName: tab.groupName, name: tab.name, script: tab.script }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save SQL query');
    patchTab(tab.key, { id: data.query.id });
    setQueries(previous => setQueryCache(queryCacheKey, [...previous.filter(query => query.id !== data.query.id), data.query]));
    toast.success('SQL query saved');
  };

  const deleteActiveQuery = async () => {
    if (!activeTab?.id) return;
    const res = await apiFetch(`/api/catalogs/${connectionId}/queries/${activeTab.id}?dbClientId=${dbClientId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete SQL query');
    setQueries(previous => setQueryCache(queryCacheKey, previous.filter(query => query.id !== activeTab.id)));
    setQueryState(prev => {
      const next = prev.tabs.filter(tab => tab.id !== activeTab.id);
      return next.length ? { tabs: next, activeKey: next.at(-1)!.key } : emptyQueryState;
    });
    toast.success('SQL query deleted');
  };

  const execute = useCallback(async (mode: 'run' | 'explain', scriptOverride?: string) => {
    const tab = activeTabRef.current;
    if (!tab) return;
    const script = scriptOverride ?? tab.script;
    setRunningMode(mode);
    const runId = crypto.randomUUID();
    runningIdRef.current = runId;
    const started = Date.now();
    let status: QueryExecution['status'] = 'success';
    patchTab(tab.key, { error: null });
    try {
      const res = await apiFetch(`/api/catalogs/${connectionId}/query/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, runId, mode, ...(mode === 'run' ? { maxRows: 200 } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to run SQL query');
      patchTab(tab.key, { result: data, resultPage: 1 });
    } catch (err: any) {
      status = runningIdRef.current ? 'error' : 'cancelled';
      patchTab(tab.key, { error: err.message });
    } finally {
      const entry: QueryExecution = { id: runId, script, mode, status, durationMs: Date.now() - started, executedAt: new Date().toISOString() };
      setHistory(previous => {
        const next = [entry, ...previous].slice(0, 100);
        try { localStorage.setItem(`erd-db-query-history:${connectionId}`, JSON.stringify(next)); } catch {}
        return next;
      });
      runningIdRef.current = null;
      setRunningMode(null);
    }
  }, [connectionId, patchTab]);

  const run = useCallback((script?: string) => execute('run', script), [execute]);
  const explain = useCallback((script?: string) => execute('explain', script), [execute]);
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

  const getRunnableScript = () => {
    const tab = activeTabRef.current;
    if (!tab) return '';
    return runnableSql(queryEditorRef.current, tab.script);
  };

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
                  <SqlQueryEditor
                    key={activeTab.key}
                    editorRef={queryEditorRef}
                    value={reconcileLiveTab(activeTab, activeTabRef.current)?.script || ''}
                    tables={tables}
                    resolvedTheme={resolvedTheme}
                    onChange={updateScript}
                    onRun={run}
                    onBeautify={beautifyActiveTab}
                  />
                </div>
                <DataQueryEditorActions beautifying={beautifying} runningMode={runningMode} onBeautify={() => beautifyActiveTab()} onStop={() => void cancelRun()} onExplain={() => explain(getRunnableScript())} onRun={() => run(getRunnableScript())} />
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
});
