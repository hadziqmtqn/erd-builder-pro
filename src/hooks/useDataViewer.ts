import { useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { DATA_VIEWER_STORAGE_PREFIX, makeRecordFilter, OpenTableTab, RecordFilter, RecordsResult, RecordSort } from './useDataViewerHelpers';

export function useDataViewer(connectionId: number | null, stateKey?: string) {
  const [tables, setTables] = useState<any[]>([]);
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<OpenTableTab[]>([]);
  const [filters, setFilters] = useState<RecordFilter[]>([]);
  const [appliedFilters, setAppliedFilters] = useState<RecordFilter[]>([]);
  const [sort, setSort] = useState<RecordSort | null>(null);
  const [records, setRecords] = useState<RecordsResult | null>(null);
  const [dbType, setDbType] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newTableTab = '__new_table__';
  const abortRef = useRef<AbortController | null>(null);
  const appliedFiltersRef = useRef<RecordFilter[]>([]);
  const sortRef = useRef<RecordSort | null>(null);
  const filtersRef = useRef<RecordFilter[]>([]);
  const pageByTableRef = useRef<Record<string, number>>({});
  const tableStateRef = useRef<Record<string, { filters: RecordFilter[]; appliedFilters: RecordFilter[]; sort: RecordSort | null }>>({});
  const hydratedKeyRef = useRef<string | null>(null);
  const skipNextSaveRef = useRef(false);
  const storageKey = stateKey ? `${DATA_VIEWER_STORAGE_PREFIX}${stateKey}` : null;

  const fetchTables = useCallback(async () => {
    if (!connectionId) return;
    setIsLoadingTables(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/catalogs/${connectionId}/schema`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch tables');
      setTables(data.schema || []);
      setDbType(data.dbType || null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoadingTables(false);
    }
  }, [connectionId]);

  useEffect(() => { filtersRef.current = filters; }, [filters]);

  const fetchRecords = useCallback(async (table: string, p: number = 1, nextFilters = appliedFiltersRef.current, nextSort = sortRef.current) => {
    if (!connectionId) return;
    appliedFiltersRef.current = nextFilters;
    setAppliedFilters(nextFilters);
    sortRef.current = nextSort;
    setSort(nextSort);
    // Abort previous request
    abortRef.current?.abort();
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
      pageByTableRef.current[table] = p;
      setRecords(data);
      setPage(p);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message);
    } finally {
      setIsLoadingRecords(false);
    }
  }, [connectionId]);

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
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || '{}');
      nextTabs = Array.isArray(saved.openTabs) ? saved.openTabs.filter((tab: any) => tab?.name) : [];
      nextActive = typeof saved.activeTable === 'string' ? saved.activeTable : null;
    } catch {}
    skipNextSaveRef.current = true;
    hydratedKeyRef.current = storageKey;
    setOpenTabs(nextTabs);
    setActiveTable(nextActive);
    setFilters([]);
    setAppliedFilters([]);
    appliedFiltersRef.current = [];
    sortRef.current = null;
    setSort(null);
    setRecords(null);
    setPage(1);
    pageByTableRef.current = {};
    tableStateRef.current = {};
    if (nextActive) fetchRecords(nextActive, 1, []);
  }, [storageKey, fetchRecords]);

  useEffect(() => {
    if (!storageKey || hydratedKeyRef.current !== storageKey) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ openTabs, activeTable }));
    } catch {}
  }, [storageKey, openTabs, activeTable]);

  const openNewTableTab = useCallback(() => {
    saveTableState(activeTable);
    setOpenTabs(prev => prev.some(tab => tab.name === newTableTab) ? prev : [...prev, { name: newTableTab, pinned: true, label: 'New table' } as any]);
    setActiveTable(newTableTab);
    setRecords(null);
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
    setRecords(null);
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
    setRecords(null);
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
    setRecords(null);
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
    if (activeTable === table) fetchRecords(table, pageByTableRef.current[table] ?? page);
    return data;
  }, [activeTable, connectionId, fetchRecords, page]);

  const createRecord = useCallback(async (table: string, values: Record<string, any>) => {
    if (!connectionId) return;
    const res = await apiFetch(`/api/catalogs/${connectionId}/records/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, values }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create record');
    if (activeTable === table) fetchRecords(table, pageByTableRef.current[table] ?? page);
    return data;
  }, [activeTable, connectionId, fetchRecords, page]);

  const deleteRecord = useCallback(async (table: string, key: Record<string, any> | Record<string, any>[]) => {
    if (!connectionId) return;
    const res = await apiFetch(`/api/catalogs/${connectionId}/records`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Array.isArray(key) ? { table, keys: key } : { table, key }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete record');
    if (activeTable === table) fetchRecords(table, pageByTableRef.current[table] ?? page);
    return data;
  }, [activeTable, connectionId, fetchRecords, page]);

  const mutateTables = useCallback(async (patch: Record<string, any>) => {
    if (!connectionId) return;
    const res = await apiFetch(`/api/catalogs/${connectionId}/structure`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: patch.deleteTables?.[0] || patch.truncateTables?.[0] || patch.cloneTable?.source || "__table_action__", ...patch }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update tables');
    await fetchTables();
    if (activeTable && patch.truncateTables?.includes(activeTable)) fetchRecords(activeTable, 1);
    return data;
  }, [activeTable, connectionId, fetchRecords, fetchTables]);

  const deleteTables = useCallback(async (tableNames: string[], options: { ignoreForeignKeys?: boolean; cascade?: boolean }) => {
    if (!connectionId || tableNames.length === 0) return;
    const data = await mutateTables({ deleteTables: tableNames, ...options });
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
  }, [activeTable, connectionId, fetchRecords, mutateTables, openTabs]);

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
  }, [activeTable, connectionId, fetchRecords, fetchTables, page]);

  const refreshAll = useCallback(async () => {
    await fetchTables();
    if (activeTable && activeTable !== newTableTab) fetchRecords(activeTable, pageByTableRef.current[activeTable] ?? page);
  }, [activeTable, fetchRecords, fetchTables, page]);

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
    tables, activeTable, openTabs, filters, appliedFilters, sort, records, dbType, page, totalPages,
    isLoadingTables, isLoadingRecords, error, fetchTables, selectTable, openNewTableTab, pinTable, closeTable,
    addFilter, removeFilter, updateFilter, applyFilter, applyFilters, openRelatedRecord, createRecord, deleteRecord,
    deleteTables, mutateTables, updateRecord, updateStructure, refreshAll, clearFilters, toggleSort, nextPage, prevPage,
  };
}
