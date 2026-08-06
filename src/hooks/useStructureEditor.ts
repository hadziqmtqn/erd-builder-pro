import { useCallback, useEffect, useMemo, useState } from 'react';

export type StructureTarget =
  | { kind: 'table' }
  | { kind: 'addTable' }
  | { kind: 'column'; columnName: string }
  | { kind: 'addColumn' }
  | { kind: 'index'; indexName: string }
  | { kind: 'addIndex' }
  | { kind: 'check'; checkName: string }
  | { kind: 'addCheck' };

export type StructureDraft = {
  tableName: string;
  tableComment: string;
  columnName: string;
  columnType: string;
  characterLength: string;
  numericPrecision: string;
  numericScale: string;
  isNullable: boolean;
  columnDefault: string;
  columnExtra: string;
  columnComment: string;
  enumValues: string[];
  fkEnabled: boolean;
  refTable: string;
  refColumn: string;
  fkConstraintName: string;
  fkOnDelete: string;
  fkOnUpdate: string;
  indexName: string;
  indexColumns: string[];
  indexUnique: boolean;
  indexAlgorithm: string;
  checkName: string;
  checkExpression: string;
};

const columnType = (column: any) => String(column?.full_type === 'USER-DEFINED' ? column?.type : column?.full_type || column?.type || '');
const parseEnumValues = (value: any) => {
  if (Array.isArray(value)) return value.map(String);
  const match = String(value || '').match(/^(?:enum|set)\((.*)\)$/i);
  if (!match) return [];
  return [...match[1].matchAll(/'((?:''|[^'])*)'/g)].map(item => item[1].replace(/''/g, "'"));
};
const parseLength = (type: string) => type.match(/\((\d+)\)/)?.[1] || '';
const parsePrecision = (type: string) => {
  const [, precision = '', scale = ''] = type.match(/\((\d+)(?:\s*,\s*(\d+))?\)/) || [];
  return { precision, scale };
};
const supportsLength = (type: string) => /^(var)?char|^character varying|^(var)?binary$/i.test(type.trim());
const defaultLength = (type: string) => /^(var)?char|^(var)?binary$/i.test(type.trim()) ? '255' : '';
const supportsPrecision = (type: string) => /^(decimal|numeric)$/i.test(type.replace(/\(.*/, '').trim());
const typeWithModifiers = (type: string, length: string, precision: string, scale: string) => {
  const cleanType = type.replace(/\([^)]*\)/, '').trim();
  if (supportsLength(cleanType)) return `${cleanType}(${length || defaultLength(cleanType)})`;
  if (supportsPrecision(cleanType) && precision) return `${cleanType}(${scale ? `${precision},${scale}` : precision})`;
  return cleanType;
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

  const selectedCheck = useMemo(() => {
    if (target?.kind !== 'check') return null;
    return activeTableSchema?.checks?.find((check: any) => check.name === target.checkName) || null;
  }, [activeTableSchema, target]);

  useEffect(() => {
    if (target?.kind === 'addTable') {
      setDraft({
        tableName: '',
        tableComment: '',
        columnName: 'id',
        columnType: 'BIGINT',
        characterLength: '',
        numericPrecision: '',
        numericScale: '',
        isNullable: false,
        columnDefault: '',
        columnExtra: '',
        columnComment: '',
        enumValues: [],
        fkEnabled: false,
        refTable: '',
        refColumn: '',
        fkConstraintName: '',
        fkOnDelete: 'NO ACTION',
        fkOnUpdate: 'NO ACTION',
        indexName: '',
        indexColumns: [],
        indexUnique: false,
        indexAlgorithm: '',
        checkName: '',
        checkExpression: '',
      });
      return;
    }
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
    const check = target.kind === 'check'
      ? activeTableSchema.checks?.find((item: any) => item.name === target.checkName)
      : null;
    const precision = parsePrecision(columnType(column));
    setDraft({
      tableName: activeTableSchema.table_name || '',
      tableComment: activeTableSchema.comment ?? '',
      columnName: column?.name || '',
      columnType: columnType(column),
      characterLength: String(column?.max_length || parseLength(columnType(column)) || ''),
      numericPrecision: String(column?.numeric_precision || precision.precision || ''),
      numericScale: String(column?.numeric_scale || precision.scale || ''),
      isNullable: Boolean(column?.is_nullable),
      columnDefault: column?.column_default ?? '',
      columnExtra: column?.extra ?? '',
      columnComment: column?.comment ?? '',
      enumValues: parseEnumValues(column?.enum_values),
      fkEnabled: Boolean(fk),
      refTable: fk?.ref_table || '',
      refColumn: fk?.ref_column || '',
      fkConstraintName: fk?.constraint_name || '',
      fkOnDelete: fk?.on_delete || 'NO ACTION',
      fkOnUpdate: fk?.on_update || 'NO ACTION',
      indexName: index?.name || '',
      indexColumns: String(index?.column_name || '').split(',').map(item => item.trim()).filter(Boolean),
      indexUnique: Boolean(index?.is_unique),
      indexAlgorithm: String(index?.algorithm || '').toLowerCase(),
      checkName: check?.name || '',
      checkExpression: check?.expression || '',
    });
  }, [activeTableSchema, target]);

  const isDirty = useMemo(() => {
    if (!target || !draft) return false;
    if (target.kind === 'addTable') return Boolean(draft.tableName.trim() && draft.columnName.trim() && draft.columnType.trim());
    if (!activeTableSchema) return false;
    if (draft.tableName !== activeTableSchema.table_name) return true;
    if (draft.tableComment !== (activeTableSchema.comment ?? '')) return true;
    if (target.kind === 'addColumn') return Boolean(draft.columnName.trim() && draft.columnType.trim());
    if (target.kind === 'addIndex') return Boolean(draft.indexName.trim() && draft.indexColumns.length > 0);
    if (target.kind === 'addCheck') return Boolean(draft.checkExpression.trim());
    if (target.kind === 'index' && selectedIndex) {
      return draft.indexName !== selectedIndex.name ||
        draft.indexUnique !== Boolean(selectedIndex.is_unique) ||
        draft.indexAlgorithm !== String(selectedIndex.algorithm || '').toLowerCase() ||
        draft.indexColumns.join(',') !== String(selectedIndex.column_name || '');
    }
    if (target.kind === 'check' && selectedCheck) {
      return draft.checkName !== selectedCheck.name || draft.checkExpression !== selectedCheck.expression;
    }
    if (target.kind !== 'column' || !selectedColumn) return false;
    return draft.columnName !== selectedColumn.name ||
      typeWithModifiers(draft.columnType, draft.characterLength, draft.numericPrecision, draft.numericScale) !== typeWithModifiers(columnType(selectedColumn), String(selectedColumn.max_length || parseLength(columnType(selectedColumn)) || ''), String(selectedColumn.numeric_precision || parsePrecision(columnType(selectedColumn)).precision || ''), String(selectedColumn.numeric_scale || parsePrecision(columnType(selectedColumn)).scale || '')) ||
      draft.isNullable !== Boolean(selectedColumn.is_nullable) ||
      draft.columnDefault !== (selectedColumn.column_default ?? '') ||
      draft.columnExtra !== (selectedColumn.extra ?? '') ||
      draft.columnComment !== (selectedColumn.comment ?? '') ||
      draft.enumValues.join('\u0000') !== parseEnumValues(selectedColumn.enum_values).join('\u0000') ||
      draft.fkEnabled !== Boolean(currentFk) ||
      draft.refTable !== (currentFk?.ref_table || '') ||
      draft.refColumn !== (currentFk?.ref_column || '') ||
      draft.fkConstraintName !== (currentFk?.constraint_name || '') ||
      draft.fkOnDelete !== (currentFk?.on_delete || 'NO ACTION') ||
      draft.fkOnUpdate !== (currentFk?.on_update || 'NO ACTION');
  }, [activeTableSchema, currentFk, draft, selectedCheck, selectedColumn, selectedIndex, target]);

  const referenceColumns = useMemo(() => {
    const table = tables.find((item: any) => item.table_name === draft?.refTable);
    return (table?.columns || []).filter((column: any) => compatibleType(draft?.columnType || '', columnType(column)));
  }, [draft?.columnType, draft?.refTable, tables]);

  const save = useCallback(async () => {
    if (!target || !draft || !isDirty) return;
    setIsSaving(true);
    try {
      await updateStructure({
        createTable: target.kind === 'addTable' ? {
          name: draft.tableName,
          comment: draft.tableComment,
          column: {
            name: draft.columnName,
            type: typeWithModifiers(draft.columnType, draft.characterLength, draft.numericPrecision, draft.numericScale),
            is_nullable: draft.isNullable,
            column_default: draft.columnDefault,
            extra: draft.columnExtra,
            comment: draft.columnComment,
            enum_values: draft.enumValues,
          },
        } : undefined,
        tableName: draft.tableName,
        tableComment: draft.tableComment,
        columnName: target.kind === 'column' ? target.columnName : target.kind === 'addColumn' ? '__new__' : undefined,
        column: target.kind === 'column' || target.kind === 'addColumn' ? {
          name: draft.columnName,
          type: typeWithModifiers(draft.columnType, draft.characterLength, draft.numericPrecision, draft.numericScale),
          is_nullable: draft.isNullable,
          column_default: draft.columnDefault,
          extra: draft.columnExtra,
          comment: draft.columnComment,
          enum_values: draft.enumValues,
        } : undefined,
        foreignKey: target.kind === 'column' || target.kind === 'addColumn' ? {
          enabled: draft.fkEnabled,
          ref_table: draft.refTable,
          ref_column: draft.refColumn,
          constraint_name: draft.fkConstraintName,
          on_delete: draft.fkOnDelete,
          on_update: draft.fkOnUpdate,
        } : undefined,
        indexName: target.kind === 'index' ? target.indexName : target.kind === 'addIndex' ? '__new__' : undefined,
        index: target.kind === 'index' || target.kind === 'addIndex' ? {
          name: draft.indexName,
          columns: draft.indexColumns,
          is_unique: draft.indexUnique,
          algorithm: draft.indexAlgorithm,
        } : undefined,
        checkName: target.kind === 'check' ? target.checkName : target.kind === 'addCheck' ? '__new__' : undefined,
        check: target.kind === 'check' || target.kind === 'addCheck' ? {
          name: draft.checkName,
          expression: draft.checkExpression,
        } : undefined,
      });
      if (target.kind === 'addTable') setTarget(null);
      if (target.kind === 'addColumn' || target.kind === 'column') setTarget({ kind: 'column', columnName: draft.columnName });
      if (target.kind === 'addIndex' || target.kind === 'index') setTarget({ kind: 'index', indexName: draft.indexName });
      if (target.kind === 'addCheck' || target.kind === 'check') setTarget({ kind: 'check', checkName: draft.checkName });
    } finally {
      setIsSaving(false);
    }
  }, [draft, isDirty, target, updateStructure]);

  return {
    target,
    draft,
    isDirty,
    isSaving,
    selectedColumn,
    selectedIndex,
    selectedCheck,
    referenceColumns,
    setDraft,
    editTable: () => setTarget({ kind: 'table' }),
    editColumn: (columnName: string) => setTarget({ kind: 'column', columnName }),
    addColumn: () => setTarget({ kind: 'addColumn' }),
    addTable: () => setTarget({ kind: 'addTable' }),
    editIndex: (indexName: string) => setTarget({ kind: 'index', indexName }),
    addIndex: () => setTarget({ kind: 'addIndex' }),
    editCheck: (checkName: string) => setTarget({ kind: 'check', checkName }),
    addCheck: () => setTarget({ kind: 'addCheck' }),
    close: () => setTarget(null),
    save,
  };
}
