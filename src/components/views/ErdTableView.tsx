import React, { useState, useEffect, useCallback } from 'react';
import { Diagram, Project } from '@/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Plus, Columns3, MoreHorizontal, Pencil, Trash2, ChevronLeft, ChevronRight, Cable, Database } from 'lucide-react';
import { DBConnectPanel } from '@/components/db-connect/DBConnectPanel';

interface ErdTableViewProps {
  diagrams: Diagram[];
  projects: Project[];
  selectedWorkspace: string | null;
  page: number;
  totalDiagrams: number;
  isLoading: boolean;
  onSelectDiagram: (uid: string) => void;
  onCreateDiagram: () => void;
  onPageChange: (page: number) => void;
  onWorkspaceClick: (projectUid: string | null) => void;
  onOpenEditDocument: (uid: string) => void;
  onDeleteDiagram: (uid: string) => void;
}

const ITEMS_PER_PAGE = 10;
const STORAGE_KEY = 'erd-table-column-visibility';

interface ColumnDef {
  id: string;
  label: string;
  defaultVisible: boolean;
  hideable: boolean;
  width: string;
}

const DEFAULT_COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Name', defaultVisible: true, hideable: false, width: 'w-[22%]' },
  { id: 'workspace', label: 'Workspace', defaultVisible: true, hideable: false, width: 'w-[15%]' },
  { id: 'source', label: 'Source', defaultVisible: true, hideable: true, width: 'w-[12%]' },
  { id: 'updated', label: 'Updated', defaultVisible: false, hideable: true, width: 'w-[12%]' },
  { id: 'status', label: 'Status', defaultVisible: true, hideable: true, width: 'w-[8%]' },
  { id: 'created', label: 'Created', defaultVisible: true, hideable: true, width: 'w-[11%]' },
  { id: 'expires', label: 'Expires', defaultVisible: false, hideable: true, width: 'w-[12%]' },
  { id: 'actions', label: 'Actions', defaultVisible: true, hideable: false, width: 'w-[8%]' },
];

const loadColumnVisibility = (): Record<string, boolean> => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...parsed };
    }
  } catch {}
  // Fallback to defaults
  return Object.fromEntries(DEFAULT_COLUMNS.map(c => [c.id, c.defaultVisible]));
};

const formatSourceType = (st?: string): string => {
  if (!st) return '—';
  if (st === 'production_db') return 'DB Connect';
  return st.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

export const ErdTableView = React.memo(function ErdTableView({
  diagrams,
  projects,
  selectedWorkspace,
  page,
  totalDiagrams,
  isLoading,
  onSelectDiagram,
  onCreateDiagram,
  onPageChange,
  onWorkspaceClick,
  onOpenEditDocument,
  onDeleteDiagram,
}: ErdTableViewProps) {
  const totalPages = Math.max(1, Math.ceil(totalDiagrams / ITEMS_PER_PAGE));
  const [dbConnectOpen, setDbConnectOpen] = useState(false);
  const isDesktop = typeof window !== 'undefined' &&
    !!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(loadColumnVisibility);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleColumns));
    } catch {}
  }, [visibleColumns]);

  const toggleColumn = useCallback((colId: string) => {
    setVisibleColumns(prev => ({ ...prev, [colId]: !prev[colId] }));
  }, []);

  const isColVisible = useCallback((colId: string): boolean => {
    const col = DEFAULT_COLUMNS.find(c => c.id === colId);
    if (!col || !col.hideable) return true;
    return visibleColumns[colId] ?? col.defaultVisible;
  }, [visibleColumns]);

  const getProjectById = (projectId: number | string | null | undefined) => {
    if (projectId === null || projectId === undefined) return null;
    return projects.find(p => String(p.id) === String(projectId) || String(p.uid) === String(projectId)) || null;
  };

  const getProjectName = (d: Diagram): string => {
    return d.projects?.name || getProjectById(d.project_id)?.name || '—';
  };

  const getProjectUid = (d: Diagram): string | null => {
    return d.projects?.uid || getProjectById(d.project_id)?.uid || null;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      return new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(dateStr));
    } catch {
      return dateStr.slice(0, 10);
    }
  };

  const formatDateOnly = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      return new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'long',
      }).format(new Date(dateStr));
    } catch {
      return dateStr.slice(0, 10);
    }
  };

  const isExpired = (dateStr?: string) => {
    if (!dateStr) return false;
    try {
      return new Date(dateStr) < new Date();
    } catch {
      return false;
    }
  };

  const visibleCols = DEFAULT_COLUMNS.filter(c => c.id === 'name' || c.id === 'workspace' || c.id === 'actions' || isColVisible(c.id));

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground/60 animate-pulse">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-hidden pt-6">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Columns3 className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-semibold">ERD Builder</h2>
          {selectedWorkspace && (
            <>
              <span className="text-muted-foreground">/</span>
              <button
                onClick={() => onWorkspaceClick(null)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {projects.find(p => p.uid === selectedWorkspace)?.name || 'Workspace'}
              </button>
            </>
          )}
          <span className="text-xs text-muted-foreground ml-2">
            ({totalDiagrams} diagrams)
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Columns Toggle */}
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button variant="outline" size="sm">
                <Columns3 className="w-4 h-4 mr-1.5" />
                Columns
              </Button>
            } />
            <DropdownMenuContent align="end" className="w-44">
              {DEFAULT_COLUMNS.filter(c => c.hideable).map(col => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={isColVisible(col.id)}
                  onCheckedChange={() => toggleColumn(col.id)}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" onClick={onCreateDiagram}>
            <Plus className="w-4 h-4 mr-1.5" />
            Create Diagram
          </Button>
          {isDesktop && (
            <Button size="sm" variant="outline" onClick={() => setDbConnectOpen(true)}>
              <Cable className="w-4 h-4 mr-1.5" />
              DB Connect
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              {DEFAULT_COLUMNS.filter(c => visibleCols.some(v => v.id === c.id)).map(col => (
                <TableHead key={col.id} className={col.width}>
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {diagrams.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleCols.length} className="h-32 text-center text-muted-foreground">
                  {totalDiagrams === 0
                    ? 'No diagrams yet. Create your first ERD diagram to get started.'
                    : 'No diagrams on this page.'}
                </TableCell>
              </TableRow>
            ) : (
              diagrams.map(d => {
                const uid = d.uid ?? String(d.id);
                const currentProjectUid = getProjectUid(d);
                return (
                  <TableRow
                    key={uid}
                    className="cursor-pointer group"
                    onClick={() => onSelectDiagram(uid)}
                  >
                    {visibleCols.map(col => {
                      if (col.id === 'name') {
                        return (
                          <TableCell key="name" className="font-medium">
                            <span className="truncate block max-w-[280px]">
                              {d.name || 'Untitled'}
                            </span>
                          </TableCell>
                        );
                      }
                      if (col.id === 'workspace') {
                        return (
                          <TableCell key="workspace">
                            <span
                              className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full cursor-pointer hover:bg-accent transition-colors"
                              onClick={e => {
                                e.stopPropagation();
                                onWorkspaceClick(currentProjectUid);
                              }}
                            >
                              {getProjectName(d)}
                            </span>
                          </TableCell>
                        );
                      }
                      if (col.id === 'source') {
                        return (
                          <TableCell key="source" className="text-muted-foreground text-xs">
                            {(d.source_type && d.source_type !== 'scratch') ? (
                              <span className="inline-flex items-center gap-1 text-xs bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-full">
                                <Database className="w-3 h-3" />
                                {formatSourceType(d.source_type)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50">Scratch</span>
                            )}
                          </TableCell>
                        );
                      }
                      if (col.id === 'updated') {
                        return (
                          <TableCell key="updated" className="text-muted-foreground text-xs">
                            {formatDate(d.updated_at)}
                          </TableCell>
                        );
                      }
                      if (col.id === 'status') {
                        return (
                          <TableCell key="status">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${d.is_public ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'}`}>
                              {d.is_public ? 'Public' : 'Private'}
                            </span>
                          </TableCell>
                        );
                      }
                      if (col.id === 'created') {
                        return (
                          <TableCell key="created" className="text-muted-foreground text-xs">
                            {formatDate(d.created_at)}
                          </TableCell>
                        );
                      }
                      if (col.id === 'expires') {
                        return (
                          <TableCell key="expires" className={`text-muted-foreground text-xs ${isExpired(d.expiry_date) ? 'text-red-500 font-medium' : ''}`}>
                            {formatDateOnly(d.expiry_date)}
                          </TableCell>
                        );
                      }
                      if (col.id === 'actions') {
                        return (
                          <TableCell key="actions" className="text-right" onClick={e => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger render={
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              } />
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem onClick={() => onOpenEditDocument(uid)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit Document
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => onDeleteDiagram(uid)} className="text-destructive focus:text-destructive">
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        );
                      }
                      return null;
                    })}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-x border-b bg-background px-4 py-2 shrink-0 rounded-b-xl">
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-xs"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
              .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - arr[idx - 1] > 1) acc.push('ellipsis');
                acc.push(p);
                return acc;
              }, [])
              .map((item) =>
                item === 'ellipsis' ? (
                  <span key={`e-${item}`} className="px-1 text-xs text-muted-foreground">
                    ...
                  </span>
                ) : (
                  <Button
                    key={item}
                    variant={item === page ? 'default' : 'outline'}
                    size="icon-xs"
                    onClick={() => onPageChange(item as number)}
                    className={item === page ? '' : 'text-muted-foreground'}
                  >
                    {item}
                  </Button>
                )
              )}
            <Button
              variant="outline"
              size="icon-xs"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <DBConnectPanel
        open={dbConnectOpen}
        onOpenChange={setDbConnectOpen}
        onImportComplete={(uid) => onSelectDiagram(uid)}
      />
    </div>
  );
});
