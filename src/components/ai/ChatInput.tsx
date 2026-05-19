import { useState, useCallback } from 'react';
import { Sparkles, Send, StopCircle, ChevronDown, SquareTerminal, CircleHelp, Database, Lightbulb, StickyNote, LayoutPanelLeft } from 'lucide-react';
import { AIAction } from '@/components/ai/AIActions';
import { Button } from '@/components/ui/button';
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
    default:
      return <Sparkles className="size-3.5" />;
  }
}

export interface ChatInputProps {
  hasActiveSession: boolean;
  input: string;
  isStreaming: boolean;
  entityType?: string | null;
  actions: AIAction[];
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSelectAction: (action: AIAction) => void;
  onAbort: () => void;
}

export function ChatInput({
  hasActiveSession,
  input,
  isStreaming,
  entityType,
  actions,
  inputRef,
  onInputChange,
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
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
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
          disabled={!input.trim() && !isStreaming}
        >
          {isStreaming ? <StopCircle className="size-4 text-destructive" /> : <Send className="size-4" />}
        </Button>
      </div>

      <div className="flex items-center justify-between">
        {['note', 'diagram'].includes(entityType || '') && !isStreaming && actions.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-border bg-muted/50 hover:bg-muted/80 transition-colors text-white outline-none">
              <Sparkles className="size-3.5 text-primary" />
              AI Actions
              <ChevronDown className="size-3 ml-0.5 opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-[200px]">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider opacity-50">
                  {entityType === 'note' ? 'Notes Actions' : entityType === 'diagram' ? 'ERD Actions' : 'Actions'}
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
        ) : (
          <span className="text-[10px] text-muted-foreground/50 px-1 font-medium">
            {isStreaming ? 'Generating...' : 'Press Enter to send'}
          </span>
        )}
      </div>
    </div>
  );
}
