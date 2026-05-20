import Prism from 'prismjs';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import { Copy } from 'lucide-react';

export function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : '';
  const code = String(children).replace(/\n$/, '');
  const highlighted = lang && Prism.languages[lang]
    ? Prism.highlight(code, Prism.languages[lang], lang)
    : null;

  return (
    <div className="relative group/code my-2 rounded-lg overflow-hidden border border-border/50 bg-[#0d1117]">
      {lang && (
        <div className="flex items-center justify-between px-3 py-1 text-[10px] text-muted-foreground/50 bg-white/[0.03] border-b border-border/30">
          <span>{lang}</span>
          <button
            onClick={() => navigator.clipboard.writeText(code)}
            className="opacity-0 group-hover/code:opacity-100 transition-opacity hover:text-foreground"
          >
            <Copy className="size-3" />
          </button>
        </div>
      )}
      <div className="overflow-x-auto custom-scrollbar">
        {highlighted ? (
          <pre
            className="p-3 text-xs leading-relaxed m-0 bg-transparent"
            style={{ whiteSpace: lang ? 'pre-wrap' : 'pre', wordBreak: lang ? 'break-word' : 'normal', tabSize: 2 }}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        ) : (
          <pre
            className="p-3 text-xs leading-relaxed m-0 bg-transparent"
            style={{ whiteSpace: lang ? 'pre-wrap' : 'pre', wordBreak: lang ? 'break-word' : 'normal', tabSize: 2 }}
          >
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
