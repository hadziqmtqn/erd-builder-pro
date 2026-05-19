import { Sparkles, X } from 'lucide-react';

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

  return (
    <div className="shrink-0 border-t bg-background px-4 py-3 text-[11px] text-primary/80">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 opacity-70">
          <Sparkles className="size-3" />
          <span className="font-semibold uppercase tracking-wider">Active Selection</span>
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
