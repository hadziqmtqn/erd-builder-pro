import { Sparkles, X } from 'lucide-react';

function extractTableCount(text: string): number | null {
  if (!text.startsWith('Tables:')) return null;
  return text.split('); ').length;
}

export function SelectionBar({
  hasActiveSession,
  selectionText,
  onClear,
}: {
  hasActiveSession: boolean;
  selectionText: string | null;
  onClear: () => void;
}) {
  if (!hasActiveSession || !selectionText) return null;

  const count = extractTableCount(selectionText);

  return (
    <div className="shrink-0 border-t bg-background px-4 py-3 text-[11px] text-primary/80">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 opacity-70">
          <Sparkles className="size-3" />
          <span className="font-semibold uppercase tracking-wider">Active Selection</span>
          {count !== null && (
            <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-[9px] font-bold text-primary">
              {count} {count === 1 ? 'table' : 'tables'}
            </span>
          )}
        </div>
        <button
          onClick={onClear}
          className="size-4 flex items-center justify-center rounded hover:bg-primary/10 text-muted-foreground hover:text-foreground transition-colors"
          title="Clear selection"
        >
          <X className="size-3" />
        </button>
      </div>
      <p className="italic line-clamp-2 text-primary/60">"{selectionText}"</p>
    </div>
  );
}
