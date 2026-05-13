import React from 'react';
import { Flowchart, Project } from '@/types';
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
import { Plus, Network, MoreHorizontal, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

interface FlowchartTableViewProps {
  flowcharts: Flowchart[];
  projects: Project[];
  selectedWorkspace: string | null;
  page: number;
  totalFlowcharts: number;
  isLoading: boolean;
  onSelectFlowchart: (uid: string) => void;
  onCreateFlowchart: () => void;
  onPageChange: (page: number) => void;
  onWorkspaceClick: (projectUid: string | null) => void;
  onOpenEditDocument: (uid: string) => void;
  onDeleteFlowchart: (uid: string) => void;
}

const ITEMS_PER_PAGE = 10;

export const FlowchartTableView = React.memo(function FlowchartTableView({
  flowcharts,
  projects,
  selectedWorkspace,
  page,
  totalFlowcharts,
  isLoading,
  onSelectFlowchart,
  onCreateFlowchart,
  onPageChange,
  onWorkspaceClick,
  onOpenEditDocument,
  onDeleteFlowchart,
}: FlowchartTableViewProps) {
  const totalPages = Math.max(1, Math.ceil(totalFlowcharts / ITEMS_PER_PAGE));

  const getProjectById = (projectId: number | string | null | undefined) => {
    if (projectId === null || projectId === undefined) return null;
    return projects.find(p => String(p.id) === String(projectId) || String(p.uid) === String(projectId)) || null;
  };

  const getProjectName = (flowchart: Flowchart): string => {
    return flowchart.projects?.name || getProjectById(flowchart.project_id)?.name || '—';
  };

  const getProjectUid = (flowchart: Flowchart): string | null => {
    return flowchart.projects?.uid || getProjectById(flowchart.project_id)?.uid || null;
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
    <div className="flex-1 flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-semibold">Flowcharts</h2>
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
            ({totalFlowcharts} flowcharts)
          </span>
        </div>
        <Button size="sm" onClick={onCreateFlowchart}>
          <Plus className="w-4 h-4 mr-1.5" />
          Create Flowchart
        </Button>
      </div>

      <div className="overflow-auto rounded-t-xl border border-b-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[28%]">Name</TableHead>
              <TableHead className="w-[18%]">Workspace</TableHead>
              <TableHead className="w-[13%]">Updated</TableHead>
              <TableHead className="w-[8%]">Status</TableHead>
              <TableHead className="w-[12%]">Created</TableHead>
              <TableHead className="w-[13%]">Expires</TableHead>
              <TableHead className="w-[8%] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flowcharts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  {totalFlowcharts === 0
                    ? 'No flowcharts yet. Create your first flowchart to get started.'
                    : 'No flowcharts on this page.'}
                </TableCell>
              </TableRow>
            ) : (
              flowcharts.map(flowchart => {
                const uid = flowchart.uid ?? String(flowchart.id);
                const currentProjectUid = getProjectUid(flowchart);
                return (
                  <TableRow
                    key={uid}
                    className="cursor-pointer group"
                    onClick={() => onSelectFlowchart(uid)}
                  >
                    <TableCell className="font-medium">
                      <span className="truncate block max-w-[280px]">
                        {flowchart.title || 'Untitled'}
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
                        {getProjectName(flowchart)}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDate(flowchart.updated_at)}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${flowchart.is_public ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'}`}>
                        {flowchart.is_public ? 'Public' : 'Private'}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDate(flowchart.created_at)}
                    </TableCell>
                    <TableCell className={`text-muted-foreground text-xs ${isExpired(flowchart.expiry_date) ? 'text-red-500 font-medium' : ''}`}>
                      {formatDateOnly(flowchart.expiry_date)}
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
                          <DropdownMenuItem onClick={() => onDeleteFlowchart(uid)} className="text-destructive">
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
