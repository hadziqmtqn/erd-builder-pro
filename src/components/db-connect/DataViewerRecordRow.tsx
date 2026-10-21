import { memo, useState } from 'react';
import { ArrowRight, MoreHorizontal, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TableCell, TableRow } from '@/components/ui/table';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { createColumnHelpers, DEFAULT_VALUE, displayCellValue, draftValue, formatRawCellValue, isDefaultValue, quoteTableName } from './data-viewer-utils';
import { DataViewerTableActions } from './DataViewerTableActions';
import { pinRecordColumns, type ColumnWindow } from '@/lib/record-column-window';

const csvCell = (value: any) => {
  const text = formatRawCellValue(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const sqlValue = (value: any) => value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replace(/'/g, "''")}'`;
const rowValues = (row: Record<string, any>, columns: string[]) => columns.map(column => row[column]);
// Overlay at the cell edge so the action button never takes width from narrow (50 px default) columns.
const CELL_ACTION_CLASS = 'absolute right-1 top-1/2 size-6 -translate-y-1/2 bg-background/90';

type DataViewerRecordRowProps = {
  activeTable: string;
  connectionId: number;
  dbType: string | null;
  columns: string[];
  columnWindow: ColumnWindow;
  columnHelpers: ReturnType<typeof createColumnHelpers>;
  foreignKeyByColumn: Map<string, any>;
  pageRows: Record<string, any>[];
  row: Record<string, any>;
  rowKeyValue: string;
  tableSchema: any;
  canSelectRows: boolean;
  isActive: boolean;
  isSelected: boolean;
  recordDrafts: Record<string, { rowKey: string; column: string; key: Record<string, any>; value: any }>;
  handleSelectRow: (row: Record<string, any>, event: React.MouseEvent) => void;
  onEditRecord: (row: Record<string, any>) => void;
  onDeleteTables: (tableNames: string[], options: { ignoreForeignKeys?: boolean; cascade?: boolean }) => Promise<any>;
  onMutateTables: (patch: Record<string, any>) => Promise<any>;
  openRelatedRecord: (table: string, column: string, value: any) => void;
  onDraftCell: (row: Record<string, any>, column: string, value: any) => void;
  onToggleSelectedRow: (row: Record<string, any>, checked: boolean, event?: React.MouseEvent) => void;
  warnUnsaved: () => boolean;
  readOnly?: boolean;
};

export const DataViewerRecordRow = memo(function DataViewerRecordRow({
  activeTable,
  connectionId,
  dbType,
  columns,
  columnWindow,
  columnHelpers,
  foreignKeyByColumn,
  pageRows,
  row,
  rowKeyValue,
  tableSchema,
  canSelectRows,
  isActive,
  isSelected,
  recordDrafts,
  handleSelectRow,
  onEditRecord,
  onDeleteTables,
  onMutateTables,
  openRelatedRecord,
  onDraftCell,
  onToggleSelectedRow,
  warnUnsaved,
  readOnly = false,
}: DataViewerRecordRowProps) {
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [menuColumn, setMenuColumn] = useState<string | null>(null);
  const visible = pinRecordColumns(columnWindow, columns, [editingColumn, menuColumn]);
  const copyText = async (text: string, label = 'Copied') => {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  };
  const copyRowsAs = (rows: Record<string, any>[], format: string) => {
    if (rows.length === 0) return;
    const text = format === 'json'
      ? JSON.stringify(rows, null, 2)
      : format === 'html'
        ? `<table><thead><tr>${columns.map(column => `<th>${column}</th>`).join('')}</tr></thead><tbody>${rows.map(item => `<tr>${columns.map(column => `<td>${formatRawCellValue(item[column])}</td>`).join('')}</tr>`).join('')}</tbody></table>`
        : format === 'markdown'
          ? `| ${columns.join(' | ')} |\n| ${columns.map(() => '---').join(' | ')} |\n${rows.map(item => `| ${columns.map(column => formatRawCellValue(item[column])).join(' | ')} |`).join('\n')}`
          : format === 'csv'
            ? rows.map(item => rowValues(item, columns).map(csvCell).join(',')).join('\n')
            : format === 'csv-header'
              ? [columns.join(','), ...rows.map(item => rowValues(item, columns).map(csvCell).join(','))].join('\n')
              : format === 'insert'
                ? rows.map(item => `INSERT INTO ${quoteTableName(dbType, tableSchema || { table_name: activeTable })} (${columns.map(column => `"${column}"`).join(', ')}) VALUES (${rowValues(item, columns).map(sqlValue).join(', ')});`).join('\n')
                : rows.map(item => rowValues(item, columns).map(formatRawCellValue).join('\t')).join('\n');
    copyText(text);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger render={
    <TableRow
      key={rowKeyValue}
      className={`cursor-pointer transition-none hover:bg-muted/50 ${isActive ? 'bg-muted/70' : isSelected ? 'bg-primary/10' : ''}`}
      onMouseDown={e => { if (e.shiftKey || e.metaKey || e.ctrlKey) e.preventDefault(); }}
      onClick={e => handleSelectRow(row, e)}
    >
      {canSelectRows && (
        <TableCell className="w-10 px-3" onClick={e => e.stopPropagation()}>
          <Checkbox checked={isSelected} onClick={e => onToggleSelectedRow(row, !isSelected, e)} />
        </TableCell>
      )}
      {visible.start > 0 && <TableCell aria-hidden="true" colSpan={visible.start} className="p-0" />}
      {columns.slice(visible.start, visible.end).map((column, index) => {
        const val = row[column];
        const draft = recordDrafts[`${rowKeyValue}:${column}`];
        const displayValue = draft ? draft.value : val;
        const fk = foreignKeyByColumn.get(column) as any;
        const isEditing = editingColumn === column;
        const editable = canSelectRows && !readOnly && !columnHelpers.isReadOnlyColumn(column);
        return (
          <TableCell
            key={column}
            data-column={column}
            aria-colindex={visible.start + index + (canSelectRows ? 2 : 1)}
            className={`group relative overflow-hidden text-sm font-mono ${isEditing ? 'p-0.5' : ''} ${draft ? 'bg-primary/10 ring-1 ring-inset ring-primary/30' : ''}`}
            onDoubleClick={e => {
              e.stopPropagation();
              if (!editable) return;
              onDraftCell(row, column, draft ? draft.value : draftValue(column, val, columnHelpers));
              setEditingColumn(column);
            }}
          >
            <div className={`flex min-w-0 items-center ${isEditing ? '' : 'gap-2'}`}>
              {isEditing ? (
                <input
                  autoFocus
                  value={draft ? (isDefaultValue(draft.value) ? '' : draft.value ?? '') : draftValue(column, val, columnHelpers)}
                  onChange={e => onDraftCell(row, column, e.target.value)}
                  onClick={e => e.stopPropagation()}
                  onBlur={() => setEditingColumn(null)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') setEditingColumn(null);
                    if (e.key === 'Enter') setEditingColumn(null);
                  }}
                  className="h-7 min-w-0 flex-1 rounded border border-primary/50 bg-background px-1.5 font-mono text-sm outline-none"
                />
              ) : (
                <span data-fit className="min-w-0 flex-1 truncate">
                  {displayValue === null ? (
                    <span className="text-muted-foreground/40 italic">NULL</span>
                  ) : isDefaultValue(displayValue) ? (
                    <span className="italic text-primary/70">DEFAULT</span>
                  ) : typeof displayValue === 'object' ? (
                    <span className="text-xs">{JSON.stringify(displayValue)}</span>
                  ) : (
                    displayCellValue(column, displayValue, columnHelpers)
                  )}
                </span>
              )}
              {!isEditing && fk && val !== null && val !== undefined && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="size-6 shrink-0 opacity-60 hover:opacity-100"
                  onClick={e => {
                    e.stopPropagation();
                    if (warnUnsaved()) openRelatedRecord(fk.ref_table, fk.ref_column, val);
                  }}
                  title={`Open ${fk.ref_table}.${fk.ref_column} = ${String(val)}`}
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
              {!isEditing && (menuColumn === column ? (
                <DropdownMenu open onOpenChange={open => { if (!open) setMenuColumn(null); }}>
                  <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-xs" className={CELL_ACTION_CLASS} aria-label={`Actions for ${column}`} onClick={e => e.stopPropagation()} />}>
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56" onClick={e => e.stopPropagation()}>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger disabled={!editable}>Set Value</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-44">
                        <DropdownMenuItem onClick={() => onDraftCell(row, column, '')}>EMPTY</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDraftCell(row, column, null)}>NULL</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDraftCell(row, column, DEFAULT_VALUE)}>DEFAULT</DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => copyText(formatRawCellValue(row[column]), 'Cell copied')}>Copy Cell Value</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => copyText(pageRows.map(item => formatRawCellValue(item[column])).join('\n'), 'Column copied')}>Copy Column</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => copyRowsAs([row], 'plain')}>Copy</DropdownMenuItem>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Copy Row As</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-44">
                        <DropdownMenuItem onClick={() => copyRowsAs([row], 'plain')}>Plain Text</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => copyRowsAs([row], 'json')}>JSON</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyRowsAs([row], 'html')}>HTML</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => copyRowsAs([row], 'markdown')}>Markdown Table</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => copyRowsAs([row], 'csv')}>CSV</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyRowsAs([row], 'csv-header')}>CSV with Header</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => copyRowsAs([row], 'insert')}>INSERT Statement</DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : isActive ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className={`${CELL_ACTION_CLASS} opacity-0 group-hover:opacity-100 focus-visible:opacity-100`}
                  aria-label={`Actions for ${column}`}
                  onClick={e => { e.stopPropagation(); setMenuColumn(column); }}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              ) : null)}
            </div>
          </TableCell>
        );
      })}
      {visible.end < columns.length && <TableCell aria-hidden="true" colSpan={columns.length - visible.end} className="p-0" />}
    </TableRow>
      } />
      <ContextMenuContent className="min-w-36">
        <ContextMenuItem onClick={() => onEditRecord(row)}><Pencil className="h-3.5 w-3.5" />Edit</ContextMenuItem>
        <ContextMenuSeparator />
        <DataViewerTableActions
          connectionId={connectionId}
          dbType={dbType}
          table={tableSchema || { table_name: activeTable, columns: columns.map(name => ({ name })) }}
          tables={[tableSchema].filter(Boolean)}
          exportRows={[row]}
          mode="context-item"
          onDeleteTables={onDeleteTables}
          onMutateTables={onMutateTables}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}, (prev, next) => {
  if (
    prev.activeTable !== next.activeTable ||
    prev.connectionId !== next.connectionId ||
    prev.dbType !== next.dbType ||
    prev.columns !== next.columns ||
    prev.columnWindow !== next.columnWindow ||
    prev.columnHelpers !== next.columnHelpers ||
    prev.foreignKeyByColumn !== next.foreignKeyByColumn ||
    prev.pageRows !== next.pageRows ||
    prev.row !== next.row ||
    prev.rowKeyValue !== next.rowKeyValue ||
    prev.tableSchema !== next.tableSchema ||
    prev.canSelectRows !== next.canSelectRows ||
    prev.readOnly !== next.readOnly ||
    prev.isActive !== next.isActive ||
    prev.isSelected !== next.isSelected ||
    prev.handleSelectRow !== next.handleSelectRow ||
    prev.onEditRecord !== next.onEditRecord ||
    prev.onDeleteTables !== next.onDeleteTables ||
    prev.onMutateTables !== next.onMutateTables ||
    prev.openRelatedRecord !== next.openRelatedRecord ||
    prev.onDraftCell !== next.onDraftCell ||
    prev.onToggleSelectedRow !== next.onToggleSelectedRow ||
    prev.warnUnsaved !== next.warnUnsaved
  ) return false;
  if (prev.recordDrafts === next.recordDrafts) return true;
  return prev.columns.every(column => Object.is(
    prev.recordDrafts[`${prev.rowKeyValue}:${column}`]?.value,
    next.recordDrafts[`${next.rowKeyValue}:${column}`]?.value,
  ));
});
