import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight, ChevronLeft, ChevronRight, Columns3, DatabaseZap, FolderClosed, FolderOpen,
  Lock, MoreHorizontal, Pencil, Plus, Search, Trash2,
} from 'lucide-react';

import { DBConnectPanel } from '@/components/db-connect/DBConnectPanel';
import { MoveToTrashAlert } from '@/components/modals/MoveToTrashAlert';
import { RenameDocumentDialog } from '@/components/modals/RenameDocumentDialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/useAuth';
import { useColumnVisibility, type ColumnDef } from '@/hooks/useColumnVisibility';
import { useDbClients } from '@/hooks/useDbClients';
import { useProjectFilePage, type ProjectFileRow } from '@/hooks/useProjectFilePage';
import { apiFetch, isInstalledApp } from '@/lib/api';
import { FILE_TYPES, UNASSIGNED_PROJECT, openCloudPricing, type FileTypeKey } from '@/lib/file-types';
import { isFileCreator } from '@/lib/fileOwnership';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/providers/WorkspaceProvider';

const PAGE_SIZES = [10, 20, 50, 100];

const FILE_ROUTES: Record<FileTypeKey, string> = {
  notes: '/notes',
  erd: '/diagrams',
  flowchart: '/flowcharts',
  'db-client': '/db-client',
  drawings: '/drawings',
};

const COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Name', defaultVisible: true, hideable: false, width: 'w-[26%]' },
  { id: 'type', label: 'Type', defaultVisible: true, hideable: true, width: 'w-[12%]' },
  { id: 'workspace', label: 'Workspace', defaultVisible: true, hideable: true, width: 'w-[14%]' },
  { id: 'creator', label: 'Creator', defaultVisible: true, hideable: true, width: 'w-[12%]' },
  { id: 'updated', label: 'Updated', defaultVisible: false, hideable: true, width: 'w-[13%]' },
  { id: 'status', label: 'Status', defaultVisible: true, hideable: true, width: 'w-[8%]' },
  { id: 'created', label: 'Created', defaultVisible: true, hideable: true, width: 'w-[13%]' },
  { id: 'expires', label: 'Expires', defaultVisible: false, hideable: true, width: 'w-[12%]' },
  { id: 'actions', label: 'Actions', defaultVisible: true, hideable: false, width: 'w-[6%]' },
];

function formatDate(value?: string, dateOnly = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', dateOnly ? { dateStyle: 'long' } : { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** A Project's files: one table, one URL, type tabs with counts and server pagination (COL-008). */
export function ProjectFilesRoute() {
  const { projectKey = '' } = useParams<{ projectKey: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isGuest } = useAuth();
  const {
    projects, isProjectsLoading, handleOpenCreateDocument, setBreadcrumbLabel,
    updateNote, updateDiagram, updateDrawing, updateFlowchart,
    moveNoteToProject, moveDiagramToProject, moveDrawingToProject, moveFlowchartToProject,
    deleteNote, deleteDiagram, deleteDrawing, deleteFlowchart, fetchTrash,
  } = useWorkspace();
  const { deleteDbClient } = useDbClients();
  const { toggle, visibleCols } = useColumnVisibility('project-files-column-visibility', COLUMNS);
  const cols = visibleCols();

  const isUnassigned = projectKey === UNASSIGNED_PROJECT;
  const project = isUnassigned ? null : projects.find((item: any) => item.uid === projectKey || String(item.id) === projectKey) ?? null;
  const projectId = isUnassigned ? 'null' : project ? String(project.id) : null;
  const types = FILE_TYPES.filter((type) => type.value !== 'db-client' || isInstalledApp());
  const typeParam = searchParams.get('type');
  const type = types.some((item) => item.value === typeParam) ? typeParam as FileTypeKey : 'all';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const perPage = PAGE_SIZES.includes(Number(searchParams.get('per_page'))) ? Number(searchParams.get('per_page')) : 10;
  const q = searchParams.get('q') ?? '';

  const [search, setSearch] = useState(q);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState<ProjectFileRow | null>(null);
  const [newName, setNewName] = useState('');
  const [renameProjectId, setRenameProjectId] = useState('none');
  const [deleting, setDeleting] = useState<ProjectFileRow | null>(null);
  const [isDbPanelOpen, setIsDbPanelOpen] = useState(false);
  const reload = () => setRefreshKey((key) => key + 1);

  const { data, total, counts, locked, isLoading } = useProjectFilePage({ projectId, type, page, perPage, q }, refreshKey);
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const updateParams = (changes: Record<string, string | null>) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) next.delete(key); else next.set(key, value);
      }
      return next;
    }, { replace: true });
  };

  useEffect(() => { setSearch(q); }, [projectKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Browser tab title: "<project name> | ERD Builder Pro".
  const projectTitle = isUnassigned ? 'Unassigned' : project?.name ?? null;
  useEffect(() => {
    setBreadcrumbLabel(projectTitle);
    return () => setBreadcrumbLabel(null);
  }, [projectTitle, setBreadcrumbLabel]);
  useEffect(() => {
    if (search === q) return;
    const timer = window.setTimeout(() => updateParams({ q: search.trim() || null, page: null }), 300);
    return () => window.clearTimeout(timer);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isUnassigned && !project) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        {isProjectsLoading ? 'Loading project…' : 'Project not found.'}
      </div>
    );
  }

  const allTotal = types.reduce((sum, item) => sum + counts[item.value], 0);
  const tabs = [
    { value: 'all', label: 'All', count: allTotal, icon: null, isLocked: false },
    ...types.map((item) => ({ value: item.value, label: item.label, count: counts[item.value], icon: item.icon, isLocked: locked.includes(item.value) })),
  ];
  const isTypeLocked = type !== 'all' && locked.includes(type);
  const createType: FileTypeKey = type !== 'all' ? type : 'notes';
  const ProjectIcon = isUnassigned ? FolderOpen : FolderClosed;
  const ssoPortalUrl = user?.isSso ? (user.ssoPortalUrl ?? user.sso_portal_url) : null;

  const openFile = (row: ProjectFileRow) => navigate(`${FILE_ROUTES[row.type]}/${row.uid ?? row.id}`);
  const startEdit = (row: ProjectFileRow) => {
    setEditing(row);
    setNewName(row.title || row.name || '');
  };
  const renameDbClient = async (uid: string, name: string) => {
    const response = await apiFetch(`/api/db-clients/${encodeURIComponent(uid)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error('Failed to rename DB Client');
    reload();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <ProjectIcon className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{isUnassigned ? 'Unassigned' : project?.name}</h1>
            <p className="text-xs text-muted-foreground">
              {isUnassigned ? 'Files without a project. Edit a file to move it into a project.' : `${allTotal} ${allTotal === 1 ? 'file' : 'files'}`}
            </p>
          </div>
        </div>
        {!isUnassigned && (
          <Button size="sm" onClick={() => handleOpenCreateDocument(createType)}>
            <Plus className="size-4" aria-hidden="true" />
            New file
          </Button>
        )}
      </div>

      <div role="tablist" aria-label="File types" className="flex shrink-0 gap-1 overflow-x-auto border-b">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = type === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => updateParams({ type: tab.value === 'all' ? null : tab.value, page: null })}
              className={cn(
                '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground',
                isActive && 'border-primary font-medium text-foreground',
              )}
            >
              {Icon && <Icon className="size-4" aria-hidden="true" />}
              {tab.label}
              {tab.isLocked
                ? <Lock className="size-3.5" aria-label="Not in your plan" />
                : <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{tab.count}</span>}
            </button>
          );
        })}
      </div>

      {isTypeLocked ? (
        <section className="max-w-md rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
          <p className="font-medium">{types.find((item) => item.value === type)?.label} needs a paid Cloud plan</p>
          <p className="mt-1 text-muted-foreground">Files of this type stay saved and come back after an upgrade.</p>
          {ssoPortalUrl && (
            <Button size="sm" className="mt-3" onClick={() => openCloudPricing(ssoPortalUrl)}>
              View Cloud plans
              <ArrowUpRight className="size-4" />
            </Button>
          )}
        </section>
      ) : (
        <>
          <div className="flex shrink-0 items-center justify-between gap-2">
            <div className="relative w-full max-w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                aria-label="Search files"
                placeholder="Search files..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              {isInstalledApp() && (
                <Button variant="outline" size="sm" onClick={() => setIsDbPanelOpen(true)}>
                  <DatabaseZap className="size-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Database connections</span>
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger render={
                  <Button variant="outline" size="icon-sm" aria-label="Columns" title="Columns">
                    <Columns3 className="size-4" />
                  </Button>
                } />
                <DropdownMenuContent align="end" className="w-44">
                  {COLUMNS.filter((col) => col.hideable).map((col) => (
                    <DropdownMenuCheckboxItem key={col.id} checked={cols.some((item) => item.id === col.id)} onCheckedChange={() => toggle(col.id)}>
                      {col.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border">
            <div className="min-h-0 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {cols.map((col) => <TableHead key={col.id} className={col.width}>{col.label}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={cols.length} className="h-32 text-center text-muted-foreground">
                        {isLoading ? 'Loading…' : q ? 'No files match your search.' : 'No files here yet.'}
                      </TableCell>
                    </TableRow>
                  ) : data.map((row) => {
                    const fileType = FILE_TYPES.find((item) => item.value === row.type)!;
                    const TypeIcon = fileType.icon;
                    const canDelete = row.type === 'db-client' || isFileCreator(row, user?.id, isGuest);
                    return (
                      <TableRow key={`${row.type}:${row.uid ?? row.id}`} className="group cursor-pointer" onClick={() => openFile(row)}>
                        {cols.map((col) => {
                          switch (col.id) {
                            case 'name':
                              return <TableCell key="name" className="font-medium"><span className="block max-w-70 truncate">{row.title || row.name || 'Untitled'}</span></TableCell>;
                            case 'type':
                              return (
                                <TableCell key="type">
                                  <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                                    <TypeIcon className="size-4" aria-hidden="true" />
                                    {fileType.label}
                                  </span>
                                </TableCell>
                              );
                            case 'workspace':
                              return (
                                <TableCell key="workspace">
                                  <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs">{row.project?.name || 'Unassigned'}</span>
                                </TableCell>
                              );
                            case 'creator':
                              return (
                                <TableCell key="creator" className="text-xs text-muted-foreground">
                                  {row.user?.name || row.user?.email || (row.type === 'db-client' ? user?.name || user?.email : null) || '—'}
                                </TableCell>
                              );
                            case 'updated':
                              return <TableCell key="updated" className="text-xs text-muted-foreground">{formatDate(row.updated_at)}</TableCell>;
                            case 'status':
                              return (
                                <TableCell key="status">
                                  <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs', row.is_public ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground')}>
                                    {row.is_public ? 'Public' : 'Private'}
                                  </span>
                                </TableCell>
                              );
                            case 'created':
                              return <TableCell key="created" className="text-xs text-muted-foreground">{formatDate(row.created_at)}</TableCell>;
                            case 'expires': {
                              const isExpired = row.expiry_date && new Date(row.expiry_date) < new Date();
                              return <TableCell key="expires" className={cn('text-xs text-muted-foreground', isExpired && 'font-medium text-red-500')}>{formatDate(row.expiry_date, true)}</TableCell>;
                            }
                            case 'actions':
                              return (
                                <TableCell key="actions" className="text-right" onClick={(event) => event.stopPropagation()}>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger render={
                                      <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${row.title || row.name || 'file'}`}>
                                        <MoreHorizontal className="size-4" />
                                      </Button>
                                    } />
                                    <DropdownMenuContent align="end" className="w-44">
                                      <DropdownMenuItem onClick={() => startEdit(row)}>
                                        <Pencil className="mr-2 size-4" />
                                        Edit
                                      </DropdownMenuItem>
                                      {canDelete && (
                                        <>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem onClick={() => setDeleting(row)} className="text-destructive">
                                            <Trash2 className="mr-2 size-4" />
                                            Delete
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              );
                            default:
                              return null;
                          }
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span id="rows-per-page-label">Rows per page</span>
                <Select value={String(perPage)} onValueChange={(value) => value && updateParams({ per_page: value === '10' ? null : value, page: null })}>
                  <SelectTrigger size="sm" aria-labelledby="rows-per-page-label" className="h-7 w-18">
                    <SelectValue>{perPage}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span>Page {Math.min(page, totalPages)} of {totalPages}</span>
                <Button variant="outline" size="icon-xs" aria-label="Previous page" disabled={page <= 1} onClick={() => updateParams({ page: page - 1 > 1 ? String(page - 1) : null })}>
                  <ChevronLeft className="size-4" />
                </Button>
                <Button variant="outline" size="icon-xs" aria-label="Next page" disabled={page >= totalPages} onClick={() => updateParams({ page: String(page + 1) })}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      <RenameDocumentDialog
        isOpen={editing !== null}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        view={editing?.type ?? 'notes'}
        activeDocument={editing}
        canMoveProject={editing ? isFileCreator(editing, user?.id, isGuest) : false}
        newName={newName}
        setNewName={setNewName}
        projects={projects}
        requireProject
        selectedProjectId={renameProjectId}
        setSelectedProjectId={setRenameProjectId}
        updateDiagram={updateDiagram}
        updateNote={updateNote}
        updateDrawing={updateDrawing}
        updateFlowchart={updateFlowchart}
        updateDbClient={renameDbClient}
        onMoveDiagramToProject={moveDiagramToProject}
        onMoveNoteToProject={moveNoteToProject}
        onMoveDrawingToProject={moveDrawingToProject}
        onMoveFlowchartToProject={moveFlowchartToProject}
        onRenameSuccess={async () => reload()}
      />

      <MoveToTrashAlert
        isOpen={deleting !== null}
        onOpenChange={(open) => { if (!open) setDeleting(null); }}
        activeDocument={deleting}
        view={deleting?.type}
        deleteDiagram={deleteDiagram}
        deleteNote={deleteNote}
        deleteDrawing={deleteDrawing}
        deleteFlowchart={deleteFlowchart}
        fetchTrash={fetchTrash}
        onConfirm={deleting?.type === 'db-client' ? () => {
          const uid = deleting.uid ?? deleting.id;
          void deleteDbClient(String(uid)).then(() => { setDeleting(null); reload(); });
        } : undefined}
        onAfterDelete={() => { setDeleting(null); reload(); }}
      />

      {isInstalledApp() && (
        <DBConnectPanel
          open={isDbPanelOpen}
          onOpenChange={setIsDbPanelOpen}
          projects={projects}
          defaultProjectId={project ? String(project.id) : null}
          onImportComplete={(uid) => navigate(`/db-client/${uid}`)}
        />
      )}
    </div>
  );
}

const LEGACY_TYPES: Record<string, FileTypeKey> = {
  notes: 'notes', erd: 'erd', flowchart: 'flowchart', flowcharts: 'flowchart', drawings: 'drawings', 'db-client': 'db-client',
};

/** Old per-feature URLs (`/table/:feature`) open the Project page, or the Dashboard when no Project was given. */
export function LegacyTableRedirect() {
  const { feature = '' } = useParams<{ feature: string }>();
  const [params] = useSearchParams();
  const workspace = params.get('workspace');
  if (!workspace) return <Navigate to="/" replace />;
  const next = new URLSearchParams();
  if (LEGACY_TYPES[feature]) next.set('type', LEGACY_TYPES[feature]);
  return <Navigate to={`/projects/${encodeURIComponent(workspace)}${next.size ? `?${next}` : ''}`} replace />;
}
