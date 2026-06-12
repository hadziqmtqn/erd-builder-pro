import React, { useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, ChevronRight, Database, TableIcon, Loader2, AlertCircle } from 'lucide-react';
import { useDataViewer } from '@/hooks/useDataViewer';

interface DataViewerProps {
  connectionId: number;
}

export function DataViewer({ connectionId }: DataViewerProps) {
  const {
    tables, activeTable, records, page, totalPages,
    isLoadingTables, isLoadingRecords, error,
    fetchTables, selectTable, nextPage, prevPage, goToPage,
  } = useDataViewer(connectionId);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left panel — table list */}
      <div className="w-64 shrink-0 border-r bg-muted/20 flex flex-col">
        <div className="px-3 py-2.5 border-b">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5" />
            Tables
          </h3>
        </div>
        <ScrollArea className="flex-1">
          {isLoadingTables ? (
            <div className="p-3 space-y-2">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-8 w-full rounded-md" />)}
            </div>
          ) : tables.length === 0 ? (
            <div className="p-3 text-center text-xs text-muted-foreground">
              {error ? (
                <div className="flex flex-col items-center gap-2 text-destructive">
                  <AlertCircle className="w-4 h-4" />
                  <span>{error}</span>
                </div>
              ) : (
                'No tables found'
              )}
            </div>
          ) : (
            <div className="p-1.5 space-y-0.5">
              {tables.map((t: any) => (
                <button
                  key={t.table_name}
                  onClick={() => selectTable(t.table_name)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-colors flex items-center gap-2 ${
                    activeTable === t.table_name
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                >
                  <TableIcon className="w-3.5 h-3.5 shrink-0 opacity-60" />
                  <span className="truncate">{t.table_name}</span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Main area — records */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!activeTable ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <Database className="w-8 h-8 text-muted-foreground/30" />
              <span>Select a table to view records</span>
            </div>
          </div>
        ) : isLoadingRecords ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-sm text-destructive">
            <div className="flex flex-col items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          </div>
        ) : records && (
          <>
            {/* Records header */}
            <div className="px-4 py-2 border-b bg-muted/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium">{activeTable}</h3>
                <span className="text-xs text-muted-foreground">
                  {records.total} row{records.total !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Records grid — horizontal scroll */}
            <div className="flex-1 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 bg-background">
                    <TableHead className="w-10 text-right text-xs text-muted-foreground">#</TableHead>
                    {records.columns.map((col: string) => (
                      <TableHead key={col} className="text-xs font-mono whitespace-nowrap">
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={records.columns.length + 1} className="h-24 text-center text-muted-foreground text-sm">
                        No rows
                      </TableCell>
                    </TableRow>
                  ) : (
                    records.rows.map((row: any, idx: number) => (
                      <TableRow key={idx} className="hover:bg-muted/50">
                        <TableCell className="text-right text-xs text-muted-foreground font-mono w-10">
                          {(page - 1) * records.pageSize + idx + 1}
                        </TableCell>
                        {records.columns.map((col: string) => {
                          const val = row[col];
                          return (
                            <TableCell key={col} className="text-sm font-mono max-w-[300px] truncate">
                              {val === null ? (
                                <span className="text-muted-foreground/40 italic">NULL</span>
                              ) : typeof val === 'object' ? (
                                <span className="text-xs">{JSON.stringify(val)}</span>
                              ) : (
                                String(val)
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/10 shrink-0">
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon-xs"
                    disabled={page <= 1}
                    onClick={prevPage}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {(() => {
                    const start = Math.max(1, Math.min(page - 3, totalPages - 6));
                    const end = Math.min(totalPages, start + 6);
                    const pages: number[] = [];
                    for (let p = start; p <= end; p++) pages.push(p);
                    return pages.map(p => (
                      <Button
                        key={p}
                        variant={p === page ? 'default' : 'outline'}
                        size="icon-xs"
                        onClick={() => goToPage(p)}
                        disabled={isLoadingRecords || p === page}
                        className={p === page ? '' : 'text-muted-foreground'}
                      >
                        {p}
                      </Button>
                    ));
                  })()}
                  <Button
                    variant="outline"
                    size="icon-xs"
                    disabled={page >= totalPages}
                    onClick={nextPage}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
