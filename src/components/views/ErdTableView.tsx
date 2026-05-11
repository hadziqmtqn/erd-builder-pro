import React from 'react';
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
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Columns3, MoreHorizontal, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

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

  const getProjectName = (d: Diagram): string => {
    return d.projects?.name || '—';
  };

  const getProjectUid = (d: Diagram): string | null => {
    return d.projects?.uid || null;
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
        <Button size="sm" onClick={onCreateDiagram}>
          <Plus className="w-4 h-4 mr-1.5" />
          Create Diagram
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-t-xl border border-b-0">
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
            {diagrams.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
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
                    <TableCell className="font-medium">
                      <span className="truncate block max-w-[280px]">
                        {d.name || 'Untitled'}
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
                        {getProjectName(d)}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDate(d.updated_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDate(d.created_at)}
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
                          <DropdownMenuItem onClick={() => onDeleteDiagram(uid)} className="text-destructive">
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
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});
