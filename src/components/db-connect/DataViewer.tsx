import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, ChevronRight, Database, TableIcon, Loader2, AlertCircle, Search, X } from 'lucide-react';
import { useDataViewer } from '@/hooks/useDataViewer';

interface DataViewerProps {
  connectionId: number;
  stateKey?: string;
}

export function DataViewer({ connectionId, stateKey }: DataViewerProps) {
  const {
    tables, activeTable, openTabs, records, page, totalPages,
    isLoadingTables, isLoadingRecords, error,
    fetchTables, selectTable, pinTable, closeTable, nextPage, prevPage,
  } = useDataViewer(connectionId, stateKey);
  const [tableSearch, setTableSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const shortcutLabel = useMemo(() => {
    if (typeof navigator === 'undefined') return 'Ctrl+P';
    return /mac|iphone|ipad|ipod/i.test(navigator.platform) ? '⌘P' : 'Ctrl+P';
  }, []);

  const filteredTables = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return tables;
    return tables.filter((t: any) => String(t.table_name).toLowerCase().includes(q));
  }, [tables, tableSearch]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'p') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left panel — table list */}
      <div className="w-64 shrink-0 border-r bg-muted/20 flex flex-col overflow-hidden">
        <div className="px-3 py-2.5 border-b">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5" />
            Tables
          </h3>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              ref={searchRef}
              value={tableSearch}
              onChange={e => setTableSearch(e.target.value)}
              placeholder={`Search tables... (${shortcutLabel})`}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-1.5 space-y-0.5">
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
            ) : filteredTables.length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-foreground">No matching tables</div>
            ) : (
              filteredTables.map((t: any) => (
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
              ))
            )}
          </div>
        </div>
      </div>

      {/* Main area — records */}
      <div className="flex-1 grid grid-rows-[1fr_auto] overflow-hidden">
        {!activeTable ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <Database className="w-8 h-8 text-muted-foreground/30" />
              <span>Select a table to view records</span>
            </div>
          </div>
        ) : (
          <>
            {/* Content area — always takes 1fr (remaining space) */}
            <div className="min-h-0 overflow-hidden flex flex-col">
              {openTabs.length > 0 && (
                <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b bg-muted/10 px-2 py-1 scrollbar-hide">
                  {openTabs.map(tab => (
                    <button
                      key={tab.name}
                      onClick={() => selectTable(tab.name)}
                      onDoubleClick={() => pinTable(tab.name)}
                      className={`group flex h-8 max-w-48 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors ${
                        activeTable === tab.name
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      }`}
                      title={tab.pinned ? `${tab.name} (pinned)` : `${tab.name} (double click to pin)`}
                    >
                      <span className={`truncate ${tab.pinned ? 'not-italic' : 'italic'}`}>{tab.name}</span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); closeTable(tab.name); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            closeTable(tab.name);
                          }
                        }}
                        className="ml-1 rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100"
                        title="Close table"
                      >
                        <X className="h-3 w-3" />
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {isLoadingRecords ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : error ? (
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
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-1"
                          onClick={() => window.history.replaceState(null, '', '?tab=erd')}
                        >
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
              ) : records ? (
                <>
                  {/* Records header */}
                  <div className="px-4 py-2 border-b bg-muted/10 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium">{activeTable}</h3>
                      <span className="text-xs text-muted-foreground">
                        {records.total} row{records.total !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Records grid */}
                  <div className="flex-1 overflow-auto custom-scrollbar min-h-0">
                    <div className="min-w-fit inline-block align-middle">
                      <Table>
                        <TableHeader>
                          <TableRow className="sticky top-0 bg-background z-10">
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
                              <TableCell colSpan={records.columns.length} className="h-24 text-center text-muted-foreground text-sm">
                                No rows
                              </TableCell>
                            </TableRow>
                          ) : (
                            records.rows.map((row: any, idx: number) => (
                              <TableRow key={idx} className="hover:bg-muted/50">
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
                  </div>
                </>
              ) : null}
            </div>

            {/* Pagination — auto row, only visible when records loaded */}
            {records && (
              <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/10 shrink-0">
                <span className="text-xs text-muted-foreground">
                  {records.total > 0
                    ? `${((page || 1) - 1) * (records.pageSize || 50) + 1}–${Math.min((page || 1) * (records.pageSize || 50), Number(records.total))} of ${records.total}`
                    : '0 rows'}
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
