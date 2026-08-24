import { memo, ReactNode } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, Database, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createColumnHelpers } from './data-viewer-utils';
import { DataViewerRecordRow } from './DataViewerRecordRow';

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
  headerAction?: ReactNode;
  children?: ReactNode;
};

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
  headerAction,
  children,
}: DataViewerRecordsTableProps) {
  const canSelectRows = primaryKeyColumns.length > 0;
  const rowKey = (row: Record<string, any>) => JSON.stringify(primaryKeyColumns.map(column => row[column]));
  const pageRows = records?.rows || [];
  const columns = records?.columns || [];
  const allPageRowsSelected = canSelectRows && pageRows.length > 0 && pageRows.every((row: any) => selectedRowKeys.has(rowKey(row)));
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
          <div className="sticky top-0 z-20 px-4 py-2 border-b bg-background flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium">{activeTable}</h3>
              {records && (
                <span className="text-xs text-muted-foreground">
                  {records.total} row{records.total !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {headerAction}
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
            className="flex-1 overflow-auto custom-scrollbar min-h-0"
          >
            {records && (
              <div className="min-w-fit inline-block align-middle">
              <table className="table-fixed caption-bottom text-sm" style={{ width: `max(100%, ${columns.length * 240 + (canSelectRows ? 40 : 0)}px)` }}>
                <colgroup>
                  {canSelectRows && <col className="w-10" />}
                  {columns.map((column: string) => <col key={column} className="w-60" />)}
                </colgroup>
                <TableHeader className="sticky top-0 z-20 bg-background">
                  <TableRow className="bg-background">
                    {canSelectRows && (
                      <TableHead className="sticky top-0 z-20 w-10 bg-background px-3">
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
                        className="sticky top-0 z-20 cursor-pointer select-none whitespace-nowrap bg-background px-4 py-0 hover:bg-muted/60"
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
                    pageRows.map((row: Record<string, any>) => {
                      const rowKeyValue = rowKey(row);
                      return (
                        <DataViewerRecordRow
                          key={rowKeyValue}
                          activeTable={activeTable}
                          connectionId={connectionId}
                          dbType={dbType}
                          columns={columns}
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
