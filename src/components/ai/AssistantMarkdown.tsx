import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';

interface AssistantMarkdownProps {
  content: string;
  isStreaming: boolean;
}

export const AssistantMarkdown = memo(function AssistantMarkdown({ content, isStreaming }: AssistantMarkdownProps) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-xs" style={{ '--tw-prose-pre-bg': 'var(--muted)', '--tw-prose-pre-code': 'var(--foreground)', '--tw-prose-code': 'var(--foreground)' } as React.CSSProperties}>
      {isStreaming && !content ? (
        <span className="inline-flex gap-1 py-1">
          <span className="size-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="size-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="size-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
        </span>
      ) : (
        <>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table({ children, ...props }) {
                return <div className="overflow-x-auto -mx-3.5 px-3.5"><table className="min-w-full border-collapse" {...props}>{children}</table></div>;
              },
              code({ className, children, ...props }) {
                if (className || String(children).includes('\n')) return <CodeBlock className={className} children={children} />;
                return <code className="bg-black/30 px-1 py-0.5 rounded text-[11px]" {...props}>{children}</code>;
              },
            }}
          >{content}</ReactMarkdown>
          {isStreaming && <span className="inline-block size-1.5 rounded-full bg-foreground/40 animate-pulse ml-0.5" />}
        </>
      )}
    </div>
  );
});
