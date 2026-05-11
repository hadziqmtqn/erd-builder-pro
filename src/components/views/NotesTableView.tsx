import React, { useMemo } from 'react';
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
} from '@/components/ui/dropdown-menu';
import { Plus, FileText, ArrowLeft, ArrowRight, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

interface NotesTableViewProps {
  notes: Note[];
  projects: Project[];
  selectedWorkspace: string | null;
  page: number;
  isLoading: boolean;
  onSelectNote: (uid: string) => void;
  onCreateNote: () => void;
  onPageChange: (page: number) => void;
  onWorkspaceClick: (projectUid: string | null) => void;
  onOpenEditDocument: (uid: string) => void;
  onDeleteNote: (uid: string) => void;
}

const ITEMS_PER_PAGE = 15;

export const NotesTableView = React.memo(function NotesTableView({
  notes,
  projects,
  selectedWorkspace,
  page,
  isLoading,
  onSelectNote,
  onCreateNote,
  onPageChange,
  onWorkspaceClick,
  onOpenEditDocument,
  onDeleteNote,
}: NotesTableViewProps) {
  // Filter by workspace
  const filtered = useMemo(() => {
    if (!selectedWorkspace) return notes.filter(n => !n.is_deleted);
    return notes.filter(n => {
      if (n.is_deleted) return false;
      const p = projects.find(p => p.uid === selectedWorkspace);
      if (!p) return false;
      return String(n.project_id) === String(p.id);
    });
  }, [notes, selectedWorkspace, projects]);

  // Get project name helper
  const getProjectName = (note: Note): string => {
    if (note.projects?.name) return note.projects.name;
    if (note.project_id) {
      const p = projects.find(p => String(p.id) === String(note.project_id));
      return p?.name || '—';
    }
    return '—';
  };

  const getProjectUid = (note: Note): string | null => {
    if (note.projects?.uid) return note.projects.uid;
    if (note.project_id) {
      const p = projects.find(p => String(p.id) === String(note.project_id));
      return p?.uid || null;
    }
    return null;
  };

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

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

  const handleCreate = () => {
    onCreateNote();
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
    <div className="flex-1 flex flex-col gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
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
            ({filtered.length} notes)
          </span>
        </div>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="w-4 h-4 mr-1.5" />
          Create Note
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[35%]">Name</TableHead>
              <TableHead className="w-[22%]">Workspace</TableHead>
              <TableHead className="w-[18%]">Updated</TableHead>
              <TableHead className="w-[15%]">Created</TableHead>
              <TableHead className="w-[10%] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  {filtered.length === 0
                    ? 'No notes yet. Create your first note to get started.'
                    : 'No notes on this page.'}
                </TableCell>
              </TableRow>
            ) : (
              paginated.map(note => {
                const uid = note.uid ?? String(note.id);
                const currentProjectUid = getProjectUid(note);
                return (
                  <TableRow
                    key={uid}
                    className="cursor-pointer group"
                    onClick={() => onSelectNote(uid)}
                  >
                    <TableCell className="font-medium">
                      <span className="truncate block max-w-[280px]">
                        {note.title || 'Untitled'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full cursor-pointer hover:bg-accent transition-colors"
                        onClick={e => {
                          e.stopPropagation();
                          onWorkspaceClick(currentProjectUid);
                        }}
                      >
                        {getProjectName(note)}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDate(note.updated_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDate(note.created_at)}
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        }>
                          <span className="sr-only">Actions</span>
                        </DropdownMenuTrigger>
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
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between shrink-0">
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Next
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});
