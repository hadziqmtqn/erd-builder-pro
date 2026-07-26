import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, ChevronRight, Database, TableIcon, Loader2, AlertCircle, Search, X, Plus, Minus, ArrowDown, ArrowUp, ArrowRight, PanelRightOpen } from 'lucide-react';
import { useDataViewer } from '@/hooks/useDataViewer';

interface DataViewerProps {
  connectionId: number;
  stateKey?: string;
}

export function DataViewer({ connectionId, stateKey }: DataViewerProps) {
  const {
    tables, activeTable, openTabs, filters, sort, records, page, totalPages,
    isLoadingTables, isLoadingRecords, error,
    fetchTables, selectTable, pinTable, closeTable, addFilter, removeFilter, updateFilter, applyFilter, applyFilters, openRelatedRecord, clearFilters, toggleSort, nextPage, prevPage,
  } = useDataViewer(connectionId, stateKey);
  const [tableSearch, setTableSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<Record<string, any> | null>(null);
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

  const columnOptions = useMemo(() => {
    const table = tables.find((t: any) => t.table_name === activeTable);
    return (table?.columns || records?.columns || []).map((col: any) => typeof col === 'string' ? col : col.name).filter(Boolean);
  }, [activeTable, tables, records]);

  const foreignKeyByColumn = useMemo(() => {
    const table = tables.find((t: any) => t.table_name === activeTable);
    return new Map((table?.foreign_keys || []).map((fk: any) => [fk.column, fk]));
  }, [activeTable, tables]);

  const operators = [
    '=', '!=', '<>', '>', '>=', '<', '<=',
    'LIKE', 'NOT LIKE', 'CONTAINS', 'NOT CONTAINS',
    'IN', 'NOT IN', 'BETWEEN', 'NOT BETWEEN',
    'IS', 'IS NOT',
  ];

  const formatBytes = (value: number | null | undefined) => {
    if (value === null || value === undefined) return 'Unavailable';
    if (value < 1024) return `${value} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let size = value / 1024;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unit]}`;
  };

  const formatCellValue = (value: any) => {
    if (value === null) return 'NULL';
    if (value === undefined) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  };

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  const openFilters = useCallback(() => {
    if (!activeTable) return;
    setShowFilters(true);
    if (filters.length === 0 && columnOptions.length > 0) addFilter(columnOptions[0]);
  }, [activeTable, filters.length, columnOptions, addFilter]);

  useEffect(() => {
    setShowFilters(false);
    setSelectedRow(null);
  }, [activeTable]);

  useEffect(() => {
    setSelectedRow(null);
  }, [page]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      const target = e.target as HTMLElement | null;
      const isTyping = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (key === 'p' && !isTyping) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (key === 'f' && activeTable) {
        e.preventDefault();
        openFilters();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTable, openFilters]);

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
              {activeTable && showFilters && filters.length > 0 && (
                <div className="shrink-0 border-b bg-muted/10 px-3 py-2">
                  <div className="space-y-1.5">
                    {filters.map(filter => {
                      const isNullCheck = filter.operator === 'IS' || filter.operator === 'IS NOT';
                      const isBetween = filter.operator === 'BETWEEN' || filter.operator === 'NOT BETWEEN';
                      return (
                        <div key={filter.id} className="flex min-w-0 items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={filter.enabled}
                            onChange={e => updateFilter(filter.id, { enabled: e.target.checked })}
                            className="size-4 shrink-0 accent-primary"
                            aria-label="Enable filter"
                          />
                          <Select
                            value={filter.column}
                            onValueChange={value => value && updateFilter(filter.id, { column: value })}
                          >
                            <SelectTrigger className="h-8 min-w-32 max-w-48 text-xs">
                              <SelectValue>{filter.column || 'Column'}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {columnOptions.map((col: string) => <SelectItem key={col} value={col} className="text-xs">{col}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Select
                            value={filter.operator}
                            onValueChange={value => value && updateFilter(filter.id, { operator: value })}
                          >
                            <SelectTrigger className="h-8 w-36 text-xs">
                              <SelectValue>{filter.operator}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {operators.map(op => <SelectItem key={op} value={op} className="text-xs">{op}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Input
                            value={isNullCheck ? 'NULL' : filter.value}
                            disabled={isNullCheck}
                            onChange={e => updateFilter(filter.id, { value: e.target.value })}
                            placeholder={filter.operator.includes('IN') ? 'a, b, c' : 'Value'}
                            className="h-8 min-w-28 flex-1 text-xs"
                          />
                          {isBetween && (
                            <Input
                              value={filter.value2 || ''}
                              onChange={e => updateFilter(filter.id, { value2: e.target.value })}
                              placeholder="And"
                              className="h-8 min-w-28 flex-1 text-xs"
                            />
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-8"
                            onClick={() => applyFilter(filter)}
                          >
                            Apply
                          </Button>
                          <Button
                            variant="outline"
                            size="icon-xs"
                            disabled={filters.length <= 1}
                            onClick={() => removeFilter(filter.id)}
                            title="Remove filter"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon-xs"
                            onClick={() => addFilter(filter.column || columnOptions[0] || '')}
                            title="Add filter"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => { clearFilters(); setShowFilters(false); }}
                      >
                        Clear
                      </Button>
                      <Button
                        size="sm"
                        className="h-8"
                        onClick={() => applyFilters(filters)}
                      >
                        Apply All
                      </Button>
                    </div>
                  </div>
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
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDetailsOpen(open => !open)}
                      title={detailsOpen ? 'Close details' : selectedRow ? 'Open record details' : 'Open table information'}
                    >
                      <PanelRightOpen className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Records grid */}
                  <div className="flex-1 overflow-auto custom-scrollbar min-h-0">
                    <div className="min-w-fit inline-block align-middle">
                      <Table>
                        <TableHeader>
                          <TableRow className="sticky top-0 bg-background z-10">
                            {records.columns.map((col: string) => (
                              <TableHead
                                key={col}
                                aria-sort={sort?.column === col ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                                className="cursor-pointer select-none whitespace-nowrap px-4 py-0 hover:bg-muted/60"
                                onClick={() => toggleSort(col)}
                                title={`Sort by ${col}`}
                              >
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      toggleSort(col);
                                    }
                                  }}
                                  className="flex h-10 items-center gap-1.5 font-mono text-xs font-medium"
                                >
                                  <span>{col}</span>
                                  <span className="flex h-3 w-3 items-center justify-center">
                                    {sort?.column === col && (
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
                              <TableCell colSpan={records.columns.length} className="h-24 text-center text-muted-foreground text-sm">
                                No rows
                              </TableCell>
                            </TableRow>
                          ) : (
                            records.rows.map((row: any, idx: number) => (
                              <TableRow
                                key={idx}
                                className={`cursor-pointer hover:bg-muted/50 ${selectedRow === row ? 'bg-muted/70' : ''}`}
                                onClick={() => {
                                  setSelectedRow(row);
                                  setDetailsOpen(true);
                                }}
                              >
                                {records.columns.map((col: string) => {
                                  const val = row[col];
                                  const fk = foreignKeyByColumn.get(col) as any;
                                  return (
                                    <TableCell key={col} className="max-w-75 text-sm font-mono">
                                      <div className="flex min-w-0 items-center gap-2">
                                        <span className="min-w-0 flex-1 truncate">
                                          {val === null ? (
                                            <span className="text-muted-foreground/40 italic">NULL</span>
                                          ) : typeof val === 'object' ? (
                                            <span className="text-xs">{JSON.stringify(val)}</span>
                                          ) : (
                                            String(val)
                                          )}
                                        </span>
                                        {fk && val !== null && val !== undefined && (
                                          <Button
                                            variant="ghost"
                                            size="icon-xs"
                                            className="size-6 shrink-0 opacity-60 hover:opacity-100"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              openRelatedRecord(fk.ref_table, fk.ref_column, val);
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
      {detailsOpen && (
        <aside className="w-80 shrink-0 border-l bg-background">
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-3 border-b p-4">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-medium">{selectedRow ? 'Record Details' : 'Table Information'}</h3>
                <p className="truncate text-xs text-muted-foreground">{activeTable || 'No table selected'}</p>
              </div>
              <Button variant="ghost" size="icon-xs" onClick={() => setDetailsOpen(false)} title="Close details">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {selectedRow && records ? (
                <div className="space-y-2">
                  {records.columns.map((col: string) => (
                    <div key={col} className="rounded-md border px-3 py-2">
                      <div className="truncate font-mono text-xs text-muted-foreground">{col}</div>
                      <div className={`mt-1 break-words font-mono text-xs ${selectedRow[col] === null ? 'italic text-muted-foreground/50' : ''}`}>
                        {formatCellValue(selectedRow[col])}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="divide-y rounded-md border">
                  {[
                    ['Data size', formatBytes(records?.tableInfo?.dataSize)],
                    ['Index size', formatBytes(records?.tableInfo?.indexSize)],
                    ['Total size', formatBytes(records?.tableInfo?.totalSize)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-mono text-xs">{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
