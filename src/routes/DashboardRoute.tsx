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
} from 'lucide-react';
import { useWorkspace } from '../providers/WorkspaceProvider';

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

  // Workspace with document counts from actual data arrays
  const projectsWithCounts = useMemo(() => {
    const countInProject = (items: any[], projectId: any) =>
      items.filter((d: any) => !d.is_deleted && String(d.project_id) === String(projectId)).length;

    const diagrams = ctx.diagrams || [];
    const notes = ctx.notes || [];
    const drawings = ctx.drawings || [];
    const flowcharts = ctx.flowcharts || [];

    return (ctx.projects || [])
      .filter((p: any) => !p.is_deleted)
      .map((p: any) => ({
        ...p,
        totalDocs:
          countInProject(diagrams, p.id) +
          countInProject(notes, p.id) +
          countInProject(drawings, p.id) +
          countInProject(flowcharts, p.id),
      }))
      .sort((a: any, b: any) => b.totalDocs - a.totalDocs)
      .slice(0, 4);
  }, [ctx.projects, ctx.diagrams, ctx.notes, ctx.drawings, ctx.flowcharts]);

  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const isLoading = ctx.isLoading || ctx.isProjectsLoading;

  // Once the first load cycle completes, lock it so no subsequent refetch
  // causes a loading flicker
  useEffect(() => {
    if (!isLoading) {
      setInitialLoadDone(true);
    }
  }, [isLoading]);

  if (!initialLoadDone && isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-y-auto p-6">
      {/* ── Title ── */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome to ERD Builder Pro
        </p>
      </div>

      {/* ── Stat Cards (using API totals) ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {typeConfig.map((cfg) => {
          const count = (ctx as any)[cfg.totalKey] ?? 0;
          return (
            <button
              key={cfg.key}
              onClick={() => navigate(cfg.route)}
              className="group flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-left hover:bg-accent/50 transition-colors"
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-md ${cfg.bg}`}
              >
                <cfg.icon className={`h-5 w-5 ${cfg.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs text-muted-foreground">{cfg.label}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Workspace ── */}
      {projectsWithCounts.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
              Workspace
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {projectsWithCounts.map((p: any) => (
              <div
                key={p.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                <p className="text-sm font-medium truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {p.totalDocs} documents
                </p>
              </div>
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
                const fn = (ctx as any)[cfg.createFn];
                if (fn) fn(`New ${cfg.label.slice(0, -1)}`);
              }}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-accent/50 transition-colors"
            >
              <cfg.icon className={`h-4 w-4 ${cfg.color}`} />
              <span>New {cfg.label.slice(0, -1)}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Recent Documents Table (bottom, 50% width) ── */}
      <section className="w-full md:w-1/2">
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Recently Edited
        </h2>
        {recentDocs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No documents yet. Create your first one!
          </p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left font-medium text-muted-foreground px-4 py-2 w-12">Type</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2">Name</th>
                  <th className="text-right font-medium text-muted-foreground px-4 py-2 w-28">Updated</th>
                </tr>
              </thead>
              <tbody>
                {recentDocs.map((doc: any) => (
                  <tr
                    key={`${doc._type}-${doc.id}`}
                    onClick={() => navigate(getDocRoute(doc._type, doc))}
                    className="border-b border-border last:border-0 hover:bg-accent/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      {getDocIcon(doc._type)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium truncate block max-w-[300px]">
                        {doc.name || doc.title || '(Untitled)'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
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
  );
}
