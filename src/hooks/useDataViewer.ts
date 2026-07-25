import { useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api';

interface RecordsResult {
  columns: string[];
  rows: Record<string, any>[];
  total: number;
  page: number;
  pageSize: number;
}

interface OpenTableTab {
  name: string;
  pinned: boolean;
}

export interface RecordFilter {
  id: string;
  enabled: boolean;
  column: string;
  operator: string;
  value: string;
  value2?: string;
}

interface RecordSort {
  column: string;
  direction: 'asc' | 'desc';
}

const STORAGE_PREFIX = 'erd-production-db-tabs:';

const makeFilter = (column = ''): RecordFilter => ({
  id: crypto.randomUUID(),
  enabled: true,
  column,
  operator: 'CONTAINS',
  value: '',
  value2: '',
});

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
  const hydratedKeyRef = useRef<string | null>(null);
  const skipNextSaveRef = useRef(false);
  const storageKey = stateKey ? `${STORAGE_PREFIX}${stateKey}` : null;

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
    setPage(1);
    fetchRecords(tableName, 1, []);
  }, [fetchRecords]);

  const pinTable = useCallback((tableName: string) => {
    setOpenTabs(prev => prev.map(tab => tab.name === tableName ? { ...tab, pinned: true } : tab));
  }, []);

  const closeTable = useCallback((tableName: string) => {
    const next = openTabs.filter(tab => tab.name !== tableName);
    setOpenTabs(next);
    if (activeTable !== tableName) return;
    const fallback = next[next.length - 1]?.name ?? null;
    setActiveTable(fallback);
    setFilters([]);
    appliedFiltersRef.current = [];
    sortRef.current = null;
    setSort(null);
    setRecords(null);
    setPage(1);
    if (fallback) fetchRecords(fallback, 1, []);
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

  const goToPage = useCallback((p: number) => {
    if (!activeTable || p < 1 || (totalPages && p > totalPages)) return;
    fetchRecords(activeTable, p);
  }, [activeTable, totalPages, fetchRecords]);

  const addFilter = useCallback((column = '') => {
    setFilters(prev => [...prev, makeFilter(column)]);
  }, []);

  const removeFilter = useCallback((id: string) => {
    setFilters(prev => prev.filter(filter => filter.id !== id));
  }, []);

  const updateFilter = useCallback((id: string, patch: Partial<RecordFilter>) => {
    setFilters(prev => prev.map(filter => filter.id === id ? { ...filter, ...patch } : filter));
  }, []);

  const applyFilters = useCallback((nextFilters = filtersRef.current) => {
    if (!activeTable) return;
    fetchRecords(activeTable, 1, nextFilters);
  }, [activeTable, fetchRecords]);

  const applyFilter = useCallback((filter: RecordFilter) => {
    if (!activeTable) return;
    fetchRecords(activeTable, 1, [{ ...filter, enabled: true }]);
  }, [activeTable, fetchRecords]);

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
    selectTable,
    pinTable,
    closeTable,
    addFilter,
    removeFilter,
    updateFilter,
    applyFilter,
    applyFilters,
    clearFilters,
    toggleSort,
    nextPage,
    prevPage,
    goToPage,
    refresh: () => activeTable && fetchRecords(activeTable, page),
  };
}
