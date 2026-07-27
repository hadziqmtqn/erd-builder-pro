import { ReactNode } from 'react';
import { AlertCircle, ArrowDown, ArrowRight, ArrowUp, Database, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createColumnHelpers, displayCellValue } from './data-viewer-utils';

type DataViewerRecordsTableProps = {
  activeTable: string;
  columnHelpers: ReturnType<typeof createColumnHelpers>;
  error: string | null;
  foreignKeyByColumn: Map<string, any>;
  isLoadingRecords: boolean;
  records: any;
  primaryKeyColumns: string[];
  selectedRow: Record<string, any> | null;
  selectedRowKeys: Set<string>;
  selectedRecordCount: number;
  sort: any;
  handleSelectRow: (row: Record<string, any>) => void;
  openRelatedRecord: (table: string, column: string, value: any) => void;
  onAddRecord: () => void;
  onClearSelectedRecords: () => void;
  onDeleteSelectedRecords: () => void;
  onTogglePageRows: (rows: Record<string, any>[], checked: boolean) => void;
  onToggleSelectedRow: (row: Record<string, any>, checked: boolean) => void;
  toggleSort: (column: string) => void;
  warnUnsaved: () => boolean;
  children?: ReactNode;
};

function RefreshProgress({ active }: { active: boolean }) {
  return <div className="h-0.5 overflow-hidden bg-transparent">{active && <div className="h-full w-full animate-pulse bg-primary" />}</div>;
}

export function DataViewerRecordsTable({
  activeTable,
  columnHelpers,
  error,
  foreignKeyByColumn,
  isLoadingRecords,
  records,
  primaryKeyColumns,
  selectedRow,
  selectedRowKeys,
  selectedRecordCount,
  sort,
  handleSelectRow,
  openRelatedRecord,
  onAddRecord,
  onClearSelectedRecords,
  onDeleteSelectedRecords,
  onTogglePageRows,
  onToggleSelectedRow,
  toggleSort,
  warnUnsaved,
  children,
}: DataViewerRecordsTableProps) {
  const canSelectRows = primaryKeyColumns.length > 0;
  const rowKey = (row: Record<string, any>) => JSON.stringify(primaryKeyColumns.map(column => row[column]));
  const pageRows = records?.rows || [];
  const allPageRowsSelected = canSelectRows && pageRows.length > 0 && pageRows.every((row: any) => selectedRowKeys.has(rowKey(row)));
  return (
    <div className="min-h-0 overflow-hidden flex flex-col">
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
              {selectedRecordCount > 0 && (
                <>
                  <Button variant="outline" size="sm" className="h-8 px-2" onClick={onClearSelectedRecords}>Uncheck All</Button>
                  <Button variant="destructive" size="sm" className="h-8 px-2" onClick={onDeleteSelectedRecords}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Delete {selectedRecordCount}
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" className="h-8 px-2" onClick={onAddRecord}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Record
              </Button>
            </div>
          </div>
          <RefreshProgress active={isLoadingRecords} />
          <div className="flex-1 overflow-auto custom-scrollbar min-h-0">
            {records && (
              <div className="min-w-fit inline-block align-middle">
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 bg-background z-10">
                    {canSelectRows && (
                      <TableHead className="w-10 px-3">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={allPageRowsSelected}
                          disabled={pageRows.length === 0}
                          onChange={e => onTogglePageRows(pageRows, e.target.checked)}
                        />
                      </TableHead>
                    )}
                    {records.columns.map((column: string) => (
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
                        onClick={() => handleSelectRow(row)}
                      >
                        {canSelectRows && (
                          <TableCell className="w-10 px-3" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="size-4 accent-primary"
                              checked={selectedRowKeys.has(rowKey(row))}
                              onChange={e => onToggleSelectedRow(row, e.target.checked)}
                            />
                          </TableCell>
                        )}
                        {records.columns.map((column: string) => {
                          const val = row[column];
                          const fk = foreignKeyByColumn.get(column) as any;
                          return (
                            <TableCell key={column} className="max-w-75 text-sm font-mono">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="min-w-0 flex-1 truncate">
                                  {val === null ? (
                                    <span className="text-muted-foreground/40 italic">NULL</span>
                                  ) : typeof val === 'object' ? (
                                    <span className="text-xs">{JSON.stringify(val)}</span>
                                  ) : (
                                    displayCellValue(column, val, columnHelpers)
                                  )}
                                </span>
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
