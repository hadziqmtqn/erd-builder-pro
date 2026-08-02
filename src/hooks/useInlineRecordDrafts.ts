import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { createColumnHelpers, submitValue } from '@/components/db-connect/data-viewer-utils';

type Draft = { rowKey: string; column: string; key: Record<string, any>; value: any };

type Args = {
  activeTable: string | null;
  columnHelpers: ReturnType<typeof createColumnHelpers>;
  primaryKeyColumns: string[];
  updateRecords: (table: string, updates: { key: Record<string, any>; values: Record<string, any> }[]) => Promise<any>;
};

export function useInlineRecordDrafts({ activeTable, columnHelpers, primaryKeyColumns, updateRecords }: Args) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const count = Object.keys(drafts).length;

  const draftCell = useCallback((row: Record<string, any>, column: string, value: any) => {
    if (primaryKeyColumns.length === 0 || columnHelpers.isReadOnlyColumn(column)) return;
    const rowKey = JSON.stringify(primaryKeyColumns.map(col => row[col]));
    const key = Object.fromEntries(primaryKeyColumns.map(col => [col, row[col]]));
    setDrafts(prev => ({ ...prev, [`${rowKey}:${column}`]: { rowKey, column, key, value } }));
  }, [columnHelpers, primaryKeyColumns]);

  const save = useCallback(async () => {
    if (!activeTable || count === 0) return;
    const grouped = new Map<string, { key: Record<string, any>; values: Record<string, any> }>();
    Object.values(drafts).forEach(draft => {
      const entry = grouped.get(draft.rowKey) || { key: draft.key, values: {} };
      entry.values[draft.column] = draft.value === null ? null : submitValue(draft.column, draft.value, columnHelpers);
      grouped.set(draft.rowKey, entry);
    });
    try {
      await updateRecords(activeTable, [...grouped.values()]);
      setDrafts({});
      toast.success(`${count} cell${count === 1 ? '' : 's'} updated`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update records');
    }
  }, [activeTable, columnHelpers, count, drafts, updateRecords]);

  const clear = useCallback(() => setDrafts({}), []);

  return { clear, count, draftCell, drafts, save };
}
