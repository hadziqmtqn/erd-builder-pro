import { memo } from 'react';
import { Sparkles, Send, StopCircle, SquareTerminal, CircleHelp, Database, Lightbulb, StickyNote, LayoutPanelLeft, Wand2, FileText, Code, GitBranch, FileDown } from 'lucide-react';
import { AIAction } from '@/components/ai/AIActions';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';

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

function getPlaceholder(actionId: string | null | undefined): string {
  switch (actionId) {
    case 'notes-summarize':      return 'Describe what to summarize...';
    case 'notes-improve-grammar': return 'Describe which part to improve...';
    case 'notes-generate-docs':   return 'Describe what documentation to generate...';
    case 'erd-generate-sql':      return 'Describe the SQL to generate...';
    case 'erd-edit-column':       return 'Describe column changes...';
    case 'erd-explain-table':     return 'Ask about this table...';
    case 'erd-suggest-indexes':   return 'Describe indexing needs...';
    case 'erd-seed-data':         return 'Describe seed data...';
    case 'flowchart-generate':    return 'Describe the flowchart to create...';
    case 'flowchart-explain':     return 'Ask about this flow...';
    case 'flowchart-pseudocode':  return 'Describe pseudocode needs...';
    case 'flowchart-insert':      return 'Describe where to insert a symbol...';
    case 'flowchart-import':      return 'Describe the process to diagram...';
    default:                      return 'Ask anything...';
  }
}

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
  isCrossEntity?: boolean;
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
  isCrossEntity = false,
}: ChatInputProps) {
  if (!hasActiveSession) return null;

  return (
    <div className="shrink-0 border-t bg-background p-4 space-y-2.5">
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          defaultValue=""
          onKeyDown={onKeyDown}
          placeholder={isStreaming ? 'AI is responding...' : getPlaceholder(activeActionId)}
          className="flex-1 min-h-[80px] max-h-[200px] rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 resize-none"
          rows={3}
          disabled={isStreaming}
        />
        <Button
          variant={isStreaming ? "outline" : "default"}
          size="icon"
          className="shrink-0 size-9 rounded-md"
          onClick={isStreaming ? onAbort : onSend}
        >
          {isStreaming ? <StopCircle className="size-4 text-destructive" /> : <Send className="size-4" />}
        </Button>
      </div>

      <div className="flex items-center justify-between min-h-[28px]">
        {!isCrossEntity && ['note', 'diagram', 'flowchart'].includes(entityType || '') && !isStreaming && actions.length > 0 ? (
          <div className="flex items-center gap-1 flex-wrap">
            {actions.map((action) => {
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
                      <span className="truncate max-w-[80px]">{action.label}</span>
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
