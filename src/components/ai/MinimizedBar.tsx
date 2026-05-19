import { Sparkles } from 'lucide-react';

export function MinimizedBar({
  title,
  onExpand,
}: {
  title: string;
  onExpand: () => void;
}) {
  return (
    <div className="fixed right-6 bottom-4 z-50">
      <button
        onClick={onExpand}
        className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-border/50 bg-background/95 backdrop-blur-xl shadow-lg shadow-black/10 hover:bg-muted/50 transition-all cursor-pointer group"
      >
        <div className="p-1 rounded-md bg-primary/10">
          <Sparkles className="size-3.5 text-primary" />
        </div>
        <span className="text-xs font-medium text-foreground/80 truncate max-w-[160px]">
          {title}
        </span>
        <span className="text-[10px] text-muted-foreground/40 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
          Click to expand
        </span>
      </button>
    </div>
  );
}
