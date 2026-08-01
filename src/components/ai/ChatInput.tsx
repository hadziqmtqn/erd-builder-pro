import { memo, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Sparkles, Send, StopCircle, SquareTerminal, CircleHelp, Database, Lightbulb, StickyNote, LayoutPanelLeft, Wand2, FileText, Code, GitBranch, FileDown, File, ChevronDown, X } from 'lucide-react';
import { AIAction } from '@/components/ai/AIActions';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';

interface MentionFile {
  name: string;
  type: 'note' | 'diagram' | 'flowchart' | 'drawing';
  uid: string;
}

function getActionIcon(actionId: string) {
  switch (actionId) {
    case 'notes-summarize':
      return <StickyNote className="size-3" />;
    case 'notes-improve-grammar':
      return <Lightbulb className="size-3" />;
    case 'notes-generate-docs':
      return <LayoutPanelLeft className="size-3" />;
    case 'erd-generate-sql':
      return <Database className="size-3" />;
    case 'erd-edit-column':
      return <SquareTerminal className="size-3" />;
    case 'erd-explain-table':
      return <CircleHelp className="size-3" />;
    case 'erd-suggest-indexes':
      return <SquareTerminal className="size-3" />;
    case 'flowchart-generate':
      return <Wand2 className="size-3" />;
    case 'flowchart-explain':
      return <FileText className="size-3" />;
    case 'flowchart-pseudocode':
      return <Code className="size-3" />;
    case 'flowchart-insert':
      return <GitBranch className="size-3" />;
    case 'flowchart-import':
      return <FileDown className="size-3" />;
    default:
      return <Sparkles className="size-3" />;
  }
}

function getPlaceholder(actionId: string | null | undefined, hasProject: boolean): string {
  switch (actionId) {
    case 'notes-summarize':       return 'Describe what to summarize...';
    case 'notes-improve-grammar': return 'Describe which part to improve...';
    case 'notes-generate-docs':   return 'Describe what documentation to generate...';
    case 'erd-generate-sql':      return 'Describe the DBML schema to generate...';
    case 'erd-edit-column':       return 'Describe column changes...';
    case 'erd-explain-table':     return 'Ask about this table...';
    case 'erd-suggest-indexes':   return 'Describe indexing needs...';
    case 'erd-seed-data':         return 'Describe seed data...';
    case 'flowchart-generate':    return 'Describe the flowchart to create...';
    case 'flowchart-explain':     return 'Ask about this flow...';
    case 'flowchart-pseudocode':  return 'Describe pseudocode needs...';
    case 'flowchart-insert':      return 'Describe where to insert a symbol...';
    case 'flowchart-import':      return 'Describe the process to diagram...';
    default:                      return hasProject ? 'Ask anything... Type @ to reference a file' : 'Ask anything...';
  }
}

const MENTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  note: FileText,
  diagram: Database,
  flowchart: GitBranch,
  drawing: File,
};

export interface ChatInputProps {
  hasActiveSession: boolean;
  isStreaming: boolean;
  entityType?: string | null;
  actions: AIAction[];
  activeActionId?: string | null;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSelectAction: (action: AIAction) => void;
  onAbort: () => void;
  hasProject?: boolean;
  mentionFiles?: MentionFile[];
}

export const ChatInput = memo(function ChatInput({
  hasActiveSession,
  isStreaming,
  entityType,
  actions,
  activeActionId,
  inputRef,
  onSend,
  onKeyDown,
  onSelectAction,
  onAbort,
  hasProject = false,
  mentionFiles = [],
}: ChatInputProps) {
  // ── Hooks must be before any early return (Rules of Hooks) ──
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const [toolsOpen, setToolsOpen] = useState(false);
  const mentionRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDetailsElement>(null);
  const [, forceUpdate] = useState(0);

  const filtered = useMemo(() => {
    if (!mentionQuery.trim()) return mentionFiles;
    const q = mentionQuery.toLowerCase();
    return mentionFiles.filter(f => f.name.toLowerCase().includes(q));
  }, [mentionFiles, mentionQuery]);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery]);

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const pos = textarea.selectionStart;
    const text = textarea.value;

    let atPos = -1;
    for (let i = pos - 1; i >= 0; i--) {
      const ch = text[i];
      if (ch === '@') { atPos = i; break; }
      if (ch === ' ' || ch === '\n') break;
    }

    if (atPos >= 0) {
      const query = text.slice(atPos + 1, pos);
      setMentionQuery(query);
      setMentionStart(atPos);
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  }, []);

  const insertMention = useCallback((file: MentionFile) => {
    const ta = inputRef.current;
    if (!ta) return;
    const start = mentionStart;
    if (start < 0) return;
    const end = ta.selectionStart;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    const mention = `@${file.name} `;
    ta.value = before + mention + after;
    const newPos = start + mention.length;
    ta.setSelectionRange(newPos, newPos);
    ta.focus();
    setMentionOpen(false);
    forceUpdate(n => n + 1);
  }, [mentionStart, inputRef, forceUpdate]);

  const handleMentionKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (filtered[mentionIndex]) {
          e.preventDefault();
          insertMention(filtered[mentionIndex]);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
    }
    onKeyDown(e);
  }, [mentionOpen, filtered, mentionIndex, insertMention, onKeyDown]);

  useEffect(() => {
    if (!mentionOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (mentionRef.current && !mentionRef.current.contains(e.target as Node)) {
        if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
        setMentionOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [mentionOpen]);

  useEffect(() => {
    if (!toolsOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(event.target as Node)) setToolsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [toolsOpen]);

  const showActions = !isStreaming && actions.length > 0;
  const erdPrimaryAction = entityType === 'diagram' ? actions.find(action => action.id === 'erd-generate-sql') : undefined;
  const erdToolActions = entityType === 'diagram' ? actions.filter(action => action.id !== 'erd-generate-sql') : [];
  const activeAction = actions.find(action => action.id === activeActionId);

  if (!hasActiveSession) return null;

  return (
    <div className="shrink-0 border-t bg-background p-4 space-y-2.5">
      <div className="flex items-end gap-2 relative">
        <textarea
          ref={inputRef}
          defaultValue=""
          onInput={handleInput}
          onKeyDown={handleMentionKeyDown}
          placeholder={isStreaming ? 'AI is responding...' : getPlaceholder(activeActionId, hasProject)}
          className="flex-1 min-h-20 max-h-50 rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 resize-none"
          rows={3}
          disabled={isStreaming}
        />

        {/* Mention dropdown */}
        {mentionOpen && filtered.length > 0 && (
          <div
            ref={mentionRef}
            className="absolute z-100 w-60 rounded-lg border border-border bg-popover shadow-xl overflow-hidden"
            style={{
              bottom: 'calc(100% + 4px)',
              left: '0px',
            }}
          >
            <div className="max-h-45 overflow-y-auto py-1">
              {filtered.map((file, idx) => {
                const Icon = MENTION_ICONS[file.type] || FileText;
                const isActive = idx === mentionIndex;
                return (
                  <button
                    key={`${file.type}-${file.uid}`}
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); insertMention(file); }}
                    onMouseEnter={() => setMentionIndex(idx)}
                    className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors ${
                      isActive ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/50'
                    }`}
                  >
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{file.name}</span>
                    <span className="text-[9px] uppercase text-muted-foreground/50 font-medium shrink-0">{file.type}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <Button
          variant={isStreaming ? "outline" : "default"}
          size="icon"
          className="shrink-0 size-9 rounded-md"
          onClick={isStreaming ? onAbort : onSend}
        >
          {isStreaming ? <StopCircle className="size-4 text-destructive" /> : <Send className="size-4" />}
        </Button>
      </div>

      <div className="flex items-center justify-between min-h-7">
        {showActions ? (
          <div className="flex items-center gap-1 flex-wrap">
            {erdPrimaryAction ? (
              <>
                <button
                  onClick={() => onSelectAction(erdPrimaryAction)}
                  className={`inline-flex items-center gap-1 h-7 px-2 rounded-md text-[10px] font-medium border transition-all cursor-pointer ${
                    activeActionId === erdPrimaryAction.id
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-muted/40 border-border/40 text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted/70 hover:border-border/60'
                  }`}
                >
                  <Database className="size-3" />
                  Build DBML
                </button>
                <details
                  ref={toolsRef}
                  open={toolsOpen}
                  onToggle={(event) => setToolsOpen(event.currentTarget.open)}
                  className="group relative"
                >
                  <summary className="inline-flex list-none items-center gap-1 h-7 px-2 rounded-md text-[10px] font-medium border border-border bg-background text-muted-foreground hover:bg-muted cursor-pointer [&::-webkit-details-marker]:hidden">
                    ERD tools <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="absolute bottom-8 left-0 z-50 w-64 rounded-lg border bg-popover p-1.5 shadow-lg">
                    <p className="px-2 py-1 text-[10px] font-medium text-muted-foreground">Focused ERD actions</p>
                    {erdToolActions.map(action => (
                      <button
                        key={action.id}
                        onClick={() => {
                          onSelectAction(action);
                          setToolsOpen(false);
                        }}
                        className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left cursor-pointer hover:bg-accent ${activeActionId === action.id ? 'bg-accent' : ''}`}
                      >
                        <span className="mt-0.5 text-muted-foreground">{getActionIcon(action.id)}</span>
                        <span className="min-w-0">
                          <span className="block text-xs font-medium">{action.label}</span>
                          <span className="block text-[10px] leading-relaxed text-muted-foreground">{action.description}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </details>
                {activeAction && activeActionId !== erdPrimaryAction.id && (
                  <button
                    onClick={() => onSelectAction(activeAction)}
                    className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[10px] font-medium border border-primary/30 bg-primary/10 text-primary cursor-pointer"
                    title="Clear active ERD action"
                  >
                    {getActionIcon(activeAction.id)} {activeAction.label} <X className="size-3" />
                  </button>
                )}
              </>
            ) : actions.map((action) => {
              const isActive = activeActionId === action.id;
              return (
                <HoverCard key={action.id} openDelay={300} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    <button
                      onClick={() => onSelectAction(action)}
                      className={`inline-flex items-center gap-1 h-7 px-2 rounded-md text-[10px] font-medium border transition-all cursor-pointer ${
                        isActive
                          ? 'bg-primary/10 border-primary/30 text-primary'
                          : 'bg-muted/40 border-border/40 text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted/70 hover:border-border/60'
                      }`}
                    >
                      {getActionIcon(action.id)}
                      <span className="truncate max-w-20">{action.label}</span>
                    </button>
                  </HoverCardTrigger>
                  <HoverCardContent side="top" align="start" className="w-56 p-2.5">
                    <div className="flex items-start gap-2">
                      <div className="shrink-0 mt-0.5 size-6 rounded flex items-center justify-center bg-muted/30 text-muted-foreground">
                        {getActionIcon(action.id)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium">{action.label}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5 leading-relaxed">{action.description}</p>
                      </div>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              );
            })}
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground/50 px-1 font-medium">
            {isStreaming ? 'Generating...' : 'Press Enter to send'}
          </span>
        )}
      </div>
    </div>
  );
});
