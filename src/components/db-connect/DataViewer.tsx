import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Database } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useDataViewer } from '@/hooks/useDataViewer';
import { useInlineRecordDrafts } from '@/hooks/useInlineRecordDrafts';
import { useRecordEditor } from '@/hooks/useRecordEditor';
import { useStructureEditor } from '@/hooks/useStructureEditor';
import { DataViewerConfirmModal } from './DataViewerConfirmModal';
import { DataViewerDetailsPanel } from './DataViewerDetailsPanel';
import { DataViewerFilters } from './DataViewerFilters';
import { DataViewerFooter } from './DataViewerFooter';
import { DataViewerRecordsTable } from './DataViewerRecordsTable';
import { DataViewerSidebar } from './DataViewerSidebar';
import { DataViewerTableActions } from './DataViewerTableActions';
import { DataViewerStructure } from './DataViewerStructure';
import { DataViewerStructurePanel } from './DataViewerStructurePanel';
import { DataViewerStructureSqlDialog } from './DataViewerStructureSqlDialog';
import { DataViewerTableTabs } from './DataViewerTableTabs';
import { createColumnHelpers } from './data-viewer-utils';
import ConfirmModal from '@/components/ConfirmModal';

interface DataViewerProps { connectionId: number; stateKey?: string; onDbTypeChange?: (dbType: string | null) => void; } type DataViewerView = 'data' | 'structure';
export function DataViewer({ connectionId, stateKey, onDbTypeChange }: DataViewerProps) {
  const {
    tables, activeTable, openTabs, filters, appliedFilters, sort, records, dbType, page, totalPages,
    isLoadingTables, isLoadingRecords, error,
    fetchTables, refreshAll, selectTable, openNewTableTab, pinTable, closeTable, addFilter, removeFilter, updateFilter, applyFilter, applyFilters, openRelatedRecord, createRecord, deleteRecord, deleteTables, mutateTables, updateRecord, updateRecords, updateStructure, clearFilters, toggleSort, nextPage, prevPage,
  } = useDataViewer(connectionId, stateKey);
  const [tableSearch, setTableSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [activeView, setActiveView] = useState<DataViewerView>('data');
  const [fkOptionsByColumn, setFkOptionsByColumn] = useState<Record<string, Record<string, any>[]>>({});
  const [confirmAction, setConfirmAction] = useState<null | 'records' | 'column' | 'index' | 'check'>(null);
  const [sqlDialogOpen, setSqlDialogOpen] = useState(false);
  const [structureSql, setStructureSql] = useState('');
  const [isLoadingSql, setIsLoadingSql] = useState(false);
  const [discardRefreshOpen, setDiscardRefreshOpen] = useState(false);
  const [discardInlineOpen, setDiscardInlineOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const viewByTableRef = useRef<Record<string, DataViewerView>>({});
  const lastRecordRowKeyRef = useRef<string | null>(null);
  const recordsAreaActiveRef = useRef(false);
  const viewKey = useCallback((tableName: string) => `${stateKey || connectionId}:${tableName}`, [connectionId, stateKey]);
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
  const isNewTableTab = activeTable === '__new_table__';
  const structureEditor = useStructureEditor(activeTableSchema, tables, updateStructure, dbType);
  const columnHelpers = useMemo(() => {
    const table = tables.find((item: any) => item.table_name === activeTable);
    return createColumnHelpers(new Map<string, any>((table?.columns || []).map((col: any) => [col.name, col])));
  }, [activeTable, tables]);
  const primaryKeyColumns = useMemo(() => {
    const table = tables.find((item: any) => item.table_name === activeTable);
    return (table?.columns || []).filter((col: any) => col.is_pk).map((col: any) => col.name);
  }, [activeTable, tables]);
  const recordEditor = useRecordEditor({
    activeTable, columnHelpers, createRecord, deleteRecord, primaryKeyColumns, records, updateRecord,
  });
  const selectedRowRef = useRef(recordEditor.selectedRow);
  const inlineDrafts = useInlineRecordDrafts({ activeTable, columnHelpers, primaryKeyColumns, updateRecords });
  const recordDraftCount = inlineDrafts.count;
  const recordDraftCountRef = useRef(recordDraftCount);
  const recordDirtyRef = useRef(recordEditor.isRecordDirty);
  const structureDirtyRef = useRef(structureEditor.isDirty);
  recordDraftCountRef.current = recordDraftCount;
  recordDirtyRef.current = recordEditor.isRecordDirty;
  selectedRowRef.current = recordEditor.selectedRow;
  structureDirtyRef.current = structureEditor.isDirty;
  const warnUnsaved = useCallback(() => {
    if (recordDraftCountRef.current > 0) {
      toast.warning('Save or discard inline record changes first.');
      return false;
    }
    if (!recordDirtyRef.current && !structureDirtyRef.current) return true;
    toast.warning(`Save the ${recordDirtyRef.current ? 'record' : 'structure'} changes before switching.`);
    return false;
  }, []);
  const openFilters = useCallback(() => {
    if (!activeTable) return;
    setShowFilters(true);
    if (filters.length === 0 && columnOptions.length > 0) addFilter(columnOptions[0]);
  }, [activeTable, filters.length, columnOptions, addFilter]);
  const toggleFilters = useCallback(() => {
    if (showFilters) {
      setShowFilters(false);
      return;
    }
    setActiveView('data');
    openFilters();
  }, [openFilters, showFilters]);
  const handleSelectTable = useCallback((tableName: string) => {
    if (!warnUnsaved()) return;
    setActiveView(viewByTableRef.current[viewKey(tableName)] || 'data');
    selectTable(tableName);
  }, [selectTable, viewKey, warnUnsaved]);
  const handleCloseTable = useCallback((tableName: string) => {
    if (!warnUnsaved()) return;
    delete viewByTableRef.current[viewKey(tableName)];
    closeTable(tableName);
  }, [closeTable, viewKey, warnUnsaved]);
  const rowKey = useCallback((row: Record<string, any>) => JSON.stringify(primaryKeyColumns.map(column => row[column])), [primaryKeyColumns]);
  const selectRecordRange = useCallback((row: Record<string, any>) => {
    const rows = records?.rows || [];
    const from = rows.findIndex((item: any) => rowKey(item) === lastRecordRowKeyRef.current);
    const to = rows.findIndex((item: any) => rowKey(item) === rowKey(row));
    if (from === -1 || to === -1) return false;
    const [start, end] = from < to ? [from, to] : [to, from];
    recordEditor.selectRows(rows.slice(start, end + 1));
    return true;
  }, [recordEditor.selectRows, records, rowKey]);
  const selectRecordForDetails = useCallback((row: Record<string, any>) => {
    if (selectedRowRef.current !== row && recordDirtyRef.current && !warnUnsaved()) return;
    recordEditor.selectRow(row);
    return true;
  }, [recordEditor.selectRow, warnUnsaved]);
  const openRecordDetails = useCallback((row: Record<string, any>) => {
    if (!selectRecordForDetails(row)) return;
    recordEditor.setDetailsOpen(true);
  }, [recordEditor.setDetailsOpen, selectRecordForDetails]);
  const handleSelectRow = useCallback((row: Record<string, any>) => {
    selectRecordForDetails(row);
  }, [selectRecordForDetails]);
  const handleToggleSelectedRow = useCallback((row: Record<string, any>, checked: boolean, event?: React.MouseEvent) => {
    if (selectedRowRef.current !== row && recordDirtyRef.current && !warnUnsaved()) return;
    if (checked && event?.shiftKey && selectRecordRange(row)) return;
    lastRecordRowKeyRef.current = checked ? rowKey(row) : null;
    recordEditor.toggleSelectedRow(row, checked);
  }, [recordEditor.toggleSelectedRow, rowKey, selectRecordRange, warnUnsaved]);
  const handleTogglePageRows = useCallback((rows: Record<string, any>[], checked: boolean) => {
    if (recordDirtyRef.current && !warnUnsaved()) return;
    recordEditor.toggleSelectedRows(rows, checked);
    lastRecordRowKeyRef.current = checked && rows[0] ? rowKey(rows[0]) : null;
  }, [recordEditor.toggleSelectedRows, rowKey, warnUnsaved]);
  const handleAddRecord = useCallback(() => {
    if (warnUnsaved()) recordEditor.addRecord();
  }, [recordEditor.addRecord, warnUnsaved]);
  const handleDeleteSelectedRecords = useCallback(() => {
    if (warnUnsaved()) setConfirmAction('records');
  }, [warnUnsaved]);
  const handleViewChange = useCallback((view: DataViewerView) => {
    if (view === activeView) return;
    if (!warnUnsaved()) return;
    if (activeTable) viewByTableRef.current[viewKey(activeTable)] = view;
    setActiveView(view);
    if (view === 'structure') recordEditor.setDetailsOpen(false);
  }, [activeTable, activeView, viewKey, warnUnsaved]);
  const handleSubmitStructure = useCallback(async () => {
    if (!structureEditor.isDirty) return;
    try {
      await structureEditor.save();
      toast.success('Structure updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update structure');
    }
  }, [structureEditor]);
  const openStructureSql = useCallback(async () => {
    if (!activeTable) return;
    setSqlDialogOpen(true);
    setIsLoadingSql(true);
    setStructureSql('');
    try {
      const res = await apiFetch(`/api/catalogs/${connectionId}/structure/sql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: activeTable }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load table SQL');
      setStructureSql(data.sql || '');
    } catch (err: any) {
      toast.error(err.message || 'Failed to load table SQL');
      setStructureSql('');
    } finally {
      setIsLoadingSql(false);
    }
  }, [activeTable, connectionId]);
  const handleDeleteStructure = useCallback(async () => {
    const target = structureEditor.target;
    if (!target || (target.kind !== 'column' && target.kind !== 'index' && target.kind !== 'check')) return;
    try {
      await updateStructure(target.kind === 'column'
        ? { deleteColumnName: target.columnName }
        : target.kind === 'index'
          ? { deleteIndexName: target.indexName }
          : { deleteCheckName: target.checkName });
      toast.success(target.kind === 'column' ? 'Column deleted' : target.kind === 'index' ? 'Index deleted' : 'Check deleted');
      structureEditor.close();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete structure item');
    } finally {
      setConfirmAction(null);
    }
  }, [structureEditor, updateStructure]);
  const handleConfirmDeleteRecord = useCallback(async () => {
    await recordEditor.removeSelectedRecords();
    setConfirmAction(null);
  }, [recordEditor.removeSelectedRecords]);
  const handleRefresh = useCallback(() => {
    if (recordDraftCount > 0) {
      setDiscardRefreshOpen(true);
      return;
    }
    if (warnUnsaved()) refreshAll();
  }, [recordDraftCount, refreshAll, warnUnsaved]);
  const handleMutateTables = useCallback(async (patch: Record<string, any>) => {
    const data = await mutateTables(patch);
    if (activeTable && patch.truncateTables?.includes(activeTable)) recordEditor.resetRecordEditor();
    return data;
  }, [activeTable, mutateTables, recordEditor.resetRecordEditor]);
  useEffect(() => { fetchTables(); }, [fetchTables]);
  useEffect(() => { onDbTypeChange?.(dbType); }, [dbType, onDbTypeChange]);
  useEffect(() => { recordEditor.syncSelectedRowDraft(); }, [recordEditor.syncSelectedRowDraft]);
  useEffect(() => {
    if (!activeTable || !recordEditor.selectedRow || foreignKeyByColumn.size === 0) {
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
  }, [activeTable, connectionId, foreignKeyByColumn, recordEditor.detailsOpen]);
  useEffect(() => { recordEditor.resetRecordEditor(); inlineDrafts.clear(); if (!isNewTableTab) structureEditor.close(); }, [activeTable, isNewTableTab]);
  useEffect(() => { recordEditor.resetRecordEditor(); inlineDrafts.clear(); lastRecordRowKeyRef.current = null; }, [page]);
  useEffect(() => {
    if (isNewTableTab && structureEditor.target?.kind !== 'addTable') handleCloseTable('__new_table__');
  }, [handleCloseTable, isNewTableTab, structureEditor.target?.kind]);
  useEffect(() => {
    const refresh = () => handleRefresh();
    const toggleDetails = () => recordEditor.setDetailsOpen(open => open ? (warnUnsaved() ? false : true) : true);
    const toggleRecordFilters = () => toggleFilters();
    const events: [string, EventListener][] = [
      ['db-connect-refresh-records', refresh],
      ['db-connect-toggle-filters', toggleRecordFilters],
      ['db-connect-toggle-details', toggleDetails],
    ];
    events.forEach(([name, handler]) => window.addEventListener(name, handler));
    return () => { events.forEach(([name, handler]) => window.removeEventListener(name, handler)); };
  }, [handleRefresh, recordEditor.setDetailsOpen, toggleFilters, warnUnsaved]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && recordDraftCount > 0) {
        e.preventDefault();
        setDiscardInlineOpen(true);
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      const target = e.target as HTMLElement | null;
      const isTyping = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const isSidebar = !!target?.closest('[data-db-client-sidebar]');
      const isRecordsArea = !!target?.closest('[data-db-client-records]') || recordsAreaActiveRef.current;

      if (key === 'p' && !isTyping) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (key === 'f' && activeTable) {
        e.preventDefault();
        toggleFilters();
      } else if (key === 'r' && (!isTyping || recordDraftCount > 0)) {
        e.preventDefault();
        handleRefresh();
      } else if (key === 'a' && activeView === 'data' && activeTable && !isTyping && !isSidebar && isRecordsArea) {
        e.preventDefault();
        recordEditor.selectRows(records?.rows || []);
        recordEditor.selectRow(records?.rows?.[0] || null);
      } else if (key === 's') {
        e.preventDefault();
        if (recordDraftCount > 0) {
          inlineDrafts.save();
        } else if (activeView === 'structure') {
          handleSubmitStructure();
        } else {
          recordEditor.submitRecord();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTable, activeView, handleRefresh, handleSubmitStructure, inlineDrafts.save, recordDraftCount, toggleFilters, recordEditor.selectRows, recordEditor.submitRecord, records, warnUnsaved]);

  return (
    <div
      className="flex flex-1 overflow-hidden"
      onMouseDownCapture={e => {
        recordsAreaActiveRef.current = !!(e.target as HTMLElement | null)?.closest('[data-db-client-records]');
      }}
    >
      <DataViewerSidebar
        activeTable={activeTable} connectionId={connectionId} dbType={dbType} error={error}
        filteredTables={filteredTables}
        isLoadingTables={isLoadingTables}
        searchRef={searchRef}
        shortcutLabel={shortcutLabel}
        tableSearch={tableSearch}
        tables={tables}
        onAddTable={() => {
          if (!warnUnsaved()) return;
          openNewTableTab();
          setActiveView('structure');
          structureEditor.addTable();
        }}
        onDeleteTables={deleteTables} onMutateTables={handleMutateTables} onRefreshTables={refreshAll} onSelectTable={handleSelectTable}
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
                onCloseTable={handleCloseTable} onSelectTable={handleSelectTable} onPinTable={pinTable}
              />
              {activeView === 'structure' && isNewTableTab ? (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Create a new table</div>
              ) : activeView === 'structure' && activeTableSchema ? (
                <DataViewerStructure
                  table={activeTableSchema} isLoading={isLoadingTables}
                  selectedColumnName={structureEditor.target?.kind === 'column' ? structureEditor.target.columnName : null}
                  selectedIndexName={structureEditor.target?.kind === 'index' ? structureEditor.target.indexName : null}
                  selectedCheckName={structureEditor.target?.kind === 'check' ? structureEditor.target.checkName : null}
                  onEditTable={structureEditor.editTable} onSelectColumn={structureEditor.editColumn} onSelectIndex={structureEditor.editIndex} onSelectCheck={structureEditor.editCheck}
                />
              ) : null}
              {activeView === 'data' && !isNewTableTab && (
                <DataViewerRecordsTable
                  activeTable={activeTable}
                  connectionId={connectionId}
                  dbType={dbType}
                  columnHelpers={columnHelpers}
                  error={error}
                  foreignKeyByColumn={foreignKeyByColumn}
                  isLoadingRecords={isLoadingRecords}
                  records={records}
                  tableSchema={activeTableSchema}
                  primaryKeyColumns={primaryKeyColumns}
                  selectedRow={recordEditor.selectedRow}
                  selectedRowKeys={recordEditor.selectedRowKeys}
                  sort={sort}
                  recordDrafts={inlineDrafts.drafts}
                  handleSelectRow={handleSelectRow}
                  onEditRecord={openRecordDetails}
                  onDeleteTables={deleteTables}
                  onMutateTables={handleMutateTables}
                  openRelatedRecord={openRelatedRecord}
                  onAddRecord={handleAddRecord}
                  onDraftCell={inlineDrafts.draftCell}
                  onDeleteSelectedRecords={handleDeleteSelectedRecords}
                  onTogglePageRows={handleTogglePageRows}
                  onToggleSelectedRow={handleToggleSelectedRow}
                  toggleSort={toggleSort}
                  warnUnsaved={warnUnsaved}
                  headerAction={
                    <DataViewerTableActions
                      connectionId={connectionId}
                      dbType={dbType}
                      table={activeTableSchema || { table_name: activeTable, columns: [] }}
                      tables={tables}
                      exportSelectedRows={recordEditor.selectedRows}
                      label="Export"
                      mode="dropdown"
                      onDeleteTables={deleteTables}
                      onMutateTables={handleMutateTables}
                    />
                  }
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
              <DataViewerFooter
                activeView={activeView}
                page={page}
                records={records}
                tableColumnCount={activeTableSchema?.columns?.length || 0}
                totalPages={totalPages}
                warnUnsaved={warnUnsaved}
                onAddColumn={structureEditor.addColumn}
                onAddIndex={structureEditor.addIndex}
                onAddCheck={structureEditor.addCheck}
                onInfo={openStructureSql}
                onNextPage={nextPage}
                onPrevPage={prevPage}
                onViewChange={handleViewChange}
              />
            )}
          </>
        )}
      </div>

      {activeView === 'data' && recordEditor.detailsOpen && (
        <DataViewerDetailsPanel
          activeTable={activeTable}
          columnHelpers={columnHelpers}
          datePickerOpenColumn={recordEditor.datePickerOpenColumn}
          draftRow={recordEditor.draftRow}
          fkOptionsByColumn={fkOptionsByColumn}
          foreignKeyByColumn={foreignKeyByColumn}
          isRecordDirty={recordEditor.isRecordDirty}
          isCreatingRecord={recordEditor.isCreatingRecord}
          isSavingRecord={recordEditor.isSavingRecord}
          primaryKeyColumns={primaryKeyColumns}
          records={records}
          selectedRow={recordEditor.selectedRow}
          setDatePickerOpenColumn={recordEditor.setDatePickerOpenColumn}
          setDetailsOpen={recordEditor.setDetailsOpen}
          setDraftRow={recordEditor.setDraftRow}
          onCancelCreateRecord={recordEditor.cancelCreateRecord}
          onSubmitCreateRecord={recordEditor.submitCreateRecord}
          onSubmitRecord={recordEditor.submitRecord}
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
          dbType={dbType}
          referenceColumns={structureEditor.referenceColumns}
          setDraft={structureEditor.setDraft}
          onClose={() => { structureEditor.close(); if (isNewTableTab) handleCloseTable('__new_table__'); }}
          onDeleteColumn={() => setConfirmAction('column')}
          onDeleteIndex={() => setConfirmAction('index')}
          onDeleteCheck={() => setConfirmAction('check')}
          onSave={handleSubmitStructure}
        />
      )}
      <DataViewerStructureSqlDialog
        activeTable={activeTable}
        isLoading={isLoadingSql}
        open={sqlDialogOpen}
        sql={structureSql}
        onOpenChange={setSqlDialogOpen}
      />
      <DataViewerConfirmModal
        action={confirmAction}
        onCancel={() => setConfirmAction(null)}
        onDeleteRecords={handleConfirmDeleteRecord}
        onDeleteStructure={handleDeleteStructure}
      />
      <ConfirmModal
        isOpen={discardRefreshOpen}
        title="Discard all changes?"
        message="Refresh will discard unsaved inline record changes."
        confirmText="Discard"
        cancelText="Cancel"
        onCancel={() => setDiscardRefreshOpen(false)}
        onConfirm={() => {
          inlineDrafts.clear();
          setDiscardRefreshOpen(false);
          refreshAll();
        }}
      />
      <ConfirmModal
        isOpen={discardInlineOpen}
        title="Discard inline changes?"
        message="This will discard all unsaved inline record changes."
        confirmText="Discard"
        cancelText="Keep editing"
        variant="warning"
        onCancel={() => setDiscardInlineOpen(false)}
        onConfirm={() => {
          inlineDrafts.clear();
          setDiscardInlineOpen(false);
        }}
      />
    </div>
  );
}
