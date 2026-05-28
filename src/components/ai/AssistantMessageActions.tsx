import { useRef } from 'react';
import { Replace, ArrowDownToLine, Copy, Check, Database, GitBranch } from 'lucide-react';
import { toast } from 'sonner';
import { hasFlowchartJSON, hasSQLContent, extractSQL, extractFlowchartJSON } from './chatUtils';

export interface AssistantMessageActionsProps {
  content: string;
  msgId: string;
  isCrossEntity: boolean;
  hasContentHandler: boolean;
  contentHandlerStrategies: string[];
  contentCheckType: 'flowchart' | 'erd' | 'none';
  lastActionId: string | null;
  applyContent: (content: string, strategy: 'replace' | 'append', actionId?: string) => void;
  copiedMsgId: string | null;
  onCopy: (id: string) => void;
  onOpenErdDialog: (sql: string) => void;
  targetProjectId: string | number | null | undefined;
  handleSidebarFlowchartCreate: (name: string, projectId?: any) => Promise<any>;
  handleFlowchartSelect: (uid: string) => Promise<any>;
}

export function AssistantMessageActions({
  content,
  msgId,
  isCrossEntity,
  hasContentHandler,
  contentHandlerStrategies,
  contentCheckType,
  lastActionId,
  applyContent,
  copiedMsgId,
  onCopy,
  onOpenErdDialog,
  targetProjectId,
  handleSidebarFlowchartCreate,
  handleFlowchartSelect,
}: AssistantMessageActionsProps) {
  const chatFlowchartUidRef = useRef<string | null>(localStorage.getItem('chat_flowchart_uid'));

  const showApplyButtons = !isCrossEntity && hasContentHandler && (
    (contentCheckType === 'none' && !hasSQLContent(content) && !hasFlowchartJSON(content)) ||
    (contentCheckType === 'flowchart' && hasFlowchartJSON(content)) ||
    (contentCheckType === 'erd' && hasSQLContent(content))
  );

  const showSqlButton = hasSQLContent(content);
  const showFlowchartButton = hasFlowchartJSON(content);
  const showDivider = showSqlButton || showFlowchartButton;

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

      {showSqlButton && (
        <button
          onClick={() => {
            const sql = extractSQL(content);
            if (sql) onOpenErdDialog(sql);
          }}
          className="flex items-center justify-center size-8 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-md shadow-sm transition-all cursor-pointer"
          title="Create or update ERD from this SQL"
        >
          <Database className="size-4" />
        </button>
      )}

      {showFlowchartButton && (
        <button
          onClick={async () => {
            const json = extractFlowchartJSON(content);
            if (json) {
              localStorage.setItem('pending_create_flowchart_json', json);
              if (chatFlowchartUidRef.current) {
                toast.info('Updating existing Flowchart...');
                await handleFlowchartSelect(chatFlowchartUidRef.current);
              } else {
                toast.info('Creating new Flowchart...');
                const f = await handleSidebarFlowchartCreate('Flowchart from Chat', targetProjectId);
                if (f?.uid) {
                  chatFlowchartUidRef.current = f.uid;
                  localStorage.setItem('chat_flowchart_uid', f.uid);
                }
              }
            }
          }}
          className="flex items-center justify-center size-8 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-md shadow-sm transition-all cursor-pointer"
          title={chatFlowchartUidRef.current ? 'Update existing Flowchart' : 'Create new Flowchart'}
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
