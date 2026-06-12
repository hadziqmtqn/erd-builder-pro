import { useState, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api';

interface RecordsResult {
  columns: string[];
  rows: Record<string, any>[];
  total: number;
  page: number;
  pageSize: number;
}

export function useDataViewer(connectionId: number | null) {
  const [tables, setTables] = useState<any[]>([]);
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [records, setRecords] = useState<RecordsResult | null>(null);
  const [page, setPage] = useState(1);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchTables = useCallback(async () => {
    if (!connectionId) return;
    setIsLoadingTables(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/connections/${connectionId}/schema`, { method: 'POST' });
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
      const res = await apiFetch(`/api/connections/${connectionId}/records`, {
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

  const selectTable = useCallback((tableName: string) => {
    setActiveTable(tableName);
    setRecords(null);
    setPage(1);
    fetchRecords(tableName, 1);
  }, [fetchRecords]);

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

  const totalPages = records ? Math.ceil(records.total / records.pageSize) : 0;

  const goToPage = useCallback((p: number) => {
    if (!activeTable || p < 1 || (totalPages && p > totalPages)) return;
    fetchRecords(activeTable, p);
  }, [activeTable, totalPages, fetchRecords]);

  return {
    tables,
    activeTable,
    records,
    page,
    totalPages,
    isLoadingTables,
    isLoadingRecords,
    error,
    fetchTables,
    selectTable,
    nextPage,
    prevPage,
    goToPage,
    refresh: () => activeTable && fetchRecords(activeTable, page),
  };
}
