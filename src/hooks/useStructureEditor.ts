import { useCallback, useEffect, useMemo, useState } from 'react';

export type StructureTarget = { kind: 'table' } | { kind: 'column'; columnName: string };

export type StructureDraft = {
  tableName: string;
  columnName: string;
  columnType: string;
  isNullable: boolean;
  columnDefault: string;
  fkEnabled: boolean;
  refTable: string;
  refColumn: string;
};

const columnType = (column: any) => String(column?.full_type || column?.type || '');
const normalizeType = (value: string) => value
  .toLowerCase()
  .replace(/[`"]/g, '')
  .replace(/\s+/g, ' ')
  .replace(/^int4$/, 'integer')
  .replace(/^int8$/, 'bigint')
  .replace(/^int2$/, 'smallint')
  .replace(/^serial$/, 'integer')
  .replace(/^bigserial$/, 'bigint')
  .replace(/^smallserial$/, 'smallint')
  .replace(/^character varying/, 'varchar')
  .trim();

const compatibleType = (left: string, right: string) => normalizeType(left) === normalizeType(right);

export function useStructureEditor(
  activeTableSchema: any,
  tables: any[],
  updateStructure: (patch: Record<string, any>) => Promise<any>,
) {
  const [target, setTarget] = useState<StructureTarget | null>(null);
  const [draft, setDraft] = useState<StructureDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectedColumn = useMemo(() => {
    if (target?.kind !== 'column') return null;
    return activeTableSchema?.columns?.find((column: any) => column.name === target.columnName) || null;
  }, [activeTableSchema, target]);

  const currentFk = useMemo(() => {
    if (!selectedColumn) return null;
    return activeTableSchema?.foreign_keys?.find((fk: any) => fk.column === selectedColumn.name) || null;
  }, [activeTableSchema, selectedColumn]);

  useEffect(() => {
    if (!activeTableSchema || !target) {
      setDraft(null);
      return;
    }
    const column = target.kind === 'column'
      ? activeTableSchema.columns?.find((item: any) => item.name === target.columnName)
      : null;
    const fk = column ? activeTableSchema.foreign_keys?.find((item: any) => item.column === column.name) : null;
    setDraft({
      tableName: activeTableSchema.table_name || '',
      columnName: column?.name || '',
      columnType: columnType(column),
      isNullable: Boolean(column?.is_nullable),
      columnDefault: column?.column_default ?? '',
      fkEnabled: Boolean(fk),
      refTable: fk?.ref_table || '',
      refColumn: fk?.ref_column || '',
    });
  }, [activeTableSchema, target]);

  const isDirty = useMemo(() => {
    if (!activeTableSchema || !target || !draft) return false;
    if (draft.tableName !== activeTableSchema.table_name) return true;
    if (target.kind !== 'column' || !selectedColumn) return false;
    return draft.columnName !== selectedColumn.name ||
      draft.columnType !== columnType(selectedColumn) ||
      draft.isNullable !== Boolean(selectedColumn.is_nullable) ||
      draft.columnDefault !== (selectedColumn.column_default ?? '') ||
      draft.fkEnabled !== Boolean(currentFk) ||
      draft.refTable !== (currentFk?.ref_table || '') ||
      draft.refColumn !== (currentFk?.ref_column || '');
  }, [activeTableSchema, currentFk, draft, selectedColumn, target]);

  const referenceColumns = useMemo(() => {
    const table = tables.find((item: any) => item.table_name === draft?.refTable);
    return (table?.columns || []).filter((column: any) => compatibleType(draft?.columnType || '', columnType(column)));
  }, [draft?.columnType, draft?.refTable, tables]);

  const save = useCallback(async () => {
    if (!activeTableSchema || !target || !draft || !isDirty) return;
    setIsSaving(true);
    try {
      await updateStructure({
        tableName: draft.tableName,
        columnName: target.kind === 'column' ? target.columnName : undefined,
        column: target.kind === 'column' ? {
          name: draft.columnName,
          type: draft.columnType,
          is_nullable: draft.isNullable,
          column_default: draft.columnDefault,
        } : undefined,
        foreignKey: target.kind === 'column' ? {
          enabled: draft.fkEnabled,
          ref_table: draft.refTable,
          ref_column: draft.refColumn,
        } : undefined,
      });
      setTarget({ kind: target.kind, columnName: draft.columnName } as StructureTarget);
    } finally {
      setIsSaving(false);
    }
  }, [activeTableSchema, draft, isDirty, target, updateStructure]);

  return {
    target,
    draft,
    isDirty,
    isSaving,
    selectedColumn,
    referenceColumns,
    setDraft,
    editTable: () => setTarget({ kind: 'table' }),
    editColumn: (columnName: string) => setTarget({ kind: 'column', columnName }),
    close: () => setTarget(null),
    save,
  };
}
