import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Database } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { useDataViewer } from '@/hooks/useDataViewer';
import { DataViewerDetailsPanel } from './DataViewerDetailsPanel';
import { DataViewerFilters } from './DataViewerFilters';
import { DataViewerRecordsTable } from './DataViewerRecordsTable';
import { DataViewerSidebar } from './DataViewerSidebar';
import { createColumnHelpers, draftValue, submitValue } from './data-viewer-utils';

interface DataViewerProps { connectionId: number; stateKey?: string; }

export function DataViewer({ connectionId, stateKey }: DataViewerProps) {
  const {
    tables, activeTable, openTabs, filters, sort, records, page, totalPages,
    isLoadingTables, isLoadingRecords, error,
    fetchTables, selectTable, pinTable, closeTable, addFilter, removeFilter, updateFilter, applyFilter, applyFilters, openRelatedRecord, updateRecord, clearFilters, toggleSort, nextPage, prevPage,
  } = useDataViewer(connectionId, stateKey);
  const [tableSearch, setTableSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<Record<string, any> | null>(null);
  const [draftRow, setDraftRow] = useState<Record<string, any>>({});
  const [fkOptionsByColumn, setFkOptionsByColumn] = useState<Record<string, Record<string, any>[]>>({});
  const [datePickerOpenColumn, setDatePickerOpenColumn] = useState<string | null>(null);
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const shortcutLabel = useMemo(() => {
    if (typeof navigator === 'undefined') return 'Ctrl+P';
    return /mac|iphone|ipad|ipod/i.test(navigator.platform) ? '⌘P' : 'Ctrl+P';
  }, []);

  const filteredTables = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return tables;
    return tables.filter((table: any) => String(table.table_name).toLowerCase().includes(q));
  }, [tables, tableSearch]);

  const columnOptions = useMemo(() => {
    const table = tables.find((item: any) => item.table_name === activeTable);
    return (table?.columns || records?.columns || []).map((col: any) => typeof col === 'string' ? col : col.name).filter(Boolean);
  }, [activeTable, tables, records]);

  const foreignKeyByColumn = useMemo(() => {
    const table = tables.find((item: any) => item.table_name === activeTable);
    return new Map<string, any>((table?.foreign_keys || []).map((fk: any) => [fk.column, fk]));
  }, [activeTable, tables]);

  const columnHelpers = useMemo(() => {
    const table = tables.find((item: any) => item.table_name === activeTable);
    return createColumnHelpers(new Map<string, any>((table?.columns || []).map((col: any) => [col.name, col])));
  }, [activeTable, tables]);

  const primaryKeyColumns = useMemo(() => {
    const table = tables.find((item: any) => item.table_name === activeTable);
    return (table?.columns || []).filter((col: any) => col.is_pk).map((col: any) => col.name);
  }, [activeTable, tables]);

  const isRecordDirty = useMemo(() => {
    if (!selectedRow || !records) return false;
    return records.columns.some((col: string) => (draftRow[col] ?? '') !== draftValue(col, selectedRow[col], columnHelpers));
  }, [columnHelpers, draftRow, records, selectedRow]);

  const changedValues = useMemo(() => {
    if (!selectedRow || !records) return {};
    return Object.fromEntries(records.columns
      .filter((col: string) => (draftRow[col] ?? '') !== draftValue(col, selectedRow[col], columnHelpers))
      .map((col: string) => [col, submitValue(col, draftRow[col] ?? '', columnHelpers)]));
  }, [columnHelpers, draftRow, records, selectedRow]);

  const warnUnsaved = useCallback(() => {
    if (!isRecordDirty) return true;
    toast.warning('Save the record changes before switching.');
    return false;
  }, [isRecordDirty]);

  const openFilters = useCallback(() => {
    if (!activeTable) return;
    setShowFilters(true);
    if (filters.length === 0 && columnOptions.length > 0) addFilter(columnOptions[0]);
  }, [activeTable, filters.length, columnOptions, addFilter]);
  const handleSelectTable = useCallback((tableName: string) => {
    if (!warnUnsaved()) return;
    selectTable(tableName);
  }, [selectTable, warnUnsaved]);
  const handleCloseTable = useCallback((tableName: string) => {
    if (!warnUnsaved()) return;
    closeTable(tableName);
  }, [closeTable, warnUnsaved]);
  const handleSelectRow = useCallback((row: Record<string, any>) => {
    if (selectedRow !== row && !warnUnsaved()) return;
    setSelectedRow(row);
    setDetailsOpen(true);
  }, [selectedRow, warnUnsaved]);

  const handleSubmitRecord = useCallback(async () => {
    if (!activeTable || !selectedRow || !records) return;
    const key = Object.fromEntries(primaryKeyColumns.map((col: string) => [col, selectedRow[col]]));
    if (primaryKeyColumns.length === 0 || Object.keys(changedValues).length === 0) return;

    setIsSavingRecord(true);
    try {
      await updateRecord(activeTable, key, changedValues);
      toast.success('Record updated');
      setSelectedRow(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update record');
    } finally {
      setIsSavingRecord(false);
    }
  }, [activeTable, changedValues, primaryKeyColumns, records, selectedRow, updateRecord]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  useEffect(() => {
    if (!selectedRow || !records) {
      setDraftRow({});
      return;
    }
    setDraftRow(Object.fromEntries(records.columns.map((col: string) => [
      col,
      draftValue(col, selectedRow[col], columnHelpers),
    ])));
  }, [columnHelpers, records, selectedRow]);

  useEffect(() => {
    if (!activeTable || !selectedRow || foreignKeyByColumn.size === 0) {
      setFkOptionsByColumn({});
      return;
    }

    let cancelled = false;
    Promise.all([...foreignKeyByColumn.entries()].map(async ([column, fk]: any) => {
      const res = await apiFetch(`/api/catalogs/${connectionId}/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: fk.ref_table,
          page: 1,
          pageSize: 200,
          sort: { column: fk.ref_column, direction: 'asc' },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load related records');
      return [column, data.rows || []] as const;
    })).then(entries => {
      if (!cancelled) setFkOptionsByColumn(Object.fromEntries(entries));
    }).catch(() => {
      if (!cancelled) setFkOptionsByColumn({});
    });

    return () => { cancelled = true; };
  }, [activeTable, connectionId, foreignKeyByColumn, selectedRow]);

  useEffect(() => {
    setShowFilters(false);
    setSelectedRow(null);
  }, [activeTable]);

  useEffect(() => {
    setSelectedRow(null);
  }, [page]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      const target = e.target as HTMLElement | null;
      const isTyping = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (key === 'p' && !isTyping) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (key === 'f' && activeTable) {
        e.preventDefault();
        openFilters();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTable, openFilters]);

  return (
    <div className="flex flex-1 overflow-hidden">
      <DataViewerSidebar
        activeTable={activeTable}
        error={error}
        filteredTables={filteredTables}
        isLoadingTables={isLoadingTables}
        searchRef={searchRef}
        shortcutLabel={shortcutLabel}
        tableSearch={tableSearch}
        tables={tables}
        onSelectTable={handleSelectTable}
        setTableSearch={setTableSearch}
      />

      <div className="flex-1 grid grid-rows-[1fr_auto] overflow-hidden">
        {!activeTable ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <Database className="w-8 h-8 text-muted-foreground/30" />
              <span>Select a table to view records</span>
            </div>
          </div>
        ) : (
          <>
            <div className="min-h-0 overflow-hidden flex flex-col">
              <DataViewerRecordsTable
                activeTable={activeTable}
                columnHelpers={columnHelpers}
                error={error}
                foreignKeyByColumn={foreignKeyByColumn}
                isLoadingRecords={isLoadingRecords}
                openTabs={openTabs}
                records={records}
                selectedRow={selectedRow}
                sort={sort}
                detailsOpen={detailsOpen}
                handleCloseTable={handleCloseTable}
                handleSelectRow={handleSelectRow}
                handleSelectTable={handleSelectTable}
                openRelatedRecord={openRelatedRecord}
                pinTable={pinTable}
                setDetailsOpen={setDetailsOpen}
                toggleSort={toggleSort}
                warnUnsaved={warnUnsaved}
              >
                {showFilters && filters.length > 0 && (
                  <DataViewerFilters
                    columnOptions={columnOptions}
                    filters={filters}
                    addFilter={addFilter}
                    applyFilter={applyFilter}
                    applyFilters={applyFilters}
                    clearFilters={clearFilters}
                    removeFilter={removeFilter}
                    setShowFilters={setShowFilters}
                    updateFilter={updateFilter}
                    warnUnsaved={warnUnsaved}
                  />
                )}
              </DataViewerRecordsTable>
            </div>

            {records && (
              <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/10 shrink-0">
                <span className="text-xs text-muted-foreground">
                  {records.total > 0
                    ? `${((page || 1) - 1) * (records.pageSize || 50) + 1}-${Math.min((page || 1) * (records.pageSize || 50), Number(records.total))} of ${records.total}`
                    : '0 rows'}
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon-xs" disabled={page <= 1} onClick={() => warnUnsaved() && prevPage()}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon-xs" disabled={page >= totalPages} onClick={() => warnUnsaved() && nextPage()}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {detailsOpen && (
        <DataViewerDetailsPanel
          activeTable={activeTable}
          columnHelpers={columnHelpers}
          datePickerOpenColumn={datePickerOpenColumn}
          draftRow={draftRow}
          fkOptionsByColumn={fkOptionsByColumn}
          foreignKeyByColumn={foreignKeyByColumn}
          isRecordDirty={isRecordDirty}
          isSavingRecord={isSavingRecord}
          primaryKeyColumns={primaryKeyColumns}
          records={records}
          selectedRow={selectedRow}
          setDatePickerOpenColumn={setDatePickerOpenColumn}
          setDetailsOpen={setDetailsOpen}
          setDraftRow={setDraftRow}
          onSubmitRecord={handleSubmitRecord}
          warnUnsaved={warnUnsaved}
        />
      )}
    </div>
  );
}
