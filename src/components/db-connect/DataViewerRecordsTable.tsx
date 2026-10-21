import { memo, ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, Database, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ColumnWidths, createColumnHelpers, loadColumnWidths, saveColumnWidths } from './data-viewer-utils';
import { DataViewerRecordRow } from './DataViewerRecordRow';
import { useRecordColumnWindow } from '@/hooks/useRecordColumnWindow';

type DataViewerRecordsTableProps = {
  activeTable: string;
  connectionId: number;
  dbType: string | null;
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
  onEditRecord: (row: Record<string, any>) => void;
  onDeleteTables: (tableNames: string[], options: { ignoreForeignKeys?: boolean; cascade?: boolean }) => Promise<any>;
  onMutateTables: (patch: Record<string, any>) => Promise<any>;
  openRelatedRecord: (table: string, column: string, value: any) => void;
  onAddRecord: () => void;
  onDraftCell: (row: Record<string, any>, column: string, value: any) => void;
  onDeleteSelectedRecords: () => void;
  onTogglePageRows: (rows: Record<string, any>[], checked: boolean) => void;
  onToggleSelectedRow: (row: Record<string, any>, checked: boolean, event?: React.MouseEvent) => void;
  toggleSort: (column: string) => void;
  warnUnsaved: () => boolean;
  readOnlyReason?: string | null;
  hasActiveFilters?: boolean;
  headerAction?: ReactNode;
  children?: ReactNode;
};

const DEFAULT_COLUMN_WIDTH = 50;
const MIN_COLUMN_WIDTH = 32;
// shortcut: auto-fit caps very long values (JSON, text) so one column cannot span thousands of pixels; raise if users need wider.
const MAX_FIT_WIDTH = 1000;
const clampWidth = (width: number) => Math.max(MIN_COLUMN_WIDTH, Math.round(width));
const EMPTY_WIDTHS: Record<string, number> = {};
const EMPTY_COLUMNS: string[] = [];

// Natural width of a column: the widest [data-fit] text (measured with a Range, so it can shrink as well as grow)
// plus the rest of its cell (padding, sort icon, FK button), which stays fixed because [data-fit] takes the free space.
function fitColumnWidth(table: HTMLTableElement | null, column: string) {
  if (!table) return DEFAULT_COLUMN_WIDTH;
  let width = MIN_COLUMN_WIDTH;
  const range = document.createRange();
  table.querySelectorAll<HTMLElement>(`[data-column="${CSS.escape(column)}"]`).forEach(cell => {
    const fit = cell.querySelector<HTMLElement>('[data-fit]');
    if (!fit) return;
    range.selectNodeContents(fit);
    width = Math.max(width, Math.ceil(range.getBoundingClientRect().width) + cell.clientWidth - fit.clientWidth);
  });
  return Math.min(MAX_FIT_WIDTH, clampWidth(width + 1));
}

function RefreshProgress({ active }: { active: boolean }) {
  return <div className="h-0.5 overflow-hidden bg-transparent">{active && <div className="h-full w-full animate-pulse bg-primary" />}</div>;
}

export const DataViewerRecordsTable = memo(function DataViewerRecordsTable({
  activeTable,
  connectionId,
  dbType,
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
  onEditRecord,
  onDeleteTables,
  onMutateTables,
  openRelatedRecord,
  onAddRecord,
  onDraftCell,
  onDeleteSelectedRecords,
  onTogglePageRows,
  onToggleSelectedRow,
  toggleSort,
  warnUnsaved,
  readOnlyReason = null,
  hasActiveFilters = false,
  headerAction,
  children,
}: DataViewerRecordsTableProps) {
  const canSelectRows = primaryKeyColumns.length > 0;
  const rowKey = (row: Record<string, any>) => JSON.stringify(primaryKeyColumns.map(column => row[column]));
  const pageRows = records?.rows || [];
  const columns: string[] = records?.columns || EMPTY_COLUMNS;
  const allPageRowsSelected = canSelectRows && pageRows.length > 0 && pageRows.every((row: any) => selectedRowKeys.has(rowKey(row)));
  const tableRef = useRef<HTMLTableElement>(null);
  const [stored, setStored] = useState<{ connectionId: number; widthsByTable: ColumnWidths }>(() => ({ connectionId, widthsByTable: loadColumnWidths(connectionId) }));
  if (stored.connectionId !== connectionId) setStored({ connectionId, widthsByTable: loadColumnWidths(connectionId) });
  const widths = stored.widthsByTable[activeTable] || EMPTY_WIDTHS;
  const widthOf = (column: string) => clampWidth(widths[column] ?? DEFAULT_COLUMN_WIDTH);
  const columnSizes = useMemo(() => columns.map(column => clampWidth(widths[column] ?? DEFAULT_COLUMN_WIDTH)), [columns, widths]);
  const { scrollRef, columnWindow } = useRecordColumnWindow(columnSizes, canSelectRows ? 40 : 0);
  const [fitRequest, setFitRequest] = useState<{ column: string; table: string; connectionId: number } | null>(null);
  const measureColumn = fitRequest?.table === activeTable && fitRequest.connectionId === connectionId ? fitRequest.column : null;
  const setWidth = (column: string, width: number) => setStored(prev => {
    const widthsByTable = { ...prev.widthsByTable, [activeTable]: { ...prev.widthsByTable[activeTable], [column]: clampWidth(width) } };
    saveColumnWidths(prev.connectionId, widthsByTable);
    return { ...prev, widthsByTable };
  });
  useLayoutEffect(() => {
    if (!fitRequest) return;
    // Auto-fit must measure all page rows, including cells normally kept outside the render window.
    if (measureColumn) setWidth(measureColumn, fitColumnWidth(tableRef.current, measureColumn));
    setFitRequest(null);
  }, [fitRequest, measureColumn]);
  const autoFit = (column: string) => setFitRequest({ column, table: activeTable, connectionId });
  const startResize = (event: React.PointerEvent<HTMLDivElement>, column: string) => {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = widthOf(column);
    handle.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => setWidth(column, startWidth + moveEvent.clientX - startX);
    const end = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', end); handle.removeEventListener('pointercancel', end); };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };
  const tableWidth = columns.reduce((total: number, column: string) => total + widthOf(column), canSelectRows ? 40 : 0);
  return (
    <div className="min-h-0 flex-1 overflow-hidden flex flex-col" data-db-client-records>
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
          <div className="sticky top-0 z-20 px-4 py-2 border-b bg-background flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-sm font-medium">{activeTable}</h3>
              {records && (
                <span className="text-xs text-muted-foreground">
                  {records.total} row{records.total !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {headerAction}
              {/* Disabled buttons ignore pointer events, so the wrapper carries the read-only reason tooltip. */}
              <span className="flex" title={readOnlyReason ?? undefined}>
                <Button variant="outline" size="sm" className="h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={Boolean(readOnlyReason) || selectedRowKeys.size === 0} onClick={onDeleteSelectedRecords}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Delete selected{selectedRowKeys.size > 0 ? ` (${selectedRowKeys.size})` : ''}
                </Button>
              </span>
              <span className="flex" title={readOnlyReason ?? undefined}>
                <Button variant="outline" size="sm" className="h-8 px-2" disabled={Boolean(readOnlyReason)} onClick={onAddRecord}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Record
                </Button>
              </span>
            </div>
          </div>
          <RefreshProgress active={isLoadingRecords} />
          <div
            ref={scrollRef}
            data-records-scroll
            className="flex-1 overflow-auto custom-scrollbar min-h-0 isolate"
            style={{ contain: 'layout paint' }}
          >
            {!records && isLoadingRecords && (
              <div role="status" className="flex h-32 items-center justify-center text-sm text-muted-foreground">Loading records…</div>
            )}
            {records && (
              <div className="min-w-fit inline-block align-middle">
              <table ref={tableRef} aria-colcount={columns.length + (canSelectRows ? 1 : 0)} className="table-fixed caption-bottom text-sm" style={{ width: tableWidth }}>
                <colgroup>
                  {canSelectRows && <col style={{ width: 40 }} />}
                  {columns.map((column: string) => <col key={column} style={{ width: widthOf(column) }} />)}
                </colgroup>
                <TableHeader className="sticky top-0 z-20 bg-background">
                  <TableRow className="bg-background">
                    {canSelectRows && (
                      <TableHead className="w-10 bg-background px-3">
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
                        data-column={column}
                        className="relative cursor-pointer select-none overflow-hidden whitespace-nowrap bg-background px-2 py-0 hover:bg-muted/60"
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
                          className="flex h-10 min-w-0 items-center gap-1.5 font-mono text-xs font-medium"
                        >
                          <span data-fit className="min-w-0 flex-1 truncate">{column}</span>
                          <span className="flex h-3 w-3 shrink-0 items-center justify-center">
                            {sort?.column === column && (
                              sort.direction === 'asc'
                                ? <ArrowUp className="h-3 w-3 text-primary" />
                                : <ArrowDown className="h-3 w-3 text-primary" />
                            )}
                          </span>
                        </div>
                        {/* Excel-style border: drag to resize, double-click (or Enter) to fit the widest value. */}
                        <div
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Resize column ${column}`}
                          aria-valuenow={widthOf(column)}
                          aria-valuemin={MIN_COLUMN_WIDTH}
                          tabIndex={0}
                          title="Drag to resize, double-click to fit"
                          className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize touch-none border-r border-border hover:bg-primary/40 focus-visible:bg-primary/40 focus-visible:outline-none"
                          onPointerDown={event => startResize(event, column)}
                          onClick={event => event.stopPropagation()}
                          onDoubleClick={event => { event.stopPropagation(); autoFit(column); }}
                          onKeyDown={event => {
                            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); setWidth(column, widthOf(column) + (event.key === 'ArrowLeft' ? -10 : 10)); }
                            if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); autoFit(column); }
                          }}
                        />
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={records.columns.length + (canSelectRows ? 1 : 0)} className="h-24 text-center text-muted-foreground text-sm">
                        {hasActiveFilters ? 'No rows match the current filters' : 'No rows'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageRows.map((row: Record<string, any>, index: number) => {
                      const rowKeyValue = canSelectRows ? rowKey(row) : `row:${index}`;
                      return (
                        <DataViewerRecordRow
                          key={rowKeyValue}
                          activeTable={activeTable}
                          connectionId={connectionId}
                          dbType={dbType}
                          columns={columns}
                          columnWindow={columnWindow}
                          measureColumn={measureColumn}
                          columnHelpers={columnHelpers}
                          foreignKeyByColumn={foreignKeyByColumn}
                          pageRows={pageRows}
                          row={row}
                          rowKeyValue={rowKeyValue}
                          tableSchema={tableSchema}
                          canSelectRows={canSelectRows}
                          isActive={selectedRow === row}
                          isSelected={selectedRowKeys.has(rowKeyValue)}
                          recordDrafts={recordDrafts}
                          handleSelectRow={handleSelectRow}
                          onEditRecord={onEditRecord}
                          onDeleteTables={onDeleteTables}
                          onMutateTables={onMutateTables}
                          openRelatedRecord={openRelatedRecord}
                          onDraftCell={onDraftCell}
                          onToggleSelectedRow={onToggleSelectedRow}
                          warnUnsaved={warnUnsaved}
                          readOnly={Boolean(readOnlyReason)}
                        />
                      );
                    })
                  )}
                </TableBody>
              </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
});
