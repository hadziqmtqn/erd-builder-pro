import { useCallback, useEffect, useMemo, useState } from 'react';

export type StructureTarget =
  | { kind: 'table' }
  | { kind: 'column'; columnName: string }
  | { kind: 'addColumn' }
  | { kind: 'index'; indexName: string }
  | { kind: 'addIndex' };

export type StructureDraft = {
  tableName: string;
  columnName: string;
  columnType: string;
  characterLength: string;
  isNullable: boolean;
  columnDefault: string;
  columnExtra: string;
  columnComment: string;
  fkEnabled: boolean;
  refTable: string;
  refColumn: string;
  indexName: string;
  indexColumns: string[];
  indexUnique: boolean;
  indexAlgorithm: string;
};

const columnType = (column: any) => String(column?.full_type || column?.type || '');
const parseLength = (type: string) => type.match(/\((\d+)\)/)?.[1] || '';
const supportsLength = (type: string) => /^(var)?char|^character varying|^(var)?binary$/i.test(type.trim());
const typeWithLength = (type: string, length: string) => {
  const cleanType = type.replace(/\(\d+\)/, '').trim();
  return supportsLength(cleanType) && length ? `${cleanType}(${length})` : cleanType;
};
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

  const selectedIndex = useMemo(() => {
    if (target?.kind !== 'index') return null;
    return activeTableSchema?.indexes?.find((index: any) => index.name === target.indexName) || null;
  }, [activeTableSchema, target]);

  useEffect(() => {
    if (!activeTableSchema || !target) {
      setDraft(null);
      return;
    }
    const column = target.kind === 'column'
      ? activeTableSchema.columns?.find((item: any) => item.name === target.columnName)
      : null;
    const fk = column ? activeTableSchema.foreign_keys?.find((item: any) => item.column === column.name) : null;
    const index = target.kind === 'index'
      ? activeTableSchema.indexes?.find((item: any) => item.name === target.indexName)
      : null;
    setDraft({
      tableName: activeTableSchema.table_name || '',
      columnName: column?.name || '',
      columnType: columnType(column),
      characterLength: String(column?.max_length || parseLength(columnType(column)) || ''),
      isNullable: Boolean(column?.is_nullable),
      columnDefault: column?.column_default ?? '',
      columnExtra: column?.extra ?? '',
      columnComment: column?.comment ?? '',
      fkEnabled: Boolean(fk),
      refTable: fk?.ref_table || '',
      refColumn: fk?.ref_column || '',
      indexName: index?.name || '',
      indexColumns: String(index?.column_name || '').split(',').map(item => item.trim()).filter(Boolean),
      indexUnique: Boolean(index?.is_unique),
      indexAlgorithm: String(index?.algorithm || '').toLowerCase(),
    });
  }, [activeTableSchema, target]);

  const isDirty = useMemo(() => {
    if (!activeTableSchema || !target || !draft) return false;
    if (draft.tableName !== activeTableSchema.table_name) return true;
    if (target.kind === 'addColumn') return Boolean(draft.columnName.trim() && draft.columnType.trim());
    if (target.kind === 'addIndex') return Boolean(draft.indexName.trim() && draft.indexColumns.length > 0);
    if (target.kind === 'index' && selectedIndex) {
      return draft.indexName !== selectedIndex.name ||
        draft.indexUnique !== Boolean(selectedIndex.is_unique) ||
        draft.indexAlgorithm !== String(selectedIndex.algorithm || '').toLowerCase() ||
        draft.indexColumns.join(',') !== String(selectedIndex.column_name || '');
    }
    if (target.kind !== 'column' || !selectedColumn) return false;
    return draft.columnName !== selectedColumn.name ||
      typeWithLength(draft.columnType, draft.characterLength) !== typeWithLength(columnType(selectedColumn), String(selectedColumn.max_length || parseLength(columnType(selectedColumn)) || '')) ||
      draft.isNullable !== Boolean(selectedColumn.is_nullable) ||
      draft.columnDefault !== (selectedColumn.column_default ?? '') ||
      draft.columnExtra !== (selectedColumn.extra ?? '') ||
      draft.columnComment !== (selectedColumn.comment ?? '') ||
      draft.fkEnabled !== Boolean(currentFk) ||
      draft.refTable !== (currentFk?.ref_table || '') ||
      draft.refColumn !== (currentFk?.ref_column || '');
  }, [activeTableSchema, currentFk, draft, selectedColumn, selectedIndex, target]);

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
        columnName: target.kind === 'column' ? target.columnName : target.kind === 'addColumn' ? '__new__' : undefined,
        column: target.kind === 'column' || target.kind === 'addColumn' ? {
          name: draft.columnName,
          type: typeWithLength(draft.columnType, draft.characterLength),
          is_nullable: draft.isNullable,
          column_default: draft.columnDefault,
          extra: draft.columnExtra,
          comment: draft.columnComment,
        } : undefined,
        foreignKey: target.kind === 'column' || target.kind === 'addColumn' ? {
          enabled: draft.fkEnabled,
          ref_table: draft.refTable,
          ref_column: draft.refColumn,
        } : undefined,
        indexName: target.kind === 'index' ? target.indexName : target.kind === 'addIndex' ? '__new__' : undefined,
        index: target.kind === 'index' || target.kind === 'addIndex' ? {
          name: draft.indexName,
          columns: draft.indexColumns,
          is_unique: draft.indexUnique,
          algorithm: draft.indexAlgorithm,
        } : undefined,
      });
      if (target.kind === 'addColumn' || target.kind === 'column') setTarget({ kind: 'column', columnName: draft.columnName });
      if (target.kind === 'addIndex' || target.kind === 'index') setTarget({ kind: 'index', indexName: draft.indexName });
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
    selectedIndex,
    referenceColumns,
    setDraft,
    editTable: () => setTarget({ kind: 'table' }),
    editColumn: (columnName: string) => setTarget({ kind: 'column', columnName }),
    addColumn: () => setTarget({ kind: 'addColumn' }),
    editIndex: (indexName: string) => setTarget({ kind: 'index', indexName }),
    addIndex: () => setTarget({ kind: 'addIndex' }),
    close: () => setTarget(null),
    save,
  };
}
