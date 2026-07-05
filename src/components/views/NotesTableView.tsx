import React from 'react';
import { Note, Project } from '@/types';
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
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { Plus, FileText, MoreHorizontal, Pencil, Trash2, ChevronLeft, ChevronRight, Columns3 } from 'lucide-react';
import { useColumnVisibility, ColumnDef } from '@/hooks/useColumnVisibility';

interface NotesTableViewProps {
  notes: Note[];
  projects: Project[];
  selectedWorkspace: string | null;
  page: number;
  totalNotes: number;
  isLoading: boolean;
  onSelectNote: (uid: string) => void;
  onCreateNote: () => void;
  onPageChange: (page: number) => void;
  onWorkspaceClick: (projectUid: string | null) => void;
  onOpenEditDocument: (uid: string) => void;
  onDeleteNote: (uid: string) => void;
}

const ITEMS_PER_PAGE = 10;
const STORAGE_KEY = 'notes-table-column-visibility';

const COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Name', defaultVisible: true, hideable: false, width: 'w-[30%]' },
  { id: 'workspace', label: 'Workspace', defaultVisible: true, hideable: false, width: 'w-[20%]' },
  { id: 'updated', label: 'Updated', defaultVisible: false, hideable: true, width: 'w-[14%]' },
  { id: 'status', label: 'Status', defaultVisible: true, hideable: true, width: 'w-[8%]' },
  { id: 'created', label: 'Created', defaultVisible: true, hideable: true, width: 'w-[12%]' },
  { id: 'expires', label: 'Expires', defaultVisible: false, hideable: true, width: 'w-[14%]' },
  { id: 'actions', label: 'Actions', defaultVisible: true, hideable: false, width: 'w-[8%]' },
];

export const NotesTableView = React.memo(function NotesTableView({
  notes,
  projects,
  selectedWorkspace,
  page,
  totalNotes,
  isLoading,
  onSelectNote,
  onCreateNote,
  onPageChange,
  onWorkspaceClick,
  onOpenEditDocument,
  onDeleteNote,
}: NotesTableViewProps) {
  const totalPages = Math.max(1, Math.ceil(totalNotes / ITEMS_PER_PAGE));
  const { toggle, visibleCols } = useColumnVisibility(STORAGE_KEY, COLUMNS);
  const cols = visibleCols();

  const getProjectById = (projectId: number | string | null | undefined) => {
    if (projectId === null || projectId === undefined) return null;
    return projects.find(p => String(p.id) === String(projectId) || String(p.uid) === String(projectId)) || null;
  };

  const getProjectName = (note: Note): string => {
    return note.projects?.name || getProjectById(note.project_id)?.name || '—';
  };

  const getProjectUid = (note: Note): string | null => {
    return note.projects?.uid || getProjectById(note.project_id)?.uid || null;
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-yellow-400" />
          <h2 className="text-lg font-semibold">Notes</h2>
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
            ({totalNotes} notes)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button variant="outline" size="sm">
                <Columns3 className="w-4 h-4 mr-1.5" />
                Columns
              </Button>
            } />
            <DropdownMenuContent align="end" className="w-44">
              {COLUMNS.filter(c => c.hideable).map(col => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={cols.some(v => v.id === col.id)}
                  onCheckedChange={() => toggle(col.id)}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={onCreateNote}>
            <Plus className="w-4 h-4 mr-1.5" />
            Create Note
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              {cols.map(col => (
                <TableHead key={col.id} className={col.width}>{col.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {notes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={cols.length} className="h-32 text-center text-muted-foreground">
                  {totalNotes === 0
                    ? 'No notes yet. Create your first note to get started.'
                    : 'No notes on this page.'}
                </TableCell>
              </TableRow>
            ) : (
              notes.map(note => {
                const uid = note.uid ?? String(note.id);
                const currentProjectUid = getProjectUid(note);
                return (
                  <TableRow
                    key={uid}
                    className="cursor-pointer group"
                    onClick={() => onSelectNote(uid)}
                  >
                    {cols.map(col => {
                      if (col.id === 'name') {
                        return (
                          <TableCell key="name" className="font-medium">
                            <span className="truncate block max-w-70">{note.title || 'Untitled'}</span>
                          </TableCell>
                        );
                      }
                      if (col.id === 'workspace') {
                        return (
                          <TableCell key="workspace">
                            <span
                              className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full cursor-pointer hover:bg-accent transition-colors"
                              onClick={e => { e.stopPropagation(); onWorkspaceClick(currentProjectUid); }}
                            >
                              {getProjectName(note)}
                            </span>
                          </TableCell>
                        );
                      }
                      if (col.id === 'updated') {
                        return (
                          <TableCell key="updated" className="text-muted-foreground text-xs">
                            {formatDate(note.updated_at)}
                          </TableCell>
                        );
                      }
                      if (col.id === 'status') {
                        return (
                          <TableCell key="status">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${note.is_public ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'}`}>
                              {note.is_public ? 'Public' : 'Private'}
                            </span>
                          </TableCell>
                        );
                      }
                      if (col.id === 'created') {
                        return (
                          <TableCell key="created" className="text-muted-foreground text-xs">
                            {formatDate(note.created_at)}
                          </TableCell>
                        );
                      }
                      if (col.id === 'expires') {
                        return (
                          <TableCell key="expires" className={`text-muted-foreground text-xs ${isExpired(note.expiry_date) ? 'text-red-500 font-medium' : ''}`}>
                            {formatDateOnly(note.expiry_date)}
                          </TableCell>
                        );
                      }
                      if (col.id === 'actions') {
                        return (
                          <TableCell key="actions" className="text-right" onClick={e => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger render={
                                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              } />
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem onClick={() => onOpenEditDocument(uid)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit Document
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => onDeleteNote(uid)} className="text-destructive">
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
                  <span key={`e-${item}`} className="px-1 text-xs text-muted-foreground">...</span>
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
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});
