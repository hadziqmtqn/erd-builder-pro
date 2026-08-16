import { Dispatch, SetStateAction, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/SearchableSelect';
import { columnDefaultOptions, CUSTOM_COLUMN_DEFAULT, isTextColumnType, NO_COLUMN_DEFAULT } from '@/lib/db-client-default-options';
import { StructureDraft, StructureTarget } from '@/hooks/useStructureEditor';
import { DataViewerStructureIndexFields } from './DataViewerStructureIndexFields';
import {
  columnTypeOption,
  MYSQL_COLUMN_TYPES,
  POSTGRES_COLUMN_TYPES,
  supportsColumnLength,
  supportsNumericModifiers,
  supportsTemporalPrecision,
} from '../../../shared/db-column-types';

type DataViewerStructurePanelProps = {
  target: StructureTarget;
  draft: StructureDraft;
  isDirty: boolean;
  isSaving: boolean;
  tables: any[];
  dbType: string | null;
  referenceColumns: any[];
  setDraft: Dispatch<SetStateAction<StructureDraft | null>>;
  onClose: () => void;
  onDeleteColumn: () => void;
  onDeleteIndex: () => void;
  onDeleteCheck: () => void;
  onSave: () => void;
};

const patchDraft = (setDraft: DataViewerStructurePanelProps['setDraft'], patch: Partial<StructureDraft>) => {
  setDraft(current => current ? { ...current, ...patch } : current);
};

const SQLITE_TYPES = ['INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC'];
const KNOWN_TYPE_OPTIONS = new Set<string>([...MYSQL_COLUMN_TYPES, ...POSTGRES_COLUMN_TYPES]);
const MYSQL_EXTRA_OPTIONS = ['', 'AUTO_INCREMENT', 'ON UPDATE CURRENT_TIMESTAMP'];
const FK_ACTIONS = ['NO ACTION', 'CASCADE', 'SET NULL', 'SET DEFAULT', 'RESTRICT'];

function typeOptions(dbType: string | null, currentType: string) {
  const base = dbType === 'sqlite'
    ? SQLITE_TYPES
    : dbType === 'postgresql'
      ? POSTGRES_COLUMN_TYPES
      : MYSQL_COLUMN_TYPES;
  const current = columnTypeOption(dbType, currentType);
  return [...new Set(current ? [current, ...base.map(type => columnTypeOption(dbType, type))] : base.map(type => columnTypeOption(dbType, type)))]
    .sort((a, b) => a.localeCompare(b));
}
const isColumnTarget = (target: StructureTarget) => target.kind === 'column' || target.kind === 'addColumn' || target.kind === 'addTable';
const isEnumEditorType = (dbType: string | null, type: string, values: string[]) => {
  const current = columnTypeOption(dbType, type);
  return /^(ENUM|SET)$/.test(current) || (values.length > 0 && !KNOWN_TYPE_OPTIONS.has(current));
};
const sortedColumns = (table: any) => (table?.columns || [])
  .map((column: any, index: number) => ({ column, index }))
  .sort((a: any, b: any) => (Number(a.column.sort_order) || a.index + 1) - (Number(b.column.sort_order) || b.index + 1))
  .map((item: any) => item.column);
const title = (target: StructureTarget) => target.kind === 'table'
  ? 'Edit Table'
  : target.kind === 'addTable'
    ? 'Add Table'
    : target.kind === 'addColumn'
      ? 'Add Column'
      : target.kind === 'addIndex'
        ? 'Add Index'
        : target.kind === 'index'
          ? 'Edit Index'
          : target.kind === 'addCheck'
            ? 'Add Check Constraint'
            : target.kind === 'check'
              ? 'Edit Check Constraint'
          : 'Edit Column';

export function DataViewerStructurePanel({
  target,
  draft,
  isDirty,
  isSaving,
  tables,
  dbType,
  referenceColumns,
  setDraft,
  onClose,
  onDeleteColumn,
  onDeleteIndex,
  onDeleteCheck,
  onSave,
}: DataViewerStructurePanelProps) {
  const [enumValue, setEnumValue] = useState('');
  const [customDefaultTarget, setCustomDefaultTarget] = useState('');
  const tableColumns = sortedColumns(tables.find(table => table.table_name === draft.tableName));
  const tableNames = tables.map(table => table.table_name).filter(Boolean);
  const extraOptions = dbType === 'mysql'
    ? [...new Set(draft.columnExtra ? [draft.columnExtra, ...MYSQL_EXTRA_OPTIONS] : MYSQL_EXTRA_OPTIONS)]
    : [];
  const defaultOptions = columnDefaultOptions(draft.columnType, draft.isNullable, draft.columnDefault);
  const targetKey = `${target.kind}:${'columnName' in target ? target.columnName : draft.tableName}`;
  const selectedDefault = defaultOptions.find(option => option.value.toUpperCase() === draft.columnDefault.toUpperCase());
  const customDefault = isTextColumnType(draft.columnType)
    && (customDefaultTarget === targetKey || Boolean(draft.columnDefault && !selectedDefault));
  const defaultValue = customDefault ? CUSTOM_COLUMN_DEFAULT : selectedDefault?.value ?? NO_COLUMN_DEFAULT;

  return (
    <aside className="w-80 shrink-0 border-l bg-background">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium">{title(target)}</h3>
            <p className="truncate text-xs text-muted-foreground">{draft.tableName}</p>
          </div>
          <Button variant="ghost" size="icon-xs" onClick={onClose} title="Close details">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
          {(target.kind === 'table' || target.kind === 'addTable') && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="structure-table-name">Table name</Label>
                <Input id="structure-table-name" value={draft.tableName} onChange={e => patchDraft(setDraft, { tableName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="structure-table-comment">Table comment</Label>
                <Textarea id="structure-table-comment" value={draft.tableComment} onChange={e => patchDraft(setDraft, { tableComment: e.target.value })} />
              </div>
            </>
          )}

          {isColumnTarget(target) && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="structure-column-name">Column name</Label>
                <Input id="structure-column-name" value={draft.columnName} onChange={e => patchDraft(setDraft, { columnName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="structure-column-type">Data type</Label>
                <SearchableSelect
                  value={columnTypeOption(dbType, draft.columnType)}
                  onChange={value => {
                    const validDefaults = columnDefaultOptions(value, draft.isNullable);
                    patchDraft(setDraft, {
                      columnType: value,
                      characterLength: supportsColumnLength(value) ? draft.characterLength || '255' : '',
                      numericPrecision: supportsNumericModifiers(value) || supportsTemporalPrecision(dbType, value) ? draft.numericPrecision : '',
                      numericScale: supportsNumericModifiers(value) ? draft.numericScale : '',
                      columnDefault: validDefaults.some(option => option.value.toUpperCase() === defaultValue.toUpperCase()) ? draft.columnDefault : '',
                      refColumn: '',
                    });
                  }}
                  items={typeOptions(dbType, draft.columnType)}
                  placeholder="Type"
                  searchPlaceholder="Search type..."
                  emptyMessage="No valid types"
                  className="h-9 text-sm"
                  getItemValue={type => type}
                  getItemLabel={type => type}
                  filterItem={(type, query) => type.toLowerCase().includes(query.toLowerCase())}
                />
              </div>
              {supportsColumnLength(columnTypeOption(dbType, draft.columnType)) && (
                <div className="space-y-1.5">
                  <Label htmlFor="structure-column-length">Length</Label>
                  <Input
                    id="structure-column-length"
                    type="number"
                    min={1}
                    value={draft.characterLength}
                    placeholder="255"
                    onChange={e => patchDraft(setDraft, { characterLength: e.target.value.replace(/\D/g, '') })}
                  />
                </div>
              )}
              {supportsNumericModifiers(columnTypeOption(dbType, draft.columnType)) && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="structure-column-precision">Precision</Label>
                    <Input
                      id="structure-column-precision"
                      type="number"
                      min={1}
                      value={draft.numericPrecision}
                      placeholder="10"
                      onChange={e => patchDraft(setDraft, { numericPrecision: e.target.value.replace(/\D/g, '') })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="structure-column-scale">Scale</Label>
                    <Input
                      id="structure-column-scale"
                      type="number"
                      min={0}
                      value={draft.numericScale}
                      placeholder="2"
                      onChange={e => patchDraft(setDraft, { numericScale: e.target.value.replace(/\D/g, '') })}
                    />
                  </div>
                </div>
              )}
              {supportsTemporalPrecision(dbType, draft.columnType) && (
                <div className="space-y-1.5">
                  <Label htmlFor="structure-column-time-precision">Fractional precision</Label>
                  <Input
                    id="structure-column-time-precision"
                    type="number"
                    min={0}
                    max={6}
                    value={draft.numericPrecision}
                    placeholder={dbType === 'postgresql' ? '6' : '0'}
                    onChange={e => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 1);
                      patchDraft(setDraft, { numericPrecision: value && Number(value) > 6 ? '6' : value, numericScale: '' });
                    }}
                  />
                </div>
              )}
              {isEnumEditorType(dbType, draft.columnType, draft.enumValues) && (
                <div className="space-y-2 rounded-md border p-3">
                  <Label htmlFor="structure-enum-value">Enum values</Label>
                  <div className="flex gap-2">
                    <Input id="structure-enum-value" value={enumValue} onChange={e => setEnumValue(e.target.value)} placeholder="new_value" />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const value = enumValue.trim();
                        if (!value || draft.enumValues.includes(value)) return;
                        patchDraft(setDraft, { enumValues: [...draft.enumValues, value] });
                        setEnumValue('');
                      }}
                    >
                      Add
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {draft.enumValues.map(value => (
                      <span key={value} className="inline-flex items-center gap-1 rounded border bg-muted/40 px-2 py-0.5 font-mono text-xs">
                        {value}
                        <button
                          type="button"
                          className="rounded-sm text-muted-foreground hover:text-destructive"
                          title={`Remove ${value}`}
                          onClick={() => patchDraft(setDraft, { enumValues: draft.enumValues.filter(item => item !== value) })}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.isNullable}
                  onCheckedChange={checked => patchDraft(setDraft, {
                    isNullable: checked,
                    columnDefault: !checked && draft.columnDefault.toUpperCase() === 'NULL' ? '' : draft.columnDefault,
                  })}
                />
                Nullable
              </label>
              <div className="space-y-1.5">
                <Label htmlFor="structure-column-default">Default</Label>
                <Select value={defaultValue} onValueChange={value => {
                  setCustomDefaultTarget(value === CUSTOM_COLUMN_DEFAULT ? targetKey : '');
                  patchDraft(setDraft, { columnDefault: value === NO_COLUMN_DEFAULT || value === CUSTOM_COLUMN_DEFAULT ? '' : value ?? '' });
                }}>
                  <SelectTrigger id="structure-column-default">
                    <SelectValue>{defaultOptions.find(option => option.value === defaultValue)?.label}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {defaultOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {customDefault && (
                  <Input
                    value={draft.columnDefault}
                    placeholder="Enter text default"
                    aria-label="Custom default value"
                    onChange={event => patchDraft(setDraft, { columnDefault: event.target.value })}
                  />
                )}
              </div>
              {extraOptions.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Extra</Label>
                  <Select value={draft.columnExtra || 'none'} onValueChange={value => patchDraft(setDraft, { columnExtra: value === 'none' ? '' : value ?? '' })}>
                    <SelectTrigger><SelectValue>{draft.columnExtra || 'None'}</SelectValue></SelectTrigger>
                    <SelectContent>
                      {extraOptions.map(value => (
                        <SelectItem key={value || 'none'} value={value || 'none'}>{value || 'None'}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="structure-column-comment">Comment</Label>
                <Textarea id="structure-column-comment" value={draft.columnComment} onChange={e => patchDraft(setDraft, { columnComment: e.target.value })} />
              </div>

              {target.kind !== 'addTable' && <div className="space-y-3 rounded-md border p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox
                    checked={draft.fkEnabled}
                    onCheckedChange={checked => patchDraft(setDraft, { fkEnabled: checked })}
                  />
                  Foreign key
                </label>
                <div className="space-y-1.5">
                  <Label>Reference table</Label>
                  <SearchableSelect
                    value={draft.refTable}
                    onChange={value => patchDraft(setDraft, { refTable: value, refColumn: '' })}
                    items={tableNames}
                    placeholder="Select table"
                    searchPlaceholder="Search table..."
                    emptyMessage="No tables"
                    className="h-9 text-sm"
                    getItemValue={name => name}
                    getItemLabel={name => name}
                    filterItem={(name, query) => name.toLowerCase().includes(query.toLowerCase())}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Reference column</Label>
                  <Select value={draft.refColumn} onValueChange={value => patchDraft(setDraft, { refColumn: value ?? '' })}>
                    <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                    <SelectContent>
                      {referenceColumns.map(column => <SelectItem key={column.name} value={column.name}>{column.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {draft.refTable && referenceColumns.length === 0 && (
                    <p className="text-xs text-muted-foreground">No compatible columns for this type.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Constraint name</Label>
                  <Input value={draft.fkConstraintName} placeholder="Auto-generated" onChange={e => patchDraft(setDraft, { fkConstraintName: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(['fkOnDelete', 'fkOnUpdate'] as const).map((field) => (
                    <div key={field} className="space-y-1.5">
                      <Label>{field === 'fkOnDelete' ? 'On delete' : 'On update'}</Label>
                      <Select value={draft[field]} onValueChange={value => patchDraft(setDraft, { [field]: value ?? 'NO ACTION' })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{FK_ACTIONS.map(action => <SelectItem key={action} value={action}>{action}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>}
            </>
          )}

          {(target.kind === 'index' || target.kind === 'addIndex' || target.kind === 'check' || target.kind === 'addCheck') && (
            <DataViewerStructureIndexFields target={target} draft={draft} tableColumns={tableColumns} setDraft={setDraft} />
          )}
        </div>

        <div className="sticky bottom-0 grid grid-cols-2 gap-2 border-t bg-background p-3">
          {target.kind === 'column' && (
            <Button variant="destructive" className="col-span-2" onClick={onDeleteColumn} disabled={isSaving}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Column
            </Button>
          )}
          {target.kind === 'index' && (
            <Button variant="destructive" className="col-span-2" onClick={onDeleteIndex} disabled={isSaving}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Index
            </Button>
          )}
          {target.kind === 'check' && (
            <Button variant="destructive" className="col-span-2" onClick={onDeleteCheck} disabled={isSaving}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Check
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button onClick={onSave} disabled={!isDirty || isSaving}>
            Submit
          </Button>
        </div>
      </div>
    </aside>
  );
}
