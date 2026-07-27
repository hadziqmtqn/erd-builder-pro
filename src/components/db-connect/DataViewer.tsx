import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Database } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useDataViewer } from '@/hooks/useDataViewer';
import { useRecordEditor } from '@/hooks/useRecordEditor';
import { useStructureEditor } from '@/hooks/useStructureEditor';
import { DataViewerConfirmModal } from './DataViewerConfirmModal';
import { DataViewerDetailsPanel } from './DataViewerDetailsPanel';
import { DataViewerFilters } from './DataViewerFilters';
import { DataViewerFooter } from './DataViewerFooter';
import { DataViewerRecordsTable } from './DataViewerRecordsTable';
import { DataViewerSidebar } from './DataViewerSidebar';
import { DataViewerStructure } from './DataViewerStructure';
import { DataViewerStructurePanel } from './DataViewerStructurePanel';
import { DataViewerStructureSqlDialog } from './DataViewerStructureSqlDialog';
import { DataViewerTableTabs } from './DataViewerTableTabs';
import { createColumnHelpers } from './data-viewer-utils';

interface DataViewerProps { connectionId: number; stateKey?: string; }
type DataViewerView = 'data' | 'structure';
export function DataViewer({ connectionId, stateKey }: DataViewerProps) {
  const {
    tables, activeTable, openTabs, filters, sort, records, dbType, page, totalPages,
    isLoadingTables, isLoadingRecords, error,
    fetchTables, refreshTables, refreshRecords, selectTable, pinTable, closeTable, addFilter, removeFilter, updateFilter, applyFilter, applyFilters, openRelatedRecord, createRecord, deleteRecord, updateRecord, updateStructure, clearFilters, toggleSort, nextPage, prevPage,
  } = useDataViewer(connectionId, stateKey);
  const [tableSearch, setTableSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [activeView, setActiveView] = useState<DataViewerView>('data');
  const [fkOptionsByColumn, setFkOptionsByColumn] = useState<Record<string, Record<string, any>[]>>({});
  const [confirmAction, setConfirmAction] = useState<null | 'records' | 'column' | 'index'>(null);
  const [sqlDialogOpen, setSqlDialogOpen] = useState(false);
  const [structureSql, setStructureSql] = useState('');
  const [isLoadingSql, setIsLoadingSql] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const viewByTableRef = useRef<Record<string, DataViewerView>>({});
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
  const structureEditor = useStructureEditor(activeTableSchema, tables, updateStructure);
  const columnHelpers = useMemo(() => {
    const table = tables.find((item: any) => item.table_name === activeTable);
    return createColumnHelpers(new Map<string, any>((table?.columns || []).map((col: any) => [col.name, col])));
  }, [activeTable, tables]);
  const primaryKeyColumns = useMemo(() => {
    const table = tables.find((item: any) => item.table_name === activeTable);
    return (table?.columns || []).filter((col: any) => col.is_pk).map((col: any) => col.name);
  }, [activeTable, tables]);

  const recordEditor = useRecordEditor({
    activeTable,
    columnHelpers,
    createRecord,
    deleteRecord,
    primaryKeyColumns,
    records,
    updateRecord,
  });
  const warnUnsaved = useCallback(() => {
    if (!recordEditor.isRecordDirty && !structureEditor.isDirty) return true;
    toast.warning(`Save the ${recordEditor.isRecordDirty ? 'record' : 'structure'} changes before switching.`);
    return false;
  }, [recordEditor.isRecordDirty, structureEditor.isDirty]);

  const openFilters = useCallback(() => {
    if (!activeTable) return;
    setShowFilters(true);
    if (filters.length === 0 && columnOptions.length > 0) addFilter(columnOptions[0]);
  }, [activeTable, filters.length, columnOptions, addFilter]);
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
  const handleSelectRow = useCallback((row: Record<string, any>) => {
    if (recordEditor.selectedRow !== row && !warnUnsaved()) return;
    recordEditor.selectRow(row);
  }, [recordEditor.selectedRow, recordEditor.selectRow, warnUnsaved]);
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
    if (!target || (target.kind !== 'column' && target.kind !== 'index')) return;
    try {
      await updateStructure(target.kind === 'column'
        ? { deleteColumnName: target.columnName }
        : { deleteIndexName: target.indexName });
      toast.success(target.kind === 'column' ? 'Column deleted' : 'Index deleted');
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
  useEffect(() => { fetchTables(); }, [fetchTables]);
  useEffect(() => {
    recordEditor.syncSelectedRowDraft();
  }, [recordEditor.syncSelectedRowDraft]);

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
  }, [activeTable, connectionId, foreignKeyByColumn, recordEditor.selectedRow]);
  useEffect(() => {
    setShowFilters(false);
    recordEditor.resetRecordEditor();
    structureEditor.close();
  }, [activeTable]);

  useEffect(() => {
    recordEditor.resetRecordEditor();
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
      } else if (key === 'r' && activeTable && !isTyping) {
        e.preventDefault();
        if (warnUnsaved()) {
          activeView === 'structure' ? refreshTables() : refreshRecords();
        }
      } else if (key === 's') {
        e.preventDefault();
        if (activeView === 'structure') {
          handleSubmitStructure();
        } else {
          recordEditor.submitRecord();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTable, activeView, handleSubmitStructure, openFilters, recordEditor.submitRecord, refreshRecords, refreshTables, warnUnsaved]);

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
                  isLoading={isLoadingTables}
                  selectedColumnName={structureEditor.target?.kind === 'column' ? structureEditor.target.columnName : null}
                  selectedIndexName={structureEditor.target?.kind === 'index' ? structureEditor.target.indexName : null}
                  onEditTable={structureEditor.editTable}
                  onSelectColumn={structureEditor.editColumn}
                  onSelectIndex={structureEditor.editIndex}
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
                  primaryKeyColumns={primaryKeyColumns}
                  selectedRow={recordEditor.selectedRow}
                  selectedRowKeys={recordEditor.selectedRowKeys}
                  selectedRecordCount={recordEditor.selectedRecordCount}
                  sort={sort}
                  detailsOpen={recordEditor.detailsOpen}
                  handleSelectRow={handleSelectRow}
                  openRelatedRecord={openRelatedRecord}
                  setDetailsOpen={recordEditor.setDetailsOpen}
                  onRefresh={refreshRecords}
                  onAddRecord={() => warnUnsaved() && recordEditor.addRecord()}
                  onDeleteSelectedRecords={() => setConfirmAction('records')}
                  onTogglePageRows={recordEditor.toggleSelectedRows}
                  onToggleSelectedRow={recordEditor.toggleSelectedRow}
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
              <DataViewerFooter
                activeView={activeView}
                page={page}
                records={records}
                tableColumnCount={activeTableSchema?.columns?.length || 0}
                totalPages={totalPages}
                warnUnsaved={warnUnsaved}
                onAddColumn={structureEditor.addColumn}
                onAddIndex={structureEditor.addIndex}
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
          onClose={structureEditor.close}
          onDeleteColumn={() => setConfirmAction('column')}
          onDeleteIndex={() => setConfirmAction('index')}
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
    </div>
  );
}
