import { Replace, ArrowDownToLine, Copy, Check, Database, GitBranch, FileText } from 'lucide-react';
import { hasFlowchartJSON, hasSchemaContent, extractSchemaContent, extractFlowchartJSON } from './chatUtils';

export interface AssistantMessageActionsProps {
  content: string;
  msgId: string;
  hasContentHandler: boolean;
  contentHandlerStrategies: string[];
  contentCheckType: 'flowchart' | 'erd' | 'none';
  lastActionId: string | null;
  applyContent: (content: string, strategy: 'replace' | 'append', actionId?: string) => void;
  copiedMsgId: string | null;
  onCopy: (id: string) => void;
  onOpenErdDialog: (schema: string) => void;
  onOpenFlowchartDialog: (json: string) => void;
  onOpenNoteDialog: (text: string) => void;
}

export function AssistantMessageActions({
  content,
  msgId,
  hasContentHandler,
  contentHandlerStrategies,
  contentCheckType,
  lastActionId,
  applyContent,
  copiedMsgId,
  onCopy,
  onOpenErdDialog,
  onOpenFlowchartDialog,
  onOpenNoteDialog,
}: AssistantMessageActionsProps) {
  const showApplyButtons = hasContentHandler && (
    (contentCheckType === 'flowchart' && hasFlowchartJSON(content)) ||
    (contentCheckType === 'erd' && hasSchemaContent(content))
  );

  const showSchemaButton = hasSchemaContent(content) && contentCheckType !== 'erd';
  const showFlowchartButton = hasFlowchartJSON(content) && contentCheckType !== 'flowchart';
  const showDivider = showSchemaButton || showFlowchartButton;

  return (
    <div className="flex items-center gap-1.5 h-8 mt-1 overflow-hidden transition-all duration-300 ease-in-out opacity-0 group-hover/msg:opacity-100 group-hover/msg:translate-y-0 -translate-y-2 pointer-events-none group-hover/msg:pointer-events-auto focus-within:opacity-100 focus-within:translate-y-0 focus-within:pointer-events-auto">
      {showApplyButtons && (
        <>
          {contentHandlerStrategies.includes('replace') && (
            <button
              onClick={() => applyContent(content, 'replace', lastActionId || undefined)}
              className="flex items-center justify-center size-8 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 rounded-md shadow-sm transition-all"
              title="Replace All"
            >
              <Replace className="size-4" />
            </button>
          )}

          {contentHandlerStrategies.includes('append') && (
            <button
              onClick={() => applyContent(content, 'append', lastActionId || undefined)}
              className="flex items-center justify-center size-8 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 rounded-md shadow-sm transition-all"
              title="Append"
            >
              <ArrowDownToLine className="size-4" />
            </button>
          )}

          {contentHandlerStrategies.includes('replace') && contentHandlerStrategies.includes('append') && (
            <div className="w-px h-6 bg-border mx-1" />
          )}
        </>
      )}

      {/* Notes button: ALWAYS visible */}
      <button
        onClick={() => onOpenNoteDialog(content)}
        className="flex items-center justify-center size-8 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 rounded-md shadow-sm transition-all cursor-pointer"
        title="Save as Note"
      >
        <FileText className="size-4" />
      </button>

      {showSchemaButton && (
        <button
          onClick={() => {
            const schema = extractSchemaContent(content);
            if (schema) onOpenErdDialog(schema);
          }}
          className="flex items-center justify-center size-8 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-md shadow-sm transition-all cursor-pointer"
          title="Create or update ERD from this DBML schema"
        >
          <Database className="size-4" />
        </button>
      )}

      {showFlowchartButton && (
        <button
          onClick={() => {
            const json = extractFlowchartJSON(content);
            if (json) onOpenFlowchartDialog(json);
          }}
          className="flex items-center justify-center size-8 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-md shadow-sm transition-all cursor-pointer"
          title="Create or update Flowchart"
        >
          <GitBranch className="size-4" />
        </button>
      )}

      {showDivider && (
        <div className="w-px h-6 bg-border mx-1" />
      )}

      <button
        onClick={() => onCopy(msgId)}
        className="flex items-center justify-center size-8 bg-muted/40 border border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-md shadow-sm transition-all"
        title="Copy message"
      >
        {copiedMsgId === msgId ? (
          <Check className="size-4 text-green-500" />
        ) : (
          <Copy className="size-4" />
        )}
      </button>
    </div>
  );
}
