import { Dispatch, SetStateAction } from 'react';
import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/SearchableSelect';
import { COLUMN_TYPES } from '@/lib/utils';
import { StructureDraft, StructureTarget } from '@/hooks/useStructureEditor';

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
  onSave: () => void;
};

const patchDraft = (setDraft: DataViewerStructurePanelProps['setDraft'], patch: Partial<StructureDraft>) => {
  setDraft(current => current ? { ...current, ...patch } : current);
};

const SQLITE_TYPES = ['INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC'];
const MYSQL_ONLY = new Set(['TINYINT', 'MEDIUMINT', 'TINYTEXT', 'MEDIUMTEXT', 'LONGTEXT', 'BINARY', 'VARBINARY', 'TINYBLOB', 'MEDIUMBLOB', 'LONGBLOB', 'DOUBLE', 'YEAR', 'DATETIME', 'BIT', 'ENUM']);
const PG_ONLY = new Set(['SERIAL', 'BIGSERIAL', 'SMALLSERIAL', 'MONEY', 'BYTEA', 'UUID', 'ULID', 'JSONB', 'INTERVAL', 'TIMESTAMPTZ', 'TIMETZ', 'CIDR', 'INET', 'MACADDR', 'MACADDR8', 'TSVECTOR', 'TSQUERY']);
const MYSQL_EXTRA_OPTIONS = ['', 'AUTO_INCREMENT', 'ON UPDATE CURRENT_TIMESTAMP'];

function typeOptions(dbType: string | null, currentType: string) {
  const base = dbType === 'sqlite'
    ? SQLITE_TYPES
    : COLUMN_TYPES.filter(type => dbType === 'mysql' ? !PG_ONLY.has(type) : !MYSQL_ONLY.has(type));
  const current = currentType.trim();
  return [...new Set(current ? [current, ...base] : base)].sort((a, b) => a.localeCompare(b));
}
const lengthType = (type: string) => /^(var)?char|^character varying|^(var)?binary$/i.test(type.replace(/\(\d+\)/, '').trim());
const isColumnTarget = (target: StructureTarget) => target.kind === 'column' || target.kind === 'addColumn';
const isIndexTarget = (target: StructureTarget) => target.kind === 'index' || target.kind === 'addIndex';
const sortedColumns = (table: any) => (table?.columns || [])
  .map((column: any, index: number) => ({ column, index }))
  .sort((a: any, b: any) => (Number(a.column.sort_order) || a.index + 1) - (Number(b.column.sort_order) || b.index + 1))
  .map((item: any) => item.column);
const title = (target: StructureTarget) => target.kind === 'table'
  ? 'Edit Table'
  : target.kind === 'addColumn'
    ? 'Add Column'
    : target.kind === 'addIndex'
      ? 'Add Index'
      : target.kind === 'index'
        ? 'Edit Index'
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
  onSave,
}: DataViewerStructurePanelProps) {
  const tableColumns = sortedColumns(tables.find(table => table.table_name === draft.tableName));
  const extraOptions = dbType === 'mysql'
    ? [...new Set(draft.columnExtra ? [draft.columnExtra, ...MYSQL_EXTRA_OPTIONS] : MYSQL_EXTRA_OPTIONS)]
    : [];

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
          {target.kind === 'table' && (
            <div className="space-y-1.5">
              <Label htmlFor="structure-table-name">Table name</Label>
              <Input id="structure-table-name" value={draft.tableName} onChange={e => patchDraft(setDraft, { tableName: e.target.value })} />
            </div>
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
                  value={draft.columnType}
                  onChange={value => patchDraft(setDraft, { columnType: value, characterLength: lengthType(value) ? draft.characterLength : '', refColumn: '' })}
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
              {lengthType(draft.columnType) && (
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
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={draft.isNullable}
                  onChange={e => patchDraft(setDraft, { isNullable: e.target.checked })}
                />
                Nullable
              </label>
              <div className="space-y-1.5">
                <Label htmlFor="structure-column-default">Default</Label>
                <Input id="structure-column-default" value={draft.columnDefault} placeholder="EMPTY, NULL, 0, text, CURRENT_TIMESTAMP" onChange={e => patchDraft(setDraft, { columnDefault: e.target.value })} />
              </div>
              {extraOptions.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Extra</Label>
                  <Select value={draft.columnExtra || 'none'} onValueChange={value => patchDraft(setDraft, { columnExtra: value === 'none' ? '' : value })}>
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

              <div className="space-y-3 rounded-md border p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={draft.fkEnabled}
                    onChange={e => patchDraft(setDraft, { fkEnabled: e.target.checked })}
                  />
                  Foreign key
                </label>
                <div className="space-y-1.5">
                  <Label>Reference table</Label>
                  <Select value={draft.refTable} onValueChange={value => patchDraft(setDraft, { refTable: value, refColumn: '' })}>
                    <SelectTrigger><SelectValue placeholder="Select table" /></SelectTrigger>
                    <SelectContent>
                      {tables.map(table => <SelectItem key={table.table_name} value={table.table_name}>{table.table_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Reference column</Label>
                  <Select value={draft.refColumn} onValueChange={value => patchDraft(setDraft, { refColumn: value })}>
                    <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                    <SelectContent>
                      {referenceColumns.map(column => <SelectItem key={column.name} value={column.name}>{column.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {draft.refTable && referenceColumns.length === 0 && (
                    <p className="text-xs text-muted-foreground">No compatible columns for this type.</p>
                  )}
                </div>
              </div>
            </>
          )}

          {isIndexTarget(target) && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="structure-index-name">Index name</Label>
                <Input id="structure-index-name" value={draft.indexName} onChange={e => patchDraft(setDraft, { indexName: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={draft.indexUnique}
                  onChange={e => patchDraft(setDraft, { indexUnique: e.target.checked })}
                />
                Unique
              </label>
              <div className="space-y-1.5">
                <Label>Algorithm</Label>
                <Select value={draft.indexAlgorithm || 'default'} onValueChange={value => patchDraft(setDraft, { indexAlgorithm: value === 'default' ? '' : value })}>
                  <SelectTrigger><SelectValue>{draft.indexAlgorithm ? draft.indexAlgorithm.toUpperCase() : 'Default'}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    <SelectItem value="btree">BTREE</SelectItem>
                    <SelectItem value="hash">HASH</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Columns</Label>
                <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border p-2">
                  {tableColumns.map((column: any) => (
                    <label key={column.name} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={draft.indexColumns.includes(column.name)}
                        onChange={e => patchDraft(setDraft, {
                          indexColumns: e.target.checked
                            ? [...draft.indexColumns, column.name]
                            : draft.indexColumns.filter(name => name !== column.name),
                        })}
                      />
                      <span className="font-mono">{column.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
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
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button onClick={onSave} disabled={!isDirty || isSaving}>
            Submit
          </Button>
        </div>
      </div>
    </aside>
  );
}
