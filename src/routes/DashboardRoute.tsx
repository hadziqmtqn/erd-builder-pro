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
    const all = [
      ...(ctx.diagrams || []).map((d: any) => ({ ...d, _type: 'diagrams' as const })),
      ...(ctx.notes || []).map((n: any) => ({ ...n, _type: 'notes' as const })),
      ...(ctx.drawings || []).map((d: any) => ({ ...d, _type: 'drawings' as const })),
      ...(ctx.flowcharts || []).map((f: any) => ({ ...f, _type: 'flowcharts' as const })),
    ];
    return all
      .filter((d) => !d.is_deleted)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 10);
  }, [ctx.diagrams, ctx.notes, ctx.drawings, ctx.flowcharts]);

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

  const isEmpty = initialLoadDone && totalDocs === 0;

  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-y-auto p-6">
      {/* ── Greeting ── */}
      {userName && (
        <div>
          <p className="text-sm text-muted-foreground font-medium">{getGreeting()},</p>
          <h1 className="text-2xl font-semibold tracking-tight">{userName}</h1>
        </div>
      )}

      {/* ── Empty state ── */}
      {isEmpty && (
        <div className="flex flex-col items-center justify-center text-center py-16 px-6">
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
                onClick={() => {
                  const fn = (ctx as Record<string, any>)[cfg.createFn];
                  if (fn) fn(`New ${cfg.label.slice(0, -1)}`);
                }}
                className={`inline-flex items-center gap-2 rounded-lg border border-border/60 px-4 py-2.5 text-sm font-medium transition-all hover:shadow-sm ${cfg.bg} hover:scale-[1.02]`}
              >
                <cfg.icon className={`h-4 w-4 ${cfg.color}`} />
                New {cfg.label.slice(0, -1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isEmpty && (
        <>
          {/* ── Stat Cards ── */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {typeConfig.map((cfg) => {
              const count = (ctx as Record<string, any>)[cfg.totalKey] ?? 0;
              return (
                <button
                  key={cfg.key}
                  onClick={() => navigate(cfg.route)}
                  className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3.5 text-left hover:bg-accent/40 hover:border-border transition-all"
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${cfg.bg}`}>
                    <cfg.icon className={`h-5 w-5 ${cfg.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xl font-bold tabular-nums leading-tight">{count}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <p className="text-[11px] text-muted-foreground">{cfg.label}</p>
                      <span className="text-[10px] text-muted-foreground/30 group-hover:text-muted-foreground/50 group-hover:translate-x-0.5 transition-all opacity-0 group-hover:opacity-100">→</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Two-column layout: Workspace + Quick Actions | Recently Edited ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Workspace + Quick Actions */}
            <div className="space-y-6">
              {/* ── Workspace ── */}
              {projectsWithCounts.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <FolderKanban className="h-4 w-4 text-muted-foreground" />
                    Workspaces
                  </h2>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {projectsWithCounts.map((p: any) => (
                      <button
                        key={p.id}
                        onClick={() => (ctx as any).onViewChange?.('erd', true, p.uid ?? p.id)}
                        className="rounded-xl border border-border/60 bg-card p-3.5 text-left hover:bg-accent/40 hover:border-border transition-all"
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="size-5 rounded-md bg-primary/10 flex items-center justify-center">
                            <FolderKanban className="size-3 text-primary" />
                          </div>
                          <p className="text-xs font-medium truncate">{p.name}</p>
                        </div>
                        {p.totalDocs > 0 ? (
                          <div className="flex flex-wrap items-center gap-1">
                            {p.diagramsCount > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded">
                                <Database className="size-2.5" />{p.diagramsCount}
                              </span>
                            )}
                            {p.notesCount > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                <FileText className="size-2.5" />{p.notesCount}
                              </span>
                            )}
                            {p.flowchartsCount > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                <Network className="size-2.5" />{p.flowchartsCount}
                              </span>
                            )}
                            {p.drawingsCount > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-violet-500 bg-violet-500/10 px-1.5 py-0.5 rounded">
                                <PenTool className="size-2.5" />{p.drawingsCount}
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="text-[10px] text-muted-foreground/50">No documents yet</p>
                        )}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Quick Actions ── */}
              <section>
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Plus className="h-4 w-4 text-muted-foreground" />
                  Quick Actions
                </h2>
                <div className="flex flex-wrap gap-2">
                  {typeConfig.map((cfg) => (
                    <button
                      key={cfg.key}
                      onClick={() => {
                        const fn = (ctx as Record<string, any>)[cfg.createFn];
                        if (fn) fn(`New ${cfg.label.slice(0, -1)}`);
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-card px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/40 hover:border-border transition-all"
                    >
                      <cfg.icon className={`h-4 w-4 ${cfg.color}`} />
                      <span>New {cfg.label.slice(0, -1)}</span>
                    </button>
                  ))}
                </div>
              </section>
            </div>

            {/* Right: Recently Edited */}
            <section className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Recently Edited
              </h2>
              {recentDocs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No documents yet. Create your first one!
                </p>
              ) : (
                <div className="rounded-xl border border-border/60 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs w-8"></th>
                        <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Name</th>
                        <th className="text-right font-medium text-muted-foreground px-3 py-2 text-xs w-20">Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentDocs.map((doc: any) => (
                        <tr
                          key={`${doc._type}-${doc.id}`}
                          onClick={() => navigate(getDocRoute(doc._type, doc))}
                          className="border-b border-border/40 last:border-0 hover:bg-accent/30 cursor-pointer transition-colors"
                        >
                          <td className="px-3 py-2.5">
                            {getDocIcon(doc._type)}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-col">
                              <span className="text-xs font-medium truncate max-w-[200px]">
                                {doc.name || doc.title || '(Untitled)'}
                              </span>
                              <span className="text-[10px] text-muted-foreground/50">
                                {getDocLabel(doc._type)}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground text-[11px] whitespace-nowrap">
                            {formatTimeAgo(doc.updated_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
