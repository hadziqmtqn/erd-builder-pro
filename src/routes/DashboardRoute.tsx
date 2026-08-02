import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  FolderKanban,
  Plus,
  Clock,
  PenTool,
  Network,
  Database,
  Sparkles,
  Search,
  ArrowUpRight,
} from 'lucide-react';
import { useWorkspace } from '../providers/WorkspaceProvider';
import { apiFetch } from '../lib/api';

const typeConfig = [
  {
    key: 'notes',
    label: 'Notes',
    icon: FileText,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    route: '/table/notes',
    createFn: 'handleSidebarNoteCreate',
    totalKey: 'notesTotal' as const,
  },
  {
    key: 'diagrams',
    label: 'ERD Diagrams',
    icon: Database,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    route: '/table/erd',
    createFn: 'handleSidebarDiagramCreate',
    totalKey: 'diagramsTotal' as const,
  },
  {
    key: 'drawings',
    label: 'Drawings',
    icon: PenTool,
    color: 'text-violet-500',
    bg: 'bg-violet-500/10',
    route: '/table/drawings',
    createFn: 'handleSidebarDrawingCreate',
    totalKey: 'drawingsTotal' as const,
  },
  {
    key: 'flowcharts',
    label: 'Flowcharts',
    icon: Network,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    route: '/table/flowcharts',
    createFn: 'handleSidebarFlowchartCreate',
    totalKey: 'flowchartsTotal' as const,
  },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US');
}

function getDocIcon(type: string) {
  switch (type) {
    case 'diagrams':
      return <Database className="h-4 w-4 text-blue-500" />;
    case 'notes':
      return <FileText className="h-4 w-4 text-amber-500" />;
    case 'drawings':
      return <PenTool className="h-4 w-4 text-violet-500" />;
    case 'flowcharts':
      return <Network className="h-4 w-4 text-emerald-500" />;
    default:
      return null;
  }
}

function getDocLabel(type: string): string {
  switch (type) {
    case 'diagrams': return 'ERD';
    case 'notes': return 'Note';
    case 'drawings': return 'Drawing';
    case 'flowcharts': return 'Flowchart';
    default: return '';
  }
}

function getDocRoute(type: string, item: any) {
  const id = item.uid || item.id;
  switch (type) {
    case 'diagrams':
      return `/diagrams/${id}`;
    case 'notes':
      return `/notes/${id}`;
    case 'drawings':
      return `/drawings/${id}`;
    case 'flowcharts':
      return `/flowcharts/${id}`;
    default:
      return '/';
  }
}

export function DashboardRoute() {
  const navigate = useNavigate();
  const ctx = useWorkspace();

  const user = ctx.user;
  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || '';

  // 10 most recently edited items across all types
  const recentDocs = useMemo(() => {
    const projectMap = new Map(
      (ctx.projects || []).map((p: any) => [String(p.id), p.name])
    )
    const getWorkspace = (doc: any) => {
      const pid = doc.project_id ?? doc.projectId
      return pid ? (projectMap.get(String(pid)) || '—') : '—'
    }
    const all = [
      ...(ctx.diagrams || []).map((d: any) => ({ ...d, _type: 'diagrams' as const, _workspace: getWorkspace(d) })),
      ...(ctx.notes || []).map((n: any) => ({ ...n, _type: 'notes' as const, _workspace: getWorkspace(n) })),
      ...(ctx.drawings || []).map((d: any) => ({ ...d, _type: 'drawings' as const, _workspace: getWorkspace(d) })),
      ...(ctx.flowcharts || []).map((f: any) => ({ ...f, _type: 'flowcharts' as const, _workspace: getWorkspace(f) })),
    ]
    return all
      .filter((d) => !d.is_deleted)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 10);
  }, [ctx.diagrams, ctx.notes, ctx.drawings, ctx.flowcharts, ctx.projects]);

  const [recentQuery, setRecentQuery] = useState('');
  const [recentFilter, setRecentFilter] = useState('all');
  const filteredRecentDocs = useMemo(() => {
    const query = recentQuery.trim().toLowerCase();
    return recentDocs.filter((doc: any) => {
      const matchesType = recentFilter === 'all' || doc._type === recentFilter;
      const name = doc.name || doc.title || '';
      return matchesType && (!query || `${name} ${doc._workspace}`.toLowerCase().includes(query));
    });
  }, [recentDocs, recentFilter, recentQuery]);

  // All non-deleted docs count
  const totalDocs = useMemo(() => {
    return (ctx.diagrams || []).filter((d: any) => !d.is_deleted).length +
      (ctx.notes || []).filter((n: any) => !n.is_deleted).length +
      (ctx.drawings || []).filter((d: any) => !d.is_deleted).length +
      (ctx.flowcharts || []).filter((f: any) => !f.is_deleted).length;
  }, [ctx.diagrams, ctx.notes, ctx.drawings, ctx.flowcharts]);

  // Workspace document counts — fetched from backend (accurate, not paginated)
  const [projectSummaries, setProjectSummaries] = useState<Record<string, any>>({});

  const projectsWithCounts = useMemo(() => {
    return (ctx.projects || [])
      .filter((p: any) => !p.is_deleted)
      .map((p: any) => {
        const summary = projectSummaries[String(p.id)] || {};
        return {
          ...p,
          notesCount: summary.notes ?? 0,
          diagramsCount: summary.diagrams ?? 0,
          drawingsCount: summary.drawings ?? 0,
          flowchartsCount: summary.flowcharts ?? 0,
          totalDocs: (summary.notes ?? 0) + (summary.diagrams ?? 0) + (summary.drawings ?? 0) + (summary.flowcharts ?? 0),
        };
      })
      .sort((a: any, b: any) => b.totalDocs - a.totalDocs)
      .slice(0, 4);
  }, [ctx.projects, projectSummaries]);

  // Fetch summaries for visible projects
  useEffect(() => {
    const activeProjects = (ctx.projects || []).filter((p: any) => !p.is_deleted).slice(0, 4);
    if (activeProjects.length === 0) return;

    let cancelled = false;
    const fetchAll = async () => {
      const results: Record<string, any> = {};
      for (const p of activeProjects) {
        try {
          const res = await apiFetch(`/api/projects/${p.id}/summary`);
          if (res.ok && !cancelled) {
            results[String(p.id)] = await res.json();
          }
        } catch {
          // Silently fail — counts will default to 0
        }
      }
      if (!cancelled) setProjectSummaries(results);
    };
    fetchAll();
    return () => { cancelled = true; };
  }, [ctx.projects]);

  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const isLoading = ctx.isLoading || ctx.isProjectsLoading;

  useEffect(() => {
    if (!isLoading) {
      setInitialLoadDone(true);
    }
  }, [isLoading]);

  // Show empty state as soon as projects are loaded and empty —
  // don't wait for documents to finish loading
  const isEmpty = (!ctx.isProjectsLoading && (ctx.projects || []).filter((p: any) => !p.is_deleted).length === 0 && totalDocs === 0);

  // Show dashboard content as soon as we have projects or documents
  const showContent = !isEmpty && initialLoadDone;

  const createDocument = (cfg: typeof typeConfig[number]) => {
    const fn = (ctx as Record<string, any>)[cfg.createFn];
    if (fn) fn(`New ${cfg.label.slice(0, -1)}`);
  };

  const lastDocument = recentDocs[0];

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      {/* ── Greeting ── */}
      {userName && <div className="border-b border-border/60 px-5 py-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{getGreeting()},</p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight">{userName}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Pick up where you left off.</p>
          </div>
          <button
            onClick={() => createDocument(typeConfig[1])}
            className="hidden h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:inline-flex"
          >
            <Plus className="size-3.5" />
            New ERD Diagram
          </button>
        </div>
      </div>}

      {/* ── Empty state ── */}
      {isEmpty && (
          <div className="mx-auto flex max-w-2xl flex-col items-center justify-center px-6 py-20 text-center">
          <div className="size-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5">
            <Sparkles className="size-7 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Let's get started</h2>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-md">
            Create your first document — notes, ERD diagrams, flowcharts, or drawings —
            and start building your workspace.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-5">
            {typeConfig.map((cfg) => (
              <button
                key={cfg.key}
                onClick={() => createDocument(cfg)}
                className={`inline-flex items-center gap-2 rounded-lg border border-border/60 px-4 py-2.5 text-sm font-medium transition-all hover:shadow-sm ${cfg.bg} hover:scale-[1.02]`}
              >
                <cfg.icon className={`h-4 w-4 ${cfg.color}`} />
                New {cfg.label.slice(0, -1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {showContent && (
        <main className="flex w-full flex-col gap-5 px-5 py-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(250px,0.65fr)]">
            <section className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-4">
              <div className="relative z-10 flex h-full min-h-32 flex-col justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">Continue working</p>
                  {lastDocument ? (
                    <div className="mt-3 flex items-start gap-2.5">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background/80 shadow-sm">
                        {getDocIcon(lastDocument._type)}
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-semibold">{lastDocument.name || lastDocument.title || '(Untitled)'}</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {getDocLabel(lastDocument._type)} · {lastDocument._workspace} · {formatTimeAgo(lastDocument.updated_at)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <h2 className="mt-4 text-xl font-semibold">Create your first document</h2>
                  )}
                </div>
                <button
                  onClick={() => lastDocument ? navigate(getDocRoute(lastDocument._type, lastDocument)) : createDocument(typeConfig[1])}
                  className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {lastDocument ? 'Open document' : 'Create ERD diagram'}
                  <ArrowUpRight className="size-3.5" />
                </button>
              </div>
              <Sparkles className="absolute -bottom-8 -right-5 size-36 text-primary/10" />
            </section>

            <section className="rounded-xl border border-border/60 bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Create something new</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Start with the format you need.</p>
                </div>
                <Plus className="size-4 text-muted-foreground" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {typeConfig.map((cfg) => (
                  <button
                    key={cfg.key}
                    onClick={() => createDocument(cfg)}
                    className="group flex min-h-14 flex-col items-start justify-between rounded-lg border border-border/60 bg-background px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
                  >
                    <cfg.icon className={`size-4 ${cfg.color}`} />
                    <span className="text-xs font-medium">New {cfg.label.slice(0, -1)}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(250px,0.65fr)]">
            <section className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2.5">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <Clock className="size-4 text-muted-foreground" />
                    Recent files
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">Jump back into your latest work.</p>
                </div>
                <div className="relative w-full sm:w-52">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                  <input
                    value={recentQuery}
                    onChange={(event) => setRecentQuery(event.target.value)}
                    placeholder="Search files"
                    aria-label="Search recent files"
                    className="h-8 w-full rounded-lg border border-border/60 bg-card pl-8 pr-3 text-xs outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
                  />
                </div>
              </div>
              <div className="mb-2 flex items-center gap-1 overflow-x-auto pb-0.5">
                <button
                  onClick={() => setRecentFilter('all')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${recentFilter === 'all' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}
                >All</button>
                {typeConfig.map((cfg) => (
                  <button
                    key={cfg.key}
                    onClick={() => setRecentFilter(cfg.key)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${recentFilter === cfg.key ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}
                  >{cfg.label.replace(' Diagrams', '')}</button>
                ))}
              </div>
              <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
                {filteredRecentDocs.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-muted-foreground">No matching files.</p>
                ) : filteredRecentDocs.map((doc: any) => (
                  <button
                    key={`${doc._type}-${doc.id}`}
                    onClick={() => navigate(getDocRoute(doc._type, doc))}
                    className="group flex w-full items-center gap-2.5 border-b border-border/50 px-3 py-2.5 text-left last:border-0 hover:bg-accent/30"
                  >
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-background">
                      {getDocIcon(doc._type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{doc.name || doc.title || '(Untitled)'}</p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{getDocLabel(doc._type)} · {doc._workspace}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatTimeAgo(doc.updated_at)}</span>
                    <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-primary" />
                  </button>
                ))}
              </div>
            </section>

            {projectsWithCounts.length > 0 && (
              <section>
                <div className="mb-2">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <FolderKanban className="size-4 text-muted-foreground" />
                    Workspaces
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">Your projects at a glance.</p>
                </div>
                <div className="space-y-2">
                  {projectsWithCounts.map((p: any) => (
                    <button
                      key={p.id}
                      onClick={() => (ctx as any).onViewChange?.('erd', true, p.uid ?? p.id)}
                    className="group flex w-full items-center gap-2.5 rounded-lg border border-border/60 bg-card p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-accent/30"
                    >
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                        <FolderKanban className="size-3.5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{p.totalDocs} {p.totalDocs === 1 ? 'file' : 'files'}</p>
                      </div>
                      <ArrowUpRight className="size-4 text-muted-foreground/30 transition-colors group-hover:text-primary" />
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
