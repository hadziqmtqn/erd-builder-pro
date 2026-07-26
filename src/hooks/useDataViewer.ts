import { useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { DATA_VIEWER_STORAGE_PREFIX, makeRecordFilter, OpenTableTab, RecordFilter, RecordsResult, RecordSort } from './useDataViewerHelpers';

export function useDataViewer(connectionId: number | null, stateKey?: string) {
  const [tables, setTables] = useState<any[]>([]);
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<OpenTableTab[]>([]);
  const [filters, setFilters] = useState<RecordFilter[]>([]);
  const [sort, setSort] = useState<RecordSort | null>(null);
  const [records, setRecords] = useState<RecordsResult | null>(null);
  const [page, setPage] = useState(1);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const appliedFiltersRef = useRef<RecordFilter[]>([]);
  const sortRef = useRef<RecordSort | null>(null);
  const filtersRef = useRef<RecordFilter[]>([]);
  const pageByTableRef = useRef<Record<string, number>>({});
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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoadingTables(false);
    }
  }, [connectionId]);

  const refreshTables = useCallback(() => fetchTables(), [fetchTables]);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const fetchRecords = useCallback(async (table: string, p: number = 1, nextFilters = appliedFiltersRef.current, nextSort = sortRef.current) => {
    if (!connectionId) return;
    appliedFiltersRef.current = nextFilters;
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
    appliedFiltersRef.current = [];
    sortRef.current = null;
    setSort(null);
    setRecords(null);
    setPage(1);
    pageByTableRef.current = {};
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

  const selectTable = useCallback((tableName: string) => {
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
    setFilters([]);
    appliedFiltersRef.current = [];
    sortRef.current = null;
    setSort(null);
    setRecords(null);
    setPage(nextPage);
    fetchRecords(tableName, nextPage, []);
  }, [fetchRecords, openTabs]);

  const pinTable = useCallback((tableName: string) => {
    setOpenTabs(prev => prev.map(tab => tab.name === tableName ? { ...tab, pinned: true } : tab));
  }, []);

  const closeTable = useCallback((tableName: string) => {
    const next = openTabs.filter(tab => tab.name !== tableName);
    delete pageByTableRef.current[tableName];
    setOpenTabs(next);
    if (activeTable !== tableName) return;
    const fallback = next[next.length - 1]?.name ?? null;
    const fallbackPage = fallback ? pageByTableRef.current[fallback] ?? 1 : 1;
    setActiveTable(fallback);
    setFilters([]);
    appliedFiltersRef.current = [];
    sortRef.current = null;
    setSort(null);
    setRecords(null);
    setPage(fallbackPage);
    if (fallback) fetchRecords(fallback, fallbackPage, []);
  }, [activeTable, openTabs, fetchRecords]);

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
    setFilters(prev => [...prev, makeRecordFilter(column)]);
  }, []);

  const removeFilter = useCallback((id: string) => {
    setFilters(prev => prev.filter(filter => filter.id !== id));
  }, []);

  const updateFilter = useCallback((id: string, patch: Partial<RecordFilter>) => {
    setFilters(prev => prev.map(filter => filter.id === id ? { ...filter, ...patch } : filter));
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
    setActiveTable(tableName);
    setFilters(nextFilters);
    appliedFiltersRef.current = nextFilters;
    sortRef.current = null;
    setSort(null);
    setRecords(null);
    setPage(1);
    fetchRecords(tableName, 1, nextFilters);
  }, [fetchRecords]);

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

  const updateStructure = useCallback(async (patch: Record<string, any>) => {
    if (!connectionId || !activeTable) return;
    const res = await apiFetch(`/api/catalogs/${connectionId}/structure`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: activeTable, ...patch }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update structure');
    const nextTable = patch.tableName || activeTable;
    setActiveTable(nextTable);
    setOpenTabs(prev => prev.map(tab => tab.name === activeTable ? { ...tab, name: nextTable, pinned: true } : tab));
    pageByTableRef.current[nextTable] = pageByTableRef.current[activeTable] ?? page;
    if (nextTable !== activeTable) delete pageByTableRef.current[activeTable];
    await fetchTables();
    fetchRecords(nextTable, pageByTableRef.current[nextTable] ?? page);
    return data;
  }, [activeTable, connectionId, fetchRecords, fetchTables, page]);

  const refreshRecords = useCallback(() => {
    if (activeTable) fetchRecords(activeTable, pageByTableRef.current[activeTable] ?? page);
  }, [activeTable, fetchRecords, page]);

  const clearFilters = useCallback(() => {
    setFilters([]);
    appliedFiltersRef.current = [];
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
    tables,
    activeTable,
    openTabs,
    filters,
    sort,
    records,
    page,
    totalPages,
    isLoadingTables,
    isLoadingRecords,
    error,
    fetchTables,
    refreshTables,
    selectTable,
    pinTable,
    closeTable,
    addFilter,
    removeFilter,
    updateFilter,
    applyFilter,
    applyFilters,
    openRelatedRecord,
    updateRecord,
    updateStructure,
    refreshRecords,
    clearFilters,
    toggleSort,
    nextPage,
    prevPage,
  };
}
