import { ReactNode, useRef, useState } from 'react';
import { AlertCircle, ArrowDown, ArrowRight, ArrowUp, Database, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createColumnHelpers, displayCellValue, draftValue, formatRawCellValue } from './data-viewer-utils';

type DataViewerRecordsTableProps = {
  activeTable: string;
  columnHelpers: ReturnType<typeof createColumnHelpers>;
  error: string | null;
  foreignKeyByColumn: Map<string, any>;
  isLoadingRecords: boolean;
  records: any;
  tableSchema: any;
  primaryKeyColumns: string[];
  selectedRow: Record<string, any> | null;
  selectedRowKeys: Set<string>;
  sort: any;
  recordDrafts: Record<string, { rowKey: string; column: string; key: Record<string, any>; value: any }>;
  handleSelectRow: (row: Record<string, any>, event: React.MouseEvent) => void;
  openRelatedRecord: (table: string, column: string, value: any) => void;
  onAddRecord: () => void;
  onDraftCell: (row: Record<string, any>, column: string, value: any) => void;
  onDiscardDraftCell: (row: Record<string, any>, column: string) => void;
  onDeleteSelectedRecords: () => void;
  onTogglePageRows: (rows: Record<string, any>[], checked: boolean) => void;
  onToggleSelectedRow: (row: Record<string, any>, checked: boolean, event?: React.MouseEvent) => void;
  toggleSort: (column: string) => void;
  warnUnsaved: () => boolean;
  children?: ReactNode;
};

function RefreshProgress({ active }: { active: boolean }) {
  return <div className="h-0.5 overflow-hidden bg-transparent">{active && <div className="h-full w-full animate-pulse bg-primary" />}</div>;
}

const csvCell = (value: any) => {
  const text = formatRawCellValue(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const sqlValue = (value: any) => value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replace(/'/g, "''")}'`;

export function DataViewerRecordsTable({
  activeTable,
  columnHelpers,
  error,
  foreignKeyByColumn,
  isLoadingRecords,
  records,
  tableSchema,
  primaryKeyColumns,
  selectedRow,
  selectedRowKeys,
  sort,
  recordDrafts,
  handleSelectRow,
  openRelatedRecord,
  onAddRecord,
  onDraftCell,
  onDiscardDraftCell,
  onDeleteSelectedRecords,
  onTogglePageRows,
  onToggleSelectedRow,
  toggleSort,
  warnUnsaved,
  children,
}: DataViewerRecordsTableProps) {
  const [editingCell, setEditingCell] = useState<{ rowKey: string; column: string } | null>(null);
  const canSelectRows = primaryKeyColumns.length > 0;
  const rowKey = (row: Record<string, any>) => JSON.stringify(primaryKeyColumns.map(column => row[column]));
  const pageRows = records?.rows || [];
  const scrollRef = useRef<HTMLDivElement>(null);
  const columns = records?.columns || [];
  const allPageRowsSelected = canSelectRows && pageRows.length > 0 && pageRows.every((row: any) => selectedRowKeys.has(rowKey(row)));
  const columnMeta = (column: string) => (tableSchema?.columns || []).find((item: any) => item.name === column);
  const copyText = async (text: string, label = 'Copied') => {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  };
  const rowValues = (row: Record<string, any>) => columns.map((column: string) => row[column]);
  const copyRowsAs = (rows: Record<string, any>[], format: string) => {
    if (rows.length === 0) return;
    const text = format === 'json'
      ? JSON.stringify(rows, null, 2)
      : format === 'html'
        ? `<table><thead><tr>${columns.map((col: string) => `<th>${col}</th>`).join('')}</tr></thead><tbody>${rows.map((row: any) => `<tr>${rowValues(row).map(value => `<td>${formatRawCellValue(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
        : format === 'markdown'
          ? `| ${columns.join(' | ')} |\n| ${columns.map(() => '---').join(' | ')} |\n${rows.map((row: any) => `| ${rowValues(row).map(formatRawCellValue).join(' | ')} |`).join('\n')}`
          : format === 'csv'
            ? rows.map((row: any) => rowValues(row).map(csvCell).join(',')).join('\n')
            : format === 'csv-header'
              ? [columns.join(','), ...rows.map((row: any) => rowValues(row).map(csvCell).join(','))].join('\n')
              : format === 'insert'
                ? rows.map((row: any) => `INSERT INTO "${activeTable}" (${columns.map((col: string) => `"${col}"`).join(', ')}) VALUES (${rowValues(row).map(sqlValue).join(', ')});`).join('\n')
                : rows.map((row: any) => rowValues(row).map(formatRawCellValue).join('\t')).join('\n');
    copyText(text);
  };
  return (
    <div className="min-h-0 overflow-hidden flex flex-col" data-db-client-records>
      {children}

      {error ? (
        <div className="flex-1 flex items-center justify-center text-sm">
          <div className="flex flex-col items-center gap-3 max-w-xs text-center">
            {error.includes('Catalog not found') ? (
              <>
                <Database className="w-8 h-8 text-muted-foreground/40" />
                <div>
                  <p className="font-medium text-foreground mb-1">Connection was removed</p>
                  <p className="text-xs text-muted-foreground">
                    This diagram is no longer connected to the database. The ERD data is still saved.
                  </p>
                </div>
                <Button variant="outline" size="sm" className="mt-1" onClick={() => window.history.replaceState(null, '', '?tab=erd')}>
                  Switch to ERD
                </Button>
              </>
            ) : (
              <>
                <AlertCircle className="w-5 h-5 text-destructive" />
                <span className="text-destructive">{error}</span>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="px-4 py-2 border-b bg-muted/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium">{activeTable}</h3>
              {records && (
                <span className="text-xs text-muted-foreground">
                  {records.total} row{records.total !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={selectedRowKeys.size === 0} onClick={onDeleteSelectedRecords}>
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Delete All
              </Button>
              <Button variant="outline" size="sm" className="h-8 px-2" onClick={onAddRecord}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Record
              </Button>
            </div>
          </div>
          <RefreshProgress active={isLoadingRecords} />
          <div
            ref={scrollRef}
            className="flex-1 overflow-auto custom-scrollbar min-h-0"
            onWheel={(e) => {
              if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) scrollRef.current!.scrollLeft += e.deltaX;
            }}
          >
            {records && (
              <div className="min-w-fit inline-block align-middle">
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 bg-background z-10">
                    {canSelectRows && (
                      <TableHead className="w-10 px-3">
                        <Checkbox
                          checked={allPageRowsSelected}
                          disabled={pageRows.length === 0}
                          onCheckedChange={checked => onTogglePageRows(pageRows, checked)}
                        />
                      </TableHead>
                    )}
                    {columns.map((column: string) => (
                      <TableHead
                        key={column}
                        aria-sort={sort?.column === column ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                        className="cursor-pointer select-none whitespace-nowrap px-4 py-0 hover:bg-muted/60"
                        onClick={() => warnUnsaved() && toggleSort(column)}
                        title={`Sort by ${column}`}
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              if (warnUnsaved()) toggleSort(column);
                            }
                          }}
                          className="flex h-10 items-center gap-1.5 font-mono text-xs font-medium"
                        >
                          <span>{column}</span>
                          <span className="flex h-3 w-3 items-center justify-center">
                            {sort?.column === column && (
                              sort.direction === 'asc'
                                ? <ArrowUp className="h-3 w-3 text-primary" />
                                : <ArrowDown className="h-3 w-3 text-primary" />
                            )}
                          </span>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={records.columns.length + (canSelectRows ? 1 : 0)} className="h-24 text-center text-muted-foreground text-sm">
                        No rows
                      </TableCell>
                    </TableRow>
                  ) : (
                    records.rows.map((row: any, idx: number) => (
                      <TableRow
                        key={idx}
                        className={`cursor-pointer hover:bg-muted/50 ${selectedRow === row ? 'bg-muted/70' : ''}`}
                        onMouseDown={e => { if (e.shiftKey) e.preventDefault(); }}
                        onClick={e => handleSelectRow(row, e)}
                      >
                        {canSelectRows && (
                          <TableCell className="w-10 px-3" onClick={e => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedRowKeys.has(rowKey(row))}
                              onClick={e => onToggleSelectedRow(row, !selectedRowKeys.has(rowKey(row)), e)}
                            />
                          </TableCell>
                        )}
                        {columns.map((column: string) => {
                          const val = row[column];
                          const draft = recordDrafts[`${rowKey(row)}:${column}`];
                          const displayValue = draft ? draft.value : val;
                          const fk = foreignKeyByColumn.get(column) as any;
                          const isEditing = editingCell?.rowKey === rowKey(row) && editingCell.column === column;
                          const editable = canSelectRows && !columnHelpers.isReadOnlyColumn(column);
                          return (
                            <TableCell
                              key={column}
                              className={`group max-w-75 text-sm font-mono ${draft ? 'bg-primary/10 ring-1 ring-inset ring-primary/30' : ''}`}
                              onDoubleClick={e => {
                                e.stopPropagation();
                                if (!editable) return;
                                onDraftCell(row, column, draft ? draft.value : draftValue(column, val, columnHelpers));
                                setEditingCell({ rowKey: rowKey(row), column });
                              }}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                {isEditing ? (
                                  <input
                                    autoFocus
                                    value={displayValue ?? ''}
                                    onChange={e => onDraftCell(row, column, e.target.value)}
                                    onClick={e => e.stopPropagation()}
                                    onBlur={() => setEditingCell(null)}
                                    onKeyDown={e => {
                                      if (e.key === 'Escape') {
                                        onDiscardDraftCell(row, column);
                                        setEditingCell(null);
                                      }
                                      if (e.key === 'Enter') setEditingCell(null);
                                    }}
                                    className="h-7 min-w-40 flex-1 rounded border border-primary/50 bg-background px-2 font-mono text-sm outline-none"
                                  />
                                ) : (
                                  <span className="min-w-0 flex-1 truncate">
                                  {displayValue === null ? (
                                    <span className="text-muted-foreground/40 italic">NULL</span>
                                  ) : typeof displayValue === 'object' ? (
                                    <span className="text-xs">{JSON.stringify(displayValue)}</span>
                                  ) : (
                                    displayCellValue(column, displayValue, columnHelpers)
                                  )}
                                  </span>
                                )}
                                {fk && val !== null && val !== undefined && (
                                  <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    className="size-6 shrink-0 opacity-60 hover:opacity-100"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (warnUnsaved()) openRelatedRecord(fk.ref_table, fk.ref_column, val);
                                    }}
                                    title={`Open ${fk.ref_table}.${fk.ref_column} = ${String(val)}`}
                                  >
                                    <ArrowRight className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <DropdownMenu>
                                  <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-xs" className="size-6 shrink-0 opacity-0 group-hover:opacity-100" onClick={e => e.stopPropagation()} />}>
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-52" onClick={e => e.stopPropagation()}>
                                    <DropdownMenuSub>
                                      <DropdownMenuSubTrigger>Set Value</DropdownMenuSubTrigger>
                                      <DropdownMenuSubContent className="w-36">
                                        <DropdownMenuItem disabled={!editable} onClick={() => onDraftCell(row, column, null)}>NULL</DropdownMenuItem>
                                        <DropdownMenuItem disabled={!editable} onClick={() => onDraftCell(row, column, '')}>EMPTY</DropdownMenuItem>
                                        <DropdownMenuItem disabled={!editable} onClick={() => onDraftCell(row, column, columnMeta(column)?.column_default ?? '')}>DEFAULT</DropdownMenuItem>
                                      </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => copyRowsAs([row], 'plain')}>Copy</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => copyText(formatRawCellValue(displayValue), 'Cell copied')}>Copy Cell Value</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => copyText(pageRows.map((item: any) => formatRawCellValue(item[column])).join('\n'), 'Column copied')}>Copy All Column Values</DropdownMenuItem>
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
                              </div>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
