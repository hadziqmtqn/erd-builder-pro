import { Link } from 'react-router-dom';

interface MentionFile {
  name: string;
  type: 'note' | 'diagram' | 'flowchart' | 'drawing';
  uid: string;
}

export interface UserMessageBodyProps {
  content: string;
  selectionText?: string | null;
  msgId: string | number;
  expandedMessages: Set<string | number>;
  onToggleExpand: (key: string | number) => void;
  mentionFiles: MentionFile[];
}

const SYSTEM_MARKER = '\n\n---SYSTEM_PROMPT---\n';

function renderMentionText(text: string, mentionFiles: MentionFile[]): React.ReactNode[] | string {
  const mentionRegex = /@([^\s\n]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const name = match[1];
    const file = mentionFiles.find(f => f.name.toLowerCase() === name.toLowerCase());

    if (file) {
      const path = file.type === 'note' ? `/notes/${file.uid}`
        : file.type === 'diagram' ? `/erd/${file.uid}`
        : file.type === 'flowchart' ? `/flowchart/${file.uid}`
        : `/drawing/${file.uid}`;

      parts.push(
        <Link
          key={match.index}
          to={path}
          className="inline-flex items-center gap-0.5 font-medium text-cyan-400 hover:text-cyan-300 underline decoration-cyan-400/30 hover:decoration-cyan-300/60 transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          @{file.name}
        </Link>
      );
    } else {
      parts.push(match[0]);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

export function UserMessageBody({
  content,
  selectionText,
  msgId,
  expandedMessages,
  onToggleExpand,
  mentionFiles,
}: UserMessageBodyProps) {
  const markerIdx = content.indexOf(SYSTEM_MARKER);
  const hasSystemPart = markerIdx !== -1;
  const displayText = hasSystemPart ? content.slice(0, markerIdx) : content;
  const systemText = hasSystemPart ? content.slice(markerIdx + SYSTEM_MARKER.length) : '';

  const isLong = displayText.length > 300;
  const isExpanded = expandedMessages.has(msgId);
  const sysExpanded = expandedMessages.has(`sys_${msgId}`);

  return (
    <>
      <p className={`whitespace-pre-wrap break-words ${isLong && !isExpanded ? 'line-clamp-6' : ''}`}>
        {renderMentionText(displayText, mentionFiles)}
      </p>

      {hasSystemPart && (
        <button
          onClick={() => onToggleExpand(`sys_${msgId}`)}
          className="text-[10px] text-primary-foreground/50 hover:text-primary-foreground/80 mt-1.5 opacity-60 hover:opacity-100 transition-all flex items-center gap-1"
        >
          <span className="text-[8px] leading-none">{sysExpanded ? '▼' : '▶'}</span>
          {sysExpanded ? 'Hide context' : 'Show context'}
        </button>
      )}

      {hasSystemPart && sysExpanded && (
        <pre className="mt-1.5 pt-1.5 border-t border-primary-foreground/15 text-[9px] text-primary-foreground/40 whitespace-pre-wrap break-words leading-relaxed max-h-[200px] overflow-y-auto scrollbar-thin">
          {systemText}
        </pre>
      )}

      {isLong && (
        <button
          onClick={() => onToggleExpand(msgId)}
          className="text-[10px] text-primary-foreground/60 hover:text-primary-foreground/80 mt-1 opacity-60 hover:opacity-100 transition-all"
        >
          {isExpanded ? 'Show less' : 'Show more'}
        </button>
      )}

      {selectionText && (
        <div className="mt-1.5 pt-1.5 border-t border-primary-foreground/20 text-[10px] text-primary-foreground/60 leading-tight line-clamp-1">
          <span className="opacity-50 mr-1">&#8617;</span>
          {selectionText.length > 50
            ? selectionText.slice(0, 47) + '...'
            : selectionText}
        </div>
      )}
    </>
  );
}
