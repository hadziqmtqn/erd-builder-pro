import { MessageSquare, Trash2 } from 'lucide-react';
import { AIChatSession } from '@/types';

function relativeTime(dateStr?: string): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

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
  const time = relativeTime(session.updated_at || session.created_at);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      className={`group relative w-full text-left px-3 py-3 rounded-xl transition-colors duration-150 cursor-pointer
        ${isActive
          ? 'bg-primary/5 border-primary/20 border'
          : 'hover:bg-muted/40 border border-transparent'
        }
      `}
    >
      <div className="flex items-start gap-3">
        {/* Avatar / icon */}
        <div className={`shrink-0 size-8 rounded-lg flex items-center justify-center mt-0.5 transition-colors
          ${isActive
            ? 'bg-primary/15 text-primary'
            : 'bg-muted text-muted-foreground group-hover:bg-muted/80'
          }`}
        >
          <MessageSquare className="size-3.5" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className={`text-sm font-medium truncate transition-colors
              ${isActive ? 'text-foreground' : 'text-foreground/80'}
            `}>
              {session.title || 'New Conversation'}
            </span>
            {time && (
              <span className="shrink-0 text-[10px] text-muted-foreground/50 font-medium">
                {time}
              </span>
            )}
          </div>
          {/* Subtitle / preview */}
          <p className="text-[11px] text-muted-foreground/50 line-clamp-1 leading-relaxed">
            {session.title && session.title !== 'New Conversation'
              ? 'Tap to continue'
              : 'Start a new conversation'}
          </p>
        </div>

        {/* Delete button — visible on hover */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground/40 hover:text-destructive -mr-1"
          title="Delete session"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
