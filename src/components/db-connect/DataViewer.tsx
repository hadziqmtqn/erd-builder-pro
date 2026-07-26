import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Database } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { useDataViewer } from '@/hooks/useDataViewer';
import { useStructureEditor } from '@/hooks/useStructureEditor';
import { DataViewerDetailsPanel } from './DataViewerDetailsPanel';
import { DataViewerFilters } from './DataViewerFilters';
import { DataViewerRecordsTable } from './DataViewerRecordsTable';
import { DataViewerSidebar } from './DataViewerSidebar';
import { DataViewerStructure } from './DataViewerStructure';
import { DataViewerStructurePanel } from './DataViewerStructurePanel';
import { DataViewerTableTabs } from './DataViewerTableTabs';
import { createColumnHelpers, draftValue, submitValue } from './data-viewer-utils';

interface DataViewerProps { connectionId: number; stateKey?: string; }
type DataViewerView = 'data' | 'structure';

export function DataViewer({ connectionId, stateKey }: DataViewerProps) {
  const {
    tables, activeTable, openTabs, filters, sort, records, page, totalPages,
    isLoadingTables, isLoadingRecords, error,
    fetchTables, refreshTables, refreshRecords, selectTable, pinTable, closeTable, addFilter, removeFilter, updateFilter, applyFilter, applyFilters, openRelatedRecord, updateRecord, updateStructure, clearFilters, toggleSort, nextPage, prevPage,
  } = useDataViewer(connectionId, stateKey);
  const [tableSearch, setTableSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [activeView, setActiveView] = useState<DataViewerView>('data');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<Record<string, any> | null>(null);
  const [draftRow, setDraftRow] = useState<Record<string, any>>({});
  const [fkOptionsByColumn, setFkOptionsByColumn] = useState<Record<string, Record<string, any>[]>>({});
  const [datePickerOpenColumn, setDatePickerOpenColumn] = useState<string | null>(null);
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const viewByTableRef = useRef<Record<string, DataViewerView>>({});

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

  const activeTableSchema = useMemo(() => {
    return tables.find((item: any) => item.table_name === activeTable);
  }, [activeTable, tables]);
  const structureEditor = useStructureEditor(activeTableSchema, tables, updateStructure);

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
    if (!isRecordDirty && !structureEditor.isDirty) return true;
    toast.warning(`Save the ${isRecordDirty ? 'record' : 'structure'} changes before switching.`);
    return false;
  }, [isRecordDirty, structureEditor.isDirty]);

  const openFilters = useCallback(() => {
    if (!activeTable) return;
    setShowFilters(true);
    if (filters.length === 0 && columnOptions.length > 0) addFilter(columnOptions[0]);
  }, [activeTable, filters.length, columnOptions, addFilter]);
  const handleSelectTable = useCallback((tableName: string) => {
    if (!warnUnsaved()) return;
    setActiveView(viewByTableRef.current[tableName] || 'data');
    selectTable(tableName);
  }, [selectTable, warnUnsaved]);
  const handleCloseTable = useCallback((tableName: string) => {
    if (!warnUnsaved()) return;
    delete viewByTableRef.current[tableName];
    closeTable(tableName);
  }, [closeTable, warnUnsaved]);
  const handleSelectRow = useCallback((row: Record<string, any>) => {
    if (selectedRow !== row && !warnUnsaved()) return;
    setSelectedRow(row);
    setDetailsOpen(true);
  }, [selectedRow, warnUnsaved]);
  const handleViewChange = useCallback((view: DataViewerView) => {
    if (view === activeView) return;
    if (!warnUnsaved()) return;
    if (activeTable) viewByTableRef.current[activeTable] = view;
    setActiveView(view);
    if (view === 'structure') setDetailsOpen(false);
  }, [activeTable, activeView, warnUnsaved]);

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

  const handleSubmitStructure = useCallback(async () => {
    if (!structureEditor.isDirty) return;
    try {
      await structureEditor.save();
      toast.success('Structure updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update structure');
    }
  }, [structureEditor]);

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
    structureEditor.close();
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
      } else if (key === 's') {
        e.preventDefault();
        if (activeView === 'structure') {
          handleSubmitStructure();
        } else {
          handleSubmitRecord();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTable, activeView, handleSubmitRecord, handleSubmitStructure, openFilters]);

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
              <DataViewerTableTabs
                activeTable={activeTable}
                openTabs={openTabs}
                onCloseTable={handleCloseTable}
                onSelectTable={handleSelectTable}
                onPinTable={pinTable}
              />
              {activeView === 'structure' && activeTableSchema ? (
                <DataViewerStructure
                  table={activeTableSchema}
                  selectedColumnName={structureEditor.target?.kind === 'column' ? structureEditor.target.columnName : null}
                  onEditTable={structureEditor.editTable}
                  onSelectColumn={structureEditor.editColumn}
                  onRefresh={() => warnUnsaved() && refreshTables()}
                />
              ) : (
                <DataViewerRecordsTable
                  activeTable={activeTable}
                  columnHelpers={columnHelpers}
                  error={error}
                  foreignKeyByColumn={foreignKeyByColumn}
                  isLoadingRecords={isLoadingRecords}
                  records={records}
                  selectedRow={selectedRow}
                  sort={sort}
                  detailsOpen={detailsOpen}
                  handleSelectRow={handleSelectRow}
                  openRelatedRecord={openRelatedRecord}
                  setDetailsOpen={setDetailsOpen}
                  onRefresh={refreshRecords}
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
              )}
            </div>

            {(records || activeTableSchema) && (
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2 border-t bg-muted/10 shrink-0">
                <div className="flex items-center gap-1 justify-self-start">
                  {(['data', 'structure'] as const).map(view => (
                    <Button
                      key={view}
                      variant={activeView === view ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-7 px-3 capitalize"
                      onClick={() => handleViewChange(view)}
                    >
                      {view}
                    </Button>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground justify-self-center">
                  {activeView === 'structure'
                    ? `${activeTableSchema?.columns?.length || 0} columns`
                    : records && records.total > 0
                      ? `${((page || 1) - 1) * (records.pageSize || 50) + 1}-${Math.min((page || 1) * (records.pageSize || 50), Number(records.total))} of ${records.total} rows`
                      : '0 rows'}
                </span>
                {activeView === 'data' && records && (
                  <div className="flex items-center gap-1 justify-self-end">
                    <Button variant="outline" size="icon-xs" disabled={page <= 1} onClick={() => warnUnsaved() && prevPage()}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon-xs" disabled={page >= totalPages} onClick={() => warnUnsaved() && nextPage()}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {activeView === 'data' && detailsOpen && (
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
      {activeView === 'structure' && structureEditor.target && structureEditor.draft && (
        <DataViewerStructurePanel
          target={structureEditor.target}
          draft={structureEditor.draft}
          isDirty={structureEditor.isDirty}
          isSaving={structureEditor.isSaving}
          tables={tables}
          referenceColumns={structureEditor.referenceColumns}
          setDraft={structureEditor.setDraft}
          onClose={structureEditor.close}
          onSave={handleSubmitStructure}
        />
      )}
    </div>
  );
}
