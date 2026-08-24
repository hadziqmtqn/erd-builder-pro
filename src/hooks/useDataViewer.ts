import { useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { clearSchemaCache, DATA_VIEWER_STORAGE_PREFIX, getRecordCache, getSchemaCache, makeRecordFilter, OpenTableTab, RecordFilter, RecordsResult, RecordSort, setSchemaCache } from './useDataViewerHelpers';

export function useDataViewer(connectionId: number | null, stateKey?: string) {
  const [tables, setTables] = useState<any[]>([]);
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<OpenTableTab[]>([]);
  const [filters, setFilters] = useState<RecordFilter[]>([]);
  const [appliedFilters, setAppliedFilters] = useState<RecordFilter[]>([]);
  const [sort, setSort] = useState<RecordSort | null>(null);
  const [records, setRecords] = useState<RecordsResult | null>(null);
  const [dbType, setDbType] = useState<string | null>(null);
  const [connectionSecurity, setConnectionSecurity] = useState({ environment: 'development', safeMode: 'protected', sslMode: 'disable', queryTimeoutMs: 30000 });
  const [page, setPage] = useState(1);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newTableTab = '__new_table__';
  const abortRef = useRef<AbortController | null>(null);
  const recordCache = connectionId ? getRecordCache(connectionId) : null;
  const appliedFiltersRef = useRef<RecordFilter[]>([]);
  const sortRef = useRef<RecordSort | null>(null);
  const filtersRef = useRef<RecordFilter[]>([]);
  const pageByTableRef = useRef<Record<string, number>>({});
  const tableStateRef = useRef<Record<string, { filters: RecordFilter[]; appliedFilters: RecordFilter[]; sort: RecordSort | null }>>({});
  const hydratedKeyRef = useRef<string | null>(null);
  const skipNextSaveRef = useRef(false);
  const storageKey = stateKey ? `${DATA_VIEWER_STORAGE_PREFIX}${stateKey}` : null;

  const recordCacheKey = (table: string, p: number, nextFilters: RecordFilter[], nextSort: RecordSort | null) =>
    JSON.stringify([connectionId, table, p, nextFilters, nextSort]);

  const clearRecordCache = useCallback(() => {
    recordCache?.clear();
  }, [recordCache]);

  const fetchTables = useCallback(async (force = false) => {
    if (!connectionId) return;
    const cached = !force && getSchemaCache(connectionId);
    if (cached) {
      setTables(cached.schema || []);
      setDbType(cached.dbType || null);
      setConnectionSecurity(cached.connectionSecurity || { environment: 'development', safeMode: 'protected', sslMode: 'disable', queryTimeoutMs: 30000 });
      setIsLoadingTables(false);
      setError(null);
      return;
    }
    setIsLoadingTables(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/catalogs/${connectionId}/schema`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch tables');
      setSchemaCache(connectionId, data);
      setTables(data.schema || []);
      setDbType(data.dbType || null);
      setConnectionSecurity(data.connectionSecurity || { environment: 'development', safeMode: 'protected', sslMode: 'disable', queryTimeoutMs: 30000 });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoadingTables(false);
    }
  }, [connectionId]);

  useEffect(() => { filtersRef.current = filters; }, [filters]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const fetchRecords = useCallback(async (table: string, p: number = 1, nextFilters = appliedFiltersRef.current, nextSort = sortRef.current) => {
    if (!connectionId) return;
    const cacheKey = recordCacheKey(table, p, nextFilters, nextSort);
    const cached = recordCache?.get(cacheKey);
    appliedFiltersRef.current = nextFilters;
    setAppliedFilters(nextFilters);
    sortRef.current = nextSort;
    setSort(nextSort);
    setRecords(cached || null);
    setPage(p);
    abortRef.current?.abort();
    if (cached) {
      pageByTableRef.current[table] = p;
      setIsLoadingRecords(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoadingRecords(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/catalogs/${connectionId}/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, page: p, pageSize: 50, filters: nextFilters, sort: nextSort }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch records');
      if (abortRef.current !== controller) return;
      pageByTableRef.current[table] = p;
      recordCache?.set(cacheKey, data);
      if (recordCache && recordCache.size > 20) {
        recordCache.delete(recordCache.keys().next().value!);
      }
      setRecords(data);
      setPage(p);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message);
    } finally {
      if (abortRef.current === controller) setIsLoadingRecords(false);
    }
  }, [connectionId, recordCache]);

  const saveTableState = useCallback((table: string | null) => {
    if (!table) return;
    tableStateRef.current[table] = { filters: filtersRef.current, appliedFilters: appliedFiltersRef.current, sort: sortRef.current };
  }, []);

  const restoreTableState = useCallback((table: string) => {
    const state = tableStateRef.current[table] || { filters: [], appliedFilters: [], sort: null };
    setFilters(state.filters);
    appliedFiltersRef.current = state.appliedFilters;
    setAppliedFilters(state.appliedFilters);
    sortRef.current = state.sort;
    setSort(state.sort);
    return state;
  }, []);

  useEffect(() => {
    if (!storageKey) return;
    let nextTabs: OpenTableTab[] = [];
    let nextActive: string | null = null;
    let savedPages: Record<string, number> = {};
    let savedStates: typeof tableStateRef.current = {};
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || '{}');
      nextTabs = Array.isArray(saved.openTabs) ? saved.openTabs.filter((tab: any) => tab?.name) : [];
      nextActive = typeof saved.activeTable === 'string' ? saved.activeTable : null;
      if (saved.pageByTable && typeof saved.pageByTable === 'object') {
        savedPages = Object.fromEntries(Object.entries(saved.pageByTable)
          .filter(([, value]) => Number.isInteger(value) && Number(value) > 0)
          .map(([table, value]) => [table, Number(value)]));
      }
      if (saved.tableState && typeof saved.tableState === 'object') {
        savedStates = Object.fromEntries(Object.entries(saved.tableState)
          .filter(([, value]: any) => Array.isArray(value?.filters) && Array.isArray(value?.appliedFilters))
          .map(([table, value]: any) => [table, {
            filters: value.filters,
            appliedFilters: value.appliedFilters,
            sort: value.sort || null,
          }]));
      }
    } catch {}
    abortRef.current?.abort();
    abortRef.current = null;
    skipNextSaveRef.current = true;
    hydratedKeyRef.current = storageKey;
    setOpenTabs(nextTabs);
    setActiveTable(nextActive);
    pageByTableRef.current = savedPages;
    tableStateRef.current = savedStates;
    const activeState = nextActive ? savedStates[nextActive] : null;
    setFilters(activeState?.filters || []);
    setAppliedFilters(activeState?.appliedFilters || []);
    appliedFiltersRef.current = activeState?.appliedFilters || [];
    sortRef.current = activeState?.sort || null;
    setSort(activeState?.sort || null);
    setRecords(null);
    setPage(1);
    const nextPage = nextActive ? savedPages[nextActive] || 1 : 1;
    let fetchTimer: ReturnType<typeof setTimeout> | null = null;
    if (nextActive && nextActive !== newTableTab) {
      setPage(nextPage);
      fetchTimer = setTimeout(() => fetchRecords(nextActive, nextPage, activeState?.appliedFilters || [], activeState?.sort || null));
    }
    return () => { if (fetchTimer) clearTimeout(fetchTimer); };
  }, [storageKey, fetchRecords]);

  useEffect(() => {
    if (!storageKey || hydratedKeyRef.current !== storageKey) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    try {
      if (activeTable) {
        tableStateRef.current[activeTable] = { filters, appliedFilters, sort };
      }
      sessionStorage.setItem(storageKey, JSON.stringify({
        openTabs,
        activeTable,
        pageByTable: pageByTableRef.current,
        tableState: tableStateRef.current,
      }));
    } catch {}
  }, [storageKey, openTabs, activeTable, page, filters, appliedFilters, sort]);

  const openNewTableTab = useCallback(() => {
    saveTableState(activeTable);
    setOpenTabs(prev => prev.some(tab => tab.name === newTableTab) ? prev : [...prev, { name: newTableTab, pinned: true, label: 'New table' } as any]);
    setActiveTable(newTableTab);
  }, [activeTable, saveTableState]);

  const selectTable = useCallback((tableName: string) => {
    if (tableName === newTableTab) return openNewTableTab();
    saveTableState(activeTable);
    const nextPage = openTabs.some(tab => tab.name === tableName)
      ? pageByTableRef.current[tableName] ?? 1
      : 1;
    setOpenTabs(prev => {
      if (prev.some(tab => tab.name === tableName)) return prev;
      const tempIndex = prev.findIndex(tab => !tab.pinned);
      if (tempIndex === -1) return [...prev, { name: tableName, pinned: false }];
      const next = [...prev];
      next[tempIndex] = { name: tableName, pinned: false };
      return next;
    });
    setActiveTable(tableName);
    const state = restoreTableState(tableName);
    setPage(nextPage);
    fetchRecords(tableName, nextPage, state.appliedFilters, state.sort);
  }, [activeTable, fetchRecords, openNewTableTab, openTabs, restoreTableState, saveTableState]);

  const pinTable = useCallback((tableName: string) => {
    setOpenTabs(prev => prev.map(tab => tab.name === tableName ? { ...tab, pinned: true } : tab));
  }, []);

  const closeTable = useCallback((tableName: string) => {
    const next = openTabs.filter(tab => tab.name !== tableName);
    delete pageByTableRef.current[tableName];
    delete tableStateRef.current[tableName];
    setOpenTabs(next);
    if (activeTable !== tableName) return;
    const fallback = next[next.length - 1]?.name ?? null;
    const fallbackPage = fallback ? pageByTableRef.current[fallback] ?? 1 : 1;
    setActiveTable(fallback);
    const state = fallback ? restoreTableState(fallback) : { appliedFilters: [], sort: null };
    if (!fallback) {
      setFilters([]);
      setAppliedFilters([]);
      appliedFiltersRef.current = [];
      sortRef.current = null;
      setSort(null);
    }
    setPage(fallbackPage);
    if (fallback && fallback !== newTableTab) fetchRecords(fallback, fallbackPage, state.appliedFilters, state.sort);
  }, [activeTable, openTabs, fetchRecords, restoreTableState]);

  const nextPage = useCallback(() => {
    if (!activeTable || !records) return;
    const next = page + 1;
    fetchRecords(activeTable, next);
  }, [activeTable, records, page, fetchRecords]);

  const prevPage = useCallback(() => {
    if (!activeTable || page <= 1) return;
    const prev = page - 1;
    fetchRecords(activeTable, prev);
  }, [activeTable, page, fetchRecords]);

  const totalPages = records ? Math.ceil(records.total / (records.pageSize || 50)) : 0;

  const addFilter = useCallback((column = '') => {
    setFilters(prev => {
      const next = [...prev, makeRecordFilter(column)];
      filtersRef.current = next;
      return next;
    });
  }, []);

  const removeFilter = useCallback((id: string) => {
    setFilters(prev => {
      const next = prev.filter(filter => filter.id !== id);
      filtersRef.current = next;
      return next;
    });
  }, []);

  const updateFilter = useCallback((id: string, patch: Partial<RecordFilter>) => {
    setFilters(prev => {
      const next = prev.map(filter => filter.id === id ? { ...filter, ...patch } : filter);
      filtersRef.current = next;
      return next;
    });
  }, []);

  const applyFilters = useCallback((nextFilters = filtersRef.current) => {
    if (!activeTable) return;
    pinTable(activeTable);
    fetchRecords(activeTable, 1, nextFilters);
  }, [activeTable, fetchRecords, pinTable]);

  const applyFilter = useCallback((filter: RecordFilter) => {
    if (!activeTable) return;
    pinTable(activeTable);
    fetchRecords(activeTable, 1, [{ ...filter, enabled: true }]);
  }, [activeTable, fetchRecords, pinTable]);

  const openRelatedRecord = useCallback((tableName: string, column: string, value: any) => {
    const nextFilters = [makeRecordFilter(column)];
    nextFilters[0].operator = '=';
    nextFilters[0].value = String(value);

    setOpenTabs(prev => {
      if (prev.some(tab => tab.name === tableName)) {
        return prev.map(tab => tab.name === tableName ? { ...tab, pinned: true } : tab);
      }
      return [...prev, { name: tableName, pinned: true }];
    });
    saveTableState(activeTable);
    setActiveTable(tableName);
    setFilters(nextFilters);
    appliedFiltersRef.current = nextFilters;
    setAppliedFilters(nextFilters);
    sortRef.current = null;
    setSort(null);
    setPage(1);
    fetchRecords(tableName, 1, nextFilters);
  }, [activeTable, fetchRecords, saveTableState]);

  const updateRecord = useCallback(async (table: string, key: Record<string, any>, values: Record<string, any>) => {
    if (!connectionId) return;
    const res = await apiFetch(`/api/catalogs/${connectionId}/records`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, key, values }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update record');
    clearRecordCache();
    if (activeTable === table) fetchRecords(table, pageByTableRef.current[table] ?? page);
    return data;
  }, [activeTable, clearRecordCache, connectionId, fetchRecords, page]);

  const updateRecords = useCallback(async (table: string, updates: { key: Record<string, any>; values: Record<string, any> }[]) => {
    if (!connectionId || updates.length === 0) return;
    for (const update of updates) {
      const res = await apiFetch(`/api/catalogs/${connectionId}/records`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, key: update.key, values: update.values }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update record');
    }
    clearRecordCache();
    if (activeTable === table) fetchRecords(table, pageByTableRef.current[table] ?? page);
  }, [activeTable, clearRecordCache, connectionId, fetchRecords, page]);

  const createRecord = useCallback(async (table: string, values: Record<string, any>) => {
    if (!connectionId) return;
    const res = await apiFetch(`/api/catalogs/${connectionId}/records/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, values }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create record');
    clearRecordCache();
    if (activeTable === table) fetchRecords(table, pageByTableRef.current[table] ?? page);
    return data;
  }, [activeTable, clearRecordCache, connectionId, fetchRecords, page]);

  const deleteRecord = useCallback(async (table: string, key: Record<string, any> | Record<string, any>[], confirmation?: string) => {
    if (!connectionId) return;
    const res = await apiFetch(`/api/catalogs/${connectionId}/records`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Array.isArray(key) ? { table, keys: key, confirmation } : { table, key, confirmation }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete record');
    clearRecordCache();
    if (activeTable === table) fetchRecords(table, pageByTableRef.current[table] ?? page);
    return data;
  }, [activeTable, clearRecordCache, connectionId, fetchRecords, page]);

  const mutateTables = useCallback(async (patch: Record<string, any>) => {
    if (!connectionId) return;
    const res = await apiFetch(`/api/catalogs/${connectionId}/structure`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: patch.deleteTables?.[0] || patch.truncateTables?.[0] || patch.cloneTable?.source || "__table_action__", ...patch }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update tables');
    clearRecordCache();
    clearSchemaCache(connectionId);
    await fetchTables();
    if (activeTable && patch.truncateTables?.includes(activeTable)) fetchRecords(activeTable, 1);
    return data;
  }, [activeTable, clearRecordCache, connectionId, fetchRecords, fetchTables]);

  const deleteTables = useCallback(async (tableNames: string[], options: { ignoreForeignKeys?: boolean; cascade?: boolean; confirmation?: string }) => {
    if (!connectionId || tableNames.length === 0) return;
    const data = await mutateTables({ deleteTables: tableNames, ...options });
    clearRecordCache();
    const deleted = new Set(tableNames);
    setOpenTabs(prev => prev.filter(tab => !deleted.has(tab.name)));
    tableNames.forEach(name => { delete pageByTableRef.current[name]; delete tableStateRef.current[name]; });
    if (activeTable && deleted.has(activeTable)) {
      const fallback = openTabs.find(tab => !deleted.has(tab.name))?.name ?? null;
      setActiveTable(fallback);
      setRecords(null); setFilters([]); setAppliedFilters([]);
      appliedFiltersRef.current = []; sortRef.current = null; setSort(null);
      if (fallback) fetchRecords(fallback, pageByTableRef.current[fallback] ?? 1);
    }
    return data;
  }, [activeTable, clearRecordCache, connectionId, fetchRecords, mutateTables, openTabs]);

  const updateStructure = useCallback(async (patch: Record<string, any>) => {
    const targetTable = activeTable || (patch.createTable ? '__new__' : null);
    if (!connectionId || !targetTable) return;
    const res = await apiFetch(`/api/catalogs/${connectionId}/structure`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: targetTable, ...patch }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update structure');
    clearRecordCache();
    clearSchemaCache(connectionId);
    const nextTable = patch.createTable?.name || patch.tableName || activeTable;
    setActiveTable(nextTable);
    setOpenTabs(prev => prev.some(tab => tab.name === nextTable)
      ? prev.map(tab => tab.name === activeTable ? { ...tab, name: nextTable, pinned: true } : tab)
      : [...prev, { name: nextTable, pinned: true }]);
    pageByTableRef.current[nextTable] = activeTable ? pageByTableRef.current[activeTable] ?? page : 1;
    if (activeTable && nextTable !== activeTable) delete pageByTableRef.current[activeTable];
    await fetchTables();
    fetchRecords(nextTable, pageByTableRef.current[nextTable] ?? page);
    return data;
  }, [activeTable, clearRecordCache, connectionId, fetchRecords, fetchTables, page]);

  const refreshAll = useCallback(async () => {
    clearRecordCache();
    if (connectionId) clearSchemaCache(connectionId);
    await fetchTables();
    if (activeTable && activeTable !== newTableTab) fetchRecords(activeTable, pageByTableRef.current[activeTable] ?? page);
  }, [activeTable, clearRecordCache, connectionId, fetchRecords, fetchTables, page]);

  const clearFilters = useCallback(() => {
    filtersRef.current = [];
    setFilters([]);
    appliedFiltersRef.current = [];
    setAppliedFilters([]);
    if (activeTable) fetchRecords(activeTable, 1, []);
  }, [activeTable, fetchRecords]);

  const toggleSort = useCallback((column: string) => {
    if (!activeTable) return;
    const current = sortRef.current;
    const nextSort = current?.column !== column
      ? { column, direction: 'asc' as const }
      : current.direction === 'asc'
        ? { column, direction: 'desc' as const }
        : null;
    fetchRecords(activeTable, 1, appliedFiltersRef.current, nextSort);
  }, [activeTable, fetchRecords]);

  return {
    tables, activeTable, openTabs, filters, appliedFilters, sort, records, dbType, connectionSecurity, page, totalPages,
    isLoadingTables, isLoadingRecords, error, fetchTables, selectTable, openNewTableTab, pinTable, closeTable,
    addFilter, removeFilter, updateFilter, applyFilter, applyFilters, openRelatedRecord, createRecord, deleteRecord,
    deleteTables, mutateTables, updateRecord, updateRecords, updateStructure, refreshAll, clearFilters, toggleSort, nextPage, prevPage,
  };
}
