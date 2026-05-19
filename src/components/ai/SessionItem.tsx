import { MessageSquare, Trash2 } from 'lucide-react';
import { AIChatSession } from '@/types';

export function SessionItem({
  session,
  isActive,
  onClick,
  onDelete,
}: {
  session: AIChatSession;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
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
