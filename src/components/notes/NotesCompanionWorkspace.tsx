import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Database, GitBranch, Maximize2, PenTool, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type CompanionPane = { type: 'erd' | 'flowchart' | 'drawing'; uid: string; title: string };

interface Props {
  panes: CompanionPane[];
  note: ReactNode;
  renderPane: (pane: CompanionPane) => ReactNode;
  onClose: (pane: CompanionPane) => void;
  onOpenFull: (pane: CompanionPane) => void;
}

export function NotesCompanionWorkspace({ panes, note, renderPane, onClose, onOpenFull }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [notePercent, setNotePercent] = useState(52);
  const draggingRef = useRef(false);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!draggingRef.current || !hostRef.current) return;
      const bounds = hostRef.current.getBoundingClientRect();
      const next = ((event.clientX - bounds.left) / bounds.width) * 100;
      setNotePercent(Math.max(34, Math.min(68, next)));
    };
    const end = () => { draggingRef.current = false; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); };
  }, []);

  const pane = panes[0];
  const Icon = pane?.type === 'erd' ? Database : pane?.type === 'flowchart' ? GitBranch : PenTool;
  return (
    <div ref={hostRef} className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
      <section
        className={`min-h-0 min-w-0 overflow-hidden ${pane ? '' : 'flex-1'}`}
        style={pane ? { width: `${notePercent}%` } : undefined}
      >
        {note}
      </section>
      {pane && <>
        <div
          className="group relative flex w-2 shrink-0 cursor-col-resize items-center justify-center bg-border/20 hover:bg-primary/10"
          onPointerDown={() => { draggingRef.current = true; }}
        >
          <span className="h-14 w-px bg-border group-hover:bg-primary" />
        </div>
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l bg-card">
          <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b bg-muted/20 px-3">
            <div className="flex min-w-0 items-center gap-2">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm font-semibold">{pane.title}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-xs" onClick={() => onOpenFull(pane)} title="Open full editor"><Maximize2 /></Button>
              <Button variant="ghost" size="icon-xs" onClick={() => onClose(pane)} title="Close preview"><X /></Button>
            </div>
          </header>
          <div className="min-h-0 flex-1">{renderPane(pane)}</div>
        </section>
      </>}
    </div>
  );
}
