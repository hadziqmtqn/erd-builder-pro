import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { createColumnHelpers, draftValue, submitValue } from '@/components/db-connect/data-viewer-utils';

type UseRecordEditorArgs = {
  activeTable: string | null;
  columnHelpers: ReturnType<typeof createColumnHelpers>;
  createRecord: (table: string, values: Record<string, any>) => Promise<any>;
  deleteRecord: (table: string, key: Record<string, any> | Record<string, any>[]) => Promise<any>;
  primaryKeyColumns: string[];
  records: any;
  updateRecord: (table: string, key: Record<string, any>, values: Record<string, any>) => Promise<any>;
};

export function useRecordEditor({
  activeTable,
  columnHelpers,
  createRecord,
  deleteRecord,
  primaryKeyColumns,
  records,
  updateRecord,
}: UseRecordEditorArgs) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<Record<string, any> | null>(null);
  const [draftRow, setDraftRow] = useState<Record<string, any>>({});
  const [datePickerOpenColumn, setDatePickerOpenColumn] = useState<string | null>(null);
  const [isCreatingRecord, setIsCreatingRecord] = useState(false);
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Record<string, any>[]>([]);

  const insertableColumns = useMemo(() => records?.columns?.filter((col: string) => columnHelpers.isInsertableColumn(col)) || [], [columnHelpers, records]);
  const rowKey = useCallback((row: Record<string, any>) => JSON.stringify(primaryKeyColumns.map(column => row[column])), [primaryKeyColumns]);
  const selectedRowKeys = useMemo(() => new Set(selectedRows.map(rowKey)), [rowKey, selectedRows]);

  const isRecordDirty = useMemo(() => {
    if (isCreatingRecord) return insertableColumns.some((col: string) => draftRow[col] !== '');
    if (!selectedRow || !records) return false;
    return records.columns.some((col: string) => (draftRow[col] ?? '') !== draftValue(col, selectedRow[col], columnHelpers));
  }, [columnHelpers, draftRow, insertableColumns, isCreatingRecord, records, selectedRow]);

  const changedValues = useMemo(() => {
    if (!selectedRow || !records) return {};
    return Object.fromEntries(records.columns
      .filter((col: string) => (draftRow[col] ?? '') !== draftValue(col, selectedRow[col], columnHelpers))
      .map((col: string) => [col, submitValue(col, draftRow[col] ?? '', columnHelpers)]));
  }, [columnHelpers, draftRow, records, selectedRow]);

  const selectRow = useCallback((row: Record<string, any> | null) => {
    setIsCreatingRecord(false);
    setSelectedRow(row);
  }, []);

  const syncSelectedRowDraft = useCallback(() => {
    if (!selectedRow || !records) {
      setDraftRow({});
      return;
    }
    setDraftRow(Object.fromEntries(records.columns.map((col: string) => [
      col,
      draftValue(col, selectedRow[col], columnHelpers),
    ])));
  }, [columnHelpers, records, selectedRow]);

  const addRecord = useCallback(() => {
    if (!records) return;
    setSelectedRow(null);
    setIsCreatingRecord(true);
    setDraftRow(Object.fromEntries(insertableColumns.map((column: string) => [column, ''])));
    setDetailsOpen(true);
  }, [insertableColumns, records]);

  const cancelCreateRecord = useCallback(() => {
    setIsCreatingRecord(false);
    setDraftRow({});
    setDetailsOpen(false);
  }, []);

  const submitRecord = useCallback(async () => {
    if (!activeTable || !selectedRow || !records) return;
    const key = Object.fromEntries(primaryKeyColumns.map((col: string) => [col, selectedRow[col]]));
    if (primaryKeyColumns.length === 0 || Object.keys(changedValues).length === 0) return;
    setIsSavingRecord(true);
    try {
      await updateRecord(activeTable, key, changedValues);
      toast.success('Record updated');
      setSelectedRow(null);
      setDraftRow({});
      setDetailsOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update record');
    } finally {
      setIsSavingRecord(false);
    }
  }, [activeTable, changedValues, primaryKeyColumns, records, selectedRow, updateRecord]);

  const submitCreateRecord = useCallback(async () => {
    if (!activeTable || !records) return;
    const values = Object.fromEntries(insertableColumns
      .filter((column: string) => draftRow[column] !== '')
      .map((column: string) => [column, submitValue(column, draftRow[column], columnHelpers)]));
    setIsSavingRecord(true);
    try {
      await createRecord(activeTable, values);
      toast.success('Record created');
      cancelCreateRecord();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create record');
    } finally {
      setIsSavingRecord(false);
    }
  }, [activeTable, cancelCreateRecord, columnHelpers, createRecord, draftRow, insertableColumns, records]);

  const removeRecord = useCallback(async () => {
    if (!activeTable || !selectedRow) return;
    const key = Object.fromEntries(primaryKeyColumns.map((col: string) => [col, selectedRow[col]]));
    setIsSavingRecord(true);
    try {
      await deleteRecord(activeTable, key);
      toast.success('Record deleted');
      setSelectedRow(null);
      setDetailsOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete record');
    } finally {
      setIsSavingRecord(false);
    }
  }, [activeTable, deleteRecord, primaryKeyColumns, selectedRow]);

  const toggleSelectedRow = useCallback((row: Record<string, any>, checked: boolean) => {
    setSelectedRows(prev => checked
      ? [...prev.filter(item => rowKey(item) !== rowKey(row)), row]
      : prev.filter(item => rowKey(item) !== rowKey(row)));
  }, [rowKey]);

  const toggleSelectedRows = useCallback((rows: Record<string, any>[], checked: boolean) => {
    setSelectedRows(prev => {
      const keys = new Set(rows.map(rowKey));
      if (!checked) return prev.filter(row => !keys.has(rowKey(row)));
      const kept = prev.filter(row => !keys.has(rowKey(row)));
      return [...kept, ...rows];
    });
  }, [rowKey]);

  const removeSelectedRecords = useCallback(async () => {
    if (!activeTable || selectedRows.length === 0) return;
    const keys = selectedRows.map(row => Object.fromEntries(primaryKeyColumns.map((col: string) => [col, row[col]])));
    setIsSavingRecord(true);
    try {
      await deleteRecord(activeTable, keys);
      toast.success(`${selectedRows.length} record${selectedRows.length === 1 ? '' : 's'} deleted`);
      setSelectedRows([]);
      setSelectedRow(null);
      setDetailsOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete records');
    } finally {
      setIsSavingRecord(false);
    }
  }, [activeTable, deleteRecord, primaryKeyColumns, selectedRows]);

  const clearSelectedRows = useCallback(() => setSelectedRows([]), []);
  const selectRows = useCallback((rows: Record<string, any>[]) => {
    setSelectedRows(rows);
  }, []);

  const resetRecordEditor = useCallback(() => {
    setSelectedRow(null);
    setIsCreatingRecord(false);
    setSelectedRows([]);
  }, []);

  return {
    datePickerOpenColumn,
    detailsOpen,
    draftRow,
    isCreatingRecord,
    isRecordDirty,
    isSavingRecord,
    selectedRow,
    selectedRowKeys,
    selectedRecordCount: selectedRows.length,
    addRecord,
    cancelCreateRecord,
    clearSelectedRows,
    removeRecord,
    removeSelectedRecords,
    resetRecordEditor,
    selectRow,
    selectRows,
    setDatePickerOpenColumn,
    setDetailsOpen,
    setDraftRow,
    submitCreateRecord,
    submitRecord,
    syncSelectedRowDraft,
    toggleSelectedRow,
    toggleSelectedRows,
  };
}
