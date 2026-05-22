import { MessageSquare, Trash2, FileText, Database, GitBranch, PenTool } from 'lucide-react';
import { AIChatSession } from '@/types';

const defaultMeta: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  note: { label: 'Note', icon: FileText },
  diagram: { label: 'ERD Builder', icon: Database },
  flowchart: { label: 'Flowchart', icon: GitBranch },
  drawing: { label: 'Drawing', icon: PenTool },
};

export function SessionItem({
  session,
  entityTypeMeta,
  isActive,
  onClick,
  onDelete,
}: {
  session: AIChatSession;
  entityTypeMeta?: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }>;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const meta = entityTypeMeta ?? defaultMeta;
  const typeInfo = session.entity_type ? meta[session.entity_type] : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      className={`
        w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150 group
        flex items-center justify-between gap-2
        ${isActive
          ? 'bg-primary/10 text-primary border border-primary/20'
          : 'hover:bg-muted/50 text-foreground/80 border border-transparent'
        }
      `}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <MessageSquare className="size-3.5 shrink-0 opacity-60" />
        {typeInfo && (
          <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground/70 border border-border/30 leading-none">
            <typeInfo.icon className="size-3" />
            {typeInfo.label}
          </span>
        )}
        <span className="text-xs font-medium truncate">{session.title}</span>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        title="Delete session"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}