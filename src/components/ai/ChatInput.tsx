import { memo, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Sparkles, Send, StopCircle, SquareTerminal, CircleHelp, Database, Lightbulb, StickyNote, LayoutPanelLeft, Wand2, FileText, Code, GitBranch, FileDown, File, AtSign, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { AIAction } from '@/components/ai/AIActions';
import { Button } from '@/components/ui/button';

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
  onClearAction: () => void;
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
  onClearAction,
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
  const mentionTriggerRef = useRef<HTMLButtonElement>(null);
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
    const mention = `[@${file.name}] `;
    ta.value = before + mention + after;
    const newPos = start + mention.length;
    ta.setSelectionRange(newPos, newPos);
    ta.focus();
    setMentionOpen(false);
    forceUpdate(n => n + 1);
  }, [mentionStart, inputRef, forceUpdate]);

  const openMentionPicker = useCallback(() => {
    if (mentionOpen) {
      setMentionOpen(false);
      return;
    }
    const ta = inputRef.current;
    if (!ta) return;
    setMentionStart(ta.selectionStart);
    setMentionQuery('');
    setMentionOpen(true);
    ta.focus();
  }, [inputRef, mentionOpen]);

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
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!mentionRef.current?.contains(target) && !mentionTriggerRef.current?.contains(target)) {
        setMentionOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
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
  const actionGroup = entityType === 'diagram'
    ? { primaryId: 'erd-generate-sql', primaryLabel: 'Build DBML', toolsLabel: 'ERD tools', heading: 'Focused ERD actions' }
    : entityType === 'flowchart'
      ? { primaryId: 'flowchart-generate', primaryLabel: 'Build Flowchart', toolsLabel: 'Flowchart tools', heading: 'Focused Flowchart actions' }
      : null;
  const primaryAction = actionGroup ? actions.find(action => action.id === actionGroup.primaryId) : undefined;
  const toolActions = actionGroup && primaryAction ? [primaryAction, ...actions.filter(action => action.id !== actionGroup.primaryId)] : actions;
  const activeAction = actions.find(action => action.id === activeActionId);

  if (!hasActiveSession) return null;

  return (
    <div className="shrink-0 border-t bg-background p-3">
      <div className="relative rounded-2xl border border-input bg-card p-2 shadow-sm transition-shadow focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
        <textarea
          ref={inputRef}
          defaultValue=""
          onInput={handleInput}
          onKeyDown={handleMentionKeyDown}
          placeholder={isStreaming ? 'AI is responding...' : getPlaceholder(activeActionId, hasProject)}
          className="block w-full min-h-18 max-h-44 resize-none bg-transparent px-2 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
          rows={3}
          disabled={isStreaming}
        />

        {/* Mention dropdown */}
        {mentionOpen && filtered.length > 0 && (
          <div
            ref={mentionRef}
            className="absolute z-100 w-60 rounded-lg border border-border bg-popover shadow-xl overflow-hidden"
            style={{
              bottom: '48px',
              left: '8px',
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

        <div className="mt-1 flex items-center gap-1">
          {mentionFiles.length > 0 && (
            <Button ref={mentionTriggerRef} variant="outline" size="icon-xs" onClick={openMentionPicker} title="Reference a file">
              <AtSign className="size-3.5" />
            </Button>
          )}
          {showActions && (
            <details
              ref={toolsRef}
              open={toolsOpen}
              onToggle={(event) => setToolsOpen(event.currentTarget.open)}
              className="group relative"
            >
              <summary className={`inline-flex list-none items-center gap-1.5 h-7 rounded-full border px-2.5 text-xs font-medium cursor-pointer [&::-webkit-details-marker]:hidden ${
                activeAction ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground hover:bg-muted'
              }`}>
                <SlidersHorizontal className="size-3.5" />
                <span className="max-w-28 truncate">{activeAction?.label || actionGroup?.toolsLabel || 'Tools'}</span>
                <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
              </summary>
              <div className="absolute bottom-8 left-0 z-50 w-64 rounded-xl border bg-popover p-1.5 shadow-lg">
                <p className="px-2 py-1 text-[10px] font-medium text-muted-foreground">{actionGroup?.heading || 'AI actions'}</p>
                <button
                  onClick={() => {
                    onClearAction();
                    setToolsOpen(false);
                  }}
                  className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left cursor-pointer hover:bg-accent ${!activeAction ? 'bg-accent' : ''}`}
                >
                  <SlidersHorizontal className="mt-0.5 size-3 text-muted-foreground" />
                  <span>
                    <span className="block text-xs font-medium">No tool</span>
                    <span className="block text-[10px] leading-relaxed text-muted-foreground">Use general chat without an action mode.</span>
                  </span>
                </button>
                {toolActions.map(action => (
                  <button
                    key={action.id}
                    onClick={() => {
                      onSelectAction(action);
                      setToolsOpen(false);
                    }}
                    className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left cursor-pointer hover:bg-accent ${activeActionId === action.id ? 'bg-accent' : ''}`}
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
          )}
          <span className="ml-1 text-[10px] text-muted-foreground/50">{isStreaming ? 'Generating...' : 'Enter to send'}</span>
          <Button
            variant={isStreaming ? 'outline' : 'default'}
            size="icon"
            className="ml-auto size-8 rounded-full"
            onClick={isStreaming ? onAbort : onSend}
            title={isStreaming ? 'Stop generating' : 'Send message'}
          >
            {isStreaming ? <StopCircle className="size-3.5 text-destructive" /> : <Send className="size-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
});
