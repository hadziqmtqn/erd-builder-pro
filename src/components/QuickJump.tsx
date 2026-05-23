import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Search, FileText, Database, ArrowRight, Network, PenTool } from 'lucide-react';
import { useWorkspace } from '@/providers/WorkspaceContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Note, Diagram, Flowchart, Drawing } from '@/types';

interface FlatFile {
  uid: string;
  id: number | string;
  name: string;
  type: 'note' | 'diagram' | 'flowchart' | 'drawing';
}

const typeConfig = {
  note: { icon: FileText, label: 'Notes' },
  diagram: { icon: Database, label: 'ERD' },
  flowchart: { icon: Network, label: 'Flowchart' },
  drawing: { icon: PenTool, label: 'Drawing' },
} as const;

export function QuickJump() {
  const {
    view, notes, diagrams, flowcharts, drawings,
    activeDocument,
    handleNoteSelect, handleDiagramSelect,
    handleDrawingSelect, handleFlowchartSelect,
  } = useWorkspace();

  // Only show when viewing a document that belongs to a project
  const projectId = activeDocument?.project_id ?? null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const files = useMemo<{ label: string; items: FlatFile[] }[]>(() => {
    if (!projectId) return [];
    const groups: { label: string; items: FlatFile[] }[] = [];
    const pid = projectId;

    const noteItems: FlatFile[] = (notes ?? [])
      .filter((n: Note) => String(n.project_id) === String(pid))
      .map((n: Note) => ({
      uid: n.uid ?? String(n.id), id: n.id, name: n.title || 'Untitled', type: 'note' as const,
    }));
    if (noteItems.length) groups.push({ label: 'Notes', items: noteItems });

    const diagramItems: FlatFile[] = (diagrams ?? [])
      .filter((d: Diagram) => String(d.project_id) === String(pid))
      .map((d: Diagram) => ({
      uid: d.uid ?? String(d.id), id: d.id, name: d.name || 'Untitled', type: 'diagram' as const,
    }));
    if (diagramItems.length) groups.push({ label: 'ERD', items: diagramItems });

    const flowchartItems: FlatFile[] = (flowcharts ?? [])
      .filter((f: Flowchart) => String(f.project_id) === String(pid))
      .map((f: Flowchart) => ({
      uid: f.uid ?? String(f.id), id: f.id, name: f.title || 'Untitled', type: 'flowchart' as const,
    }));
    if (flowchartItems.length) groups.push({ label: 'Flowcharts', items: flowchartItems });

    const drawingItems: FlatFile[] = (drawings ?? [])
      .filter((d: Drawing) => String(d.project_id) === String(pid))
      .map((d: Drawing) => ({
      uid: d.uid ?? String(d.id), id: d.id, name: d.title || 'Untitled', type: 'drawing' as const,
    }));
    if (drawingItems.length) groups.push({ label: 'Drawings', items: drawingItems });

    return groups;
  }, [notes, diagrams, flowcharts, drawings, projectId]);

  const filtered = useMemo(() => {
    if (!query.trim()) return files;
    const q = query.toLowerCase();
    return files
      .map(group => ({
        ...group,
        items: group.items.filter(f => f.name.toLowerCase().includes(q)),
      }))
      .filter(g => g.items.length > 0);
  }, [files, query]);

  const flatFiltered = useMemo(
    () => filtered.flatMap(g => g.items),
    [filtered],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k' && !e.shiftKey) {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelect = useCallback((file: FlatFile) => {
    setOpen(false);
    setQuery('');
    switch (file.type) {
      case 'note': handleNoteSelect(file.uid); break;
      case 'diagram': handleDiagramSelect(file.id); break;
      case 'flowchart': handleFlowchartSelect(file.uid); break;
      case 'drawing': handleDrawingSelect(file.uid); break;
    }
  }, [handleNoteSelect, handleDiagramSelect, handleFlowchartSelect, handleDrawingSelect]);

  // Early return: no active project context
  if (!projectId) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, flatFiltered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && flatFiltered[activeIndex]) {
      e.preventDefault();
      handleSelect(flatFiltered[activeIndex]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            className="hidden md:flex items-center gap-2 h-8 px-3 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors text-xs min-w-[180px] max-w-[260px]"
          >
            <Search className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 text-left truncate">Quick jump to file...</span>
              <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-0.5 rounded border bg-background px-1 font-mono text-[9px] font-medium text-muted-foreground shrink-0">
                <span className="text-[10px]">⌘</span>K
              </kbd>
          </button>
        }
      />
      <PopoverContent
        align="center"
        sideOffset={8}
        className="w-[360px] p-0 bg-popover border border-border shadow-xl z-[10000]"
      >
        <div className="flex items-center gap-2 px-3 border-b border-border">
          <Search className="w-4 h-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search files..."
            className="h-10 border-0 bg-transparent px-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/50"
          />
        </div>
        <div className="max-h-[320px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No files found
            </div>
          ) : (
            filtered.map(group => {
              const Icon = typeConfig[group.items[0].type]?.icon ?? FileText;
              const colorClass = group.items[0].type === 'diagram' ? 'text-emerald-400' :
                group.items[0].type === 'flowchart' ? 'text-sky-400' :
                group.items[0].type === 'drawing' ? 'text-purple-400' : 'text-amber-400';

              return (
                <div key={group.label}>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <Icon className={`w-3 h-3 ${colorClass}`} />
                    {group.label}
                  </div>
                  {group.items.map((file, idx) => {
                    const globalIdx = filtered
                      .slice(0, filtered.indexOf(group))
                      .reduce((acc, g) => acc + g.items.length, 0) + idx;
                    const isActive = globalIdx === activeIndex;
                    return (
                      <button
                        key={`${file.type}-${file.uid}`}
                        onClick={() => handleSelect(file)}
                        onMouseEnter={() => setActiveIndex(globalIdx)}
                        className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors ${
                          isActive ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/50'
                        }`}
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${colorClass}`} />
                        <span className="flex-1 truncate">{file.name}</span>
                        <ArrowRight className={`w-3 h-3 shrink-0 transition-opacity ${
                          isActive ? 'opacity-60' : 'opacity-0'
                        }`} />
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
