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

const STORAGE_PREFIX = 'erd-production-db-tabs:';

export function useDataViewer(connectionId: number | null, stateKey?: string) {
  const [tables, setTables] = useState<any[]>([]);
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<OpenTableTab[]>([]);
  const [records, setRecords] = useState<RecordsResult | null>(null);
  const [page, setPage] = useState(1);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
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

  const fetchRecords = useCallback(async (table: string, p: number = 1) => {
    if (!connectionId) return;
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
        body: JSON.stringify({ table, page: p, pageSize: 50 }),
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
    setRecords(null);
    setPage(1);
    if (nextActive) fetchRecords(nextActive, 1);
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
    setRecords(null);
    setPage(1);
    fetchRecords(tableName, 1);
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
    setRecords(null);
    setPage(1);
    if (fallback) fetchRecords(fallback, 1);
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

  return {
    tables,
    activeTable,
    openTabs,
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
    nextPage,
    prevPage,
    goToPage,
    refresh: () => activeTable && fetchRecords(activeTable, page),
  };
}
