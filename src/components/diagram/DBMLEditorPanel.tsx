import { useCallback } from 'react';
import { Database, PanelRightClose } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DBMLEditorPanelProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}

/**
 * DBMLEditorPanel — DBML text editor in right sidebar.
 *
 * ponytail: bare <textarea> with monospace font.
 * Upgrade to CodeMirror/Monaco when syntax highlighting needed.
 */
export function DBMLEditorPanel({ value, onChange, onClose }: DBMLEditorPanelProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b bg-muted/20">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-primary" />
          <h3 className="text-sm font-semibold tracking-tight">DBML Editor</h3>
        </div>
        <Button variant="ghost" size="icon" className="size-8" onClick={onClose} title="Close panel">
          <PanelRightClose className="size-3.5" />
        </Button>
      </div>

      {/* Editor area */}
      <textarea
        value={value}
        onChange={handleChange}
        placeholder={`// DBML (Database Markup Language)
// Write or paste your schema here…

Table users {
  id integer [pk]
  name varchar
  email varchar [unique]
  created_at timestamp
}

Table posts {
  id integer [pk]
  user_id integer [ref: > users.id]
  title varchar
  body text
}
`}
        className="flex-1 w-full resize-none bg-background text-sm font-mono
          p-4 outline-none border-0
          text-foreground placeholder:text-muted-foreground/40
          leading-relaxed"
        spellCheck={false}
      />
    </div>
  );
}
