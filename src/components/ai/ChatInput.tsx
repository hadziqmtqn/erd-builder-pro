import { memo } from 'react';
import { Sparkles, Send, StopCircle, ChevronDown, SquareTerminal, CircleHelp, Database, Lightbulb, StickyNote, LayoutPanelLeft, Wand2, FileText, Code, GitBranch, Palette, FileDown } from 'lucide-react';
import { AIAction } from '@/components/ai/AIActions';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

function getActionIcon(actionId: string) {
  switch (actionId) {
    case 'notes-summarize':
      return <StickyNote className="size-3.5" />;
    case 'notes-improve-grammar':
      return <Lightbulb className="size-3.5" />;
    case 'notes-generate-docs':
      return <LayoutPanelLeft className="size-3.5" />;
    case 'erd-generate-sql':
      return <Database className="size-3.5" />;
    case 'erd-edit-column':
      return <SquareTerminal className="size-3.5" />;
    case 'erd-explain-table':
      return <CircleHelp className="size-3.5" />;
    case 'erd-suggest-indexes':
      return <SquareTerminal className="size-3.5" />;
    case 'flowchart-generate':
      return <Wand2 className="size-3.5" />;
    case 'flowchart-explain':
      return <FileText className="size-3.5" />;
    case 'flowchart-pseudocode':
      return <Code className="size-3.5" />;
    case 'flowchart-insert':
      return <GitBranch className="size-3.5" />;
    case 'flowchart-colorize':
      return <Palette className="size-3.5" />;
    case 'flowchart-import':
      return <FileDown className="size-3.5" />;
    default:
      return <Sparkles className="size-3.5" />;
  }
}

export interface ChatInputProps {
  hasActiveSession: boolean;
  isStreaming: boolean;
  entityType?: string | null;
  actions: AIAction[];
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSelectAction: (action: AIAction) => void;
  onAbort: () => void;
}

export const ChatInput = memo(function ChatInput({
  hasActiveSession,
  isStreaming,
  entityType,
  actions,
  inputRef,
  onSend,
  onKeyDown,
  onSelectAction,
  onAbort,
}: ChatInputProps) {
  if (!hasActiveSession) return null;

  return (
    <div className="shrink-0 border-t bg-background p-4 space-y-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          defaultValue=""
          onKeyDown={onKeyDown}
          placeholder={isStreaming ? 'AI is responding...' : 'Ask anything...'}
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

      <div className="flex items-center justify-between">
        {['note', 'diagram', 'flowchart'].includes(entityType || '') && !isStreaming && actions.length > 0 ? (
          <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-border bg-muted/50 hover:bg-muted/80 transition-colors text-white outline-none">
              <Sparkles className="size-3.5 text-primary" />
              AI Actions
              <ChevronDown className="size-3 ml-0.5 opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-[200px]">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider opacity-50">
                  {entityType === 'note' ? 'Notes Actions' : entityType === 'diagram' ? 'ERD Actions' : 'Flowchart Actions'}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {actions.map((action) => (
                  <DropdownMenuItem
                    key={action.id}
                    onClick={() => onSelectAction(action)}
                    className="text-xs cursor-pointer"
                  >
                    {getActionIcon(action.id)}
                    <span className="ml-2">{action.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
            <HoverCard openDelay={200} closeDelay={100}>
              <HoverCardTrigger asChild>
                <button
                  className="size-8 rounded-md flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60 transition-all cursor-pointer"
                >
                  <CircleHelp className="size-3.5" />
                </button>
              </HoverCardTrigger>
              <HoverCardContent side="top" align="start" className="w-64 p-3">
                <div className="space-y-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">AI Actions</p>
                  {actions.map((action) => (
                    <div key={action.id} className="flex items-start gap-2.5">
                      <div className="shrink-0 mt-0.5 size-6 rounded flex items-center justify-center bg-muted/30 text-muted-foreground">
                        {getActionIcon(action.id)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium">{action.label}</p>
                        <p className="text-[10px] text-muted-foreground/60 leading-relaxed">{action.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </HoverCardContent>
            </HoverCard>
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
