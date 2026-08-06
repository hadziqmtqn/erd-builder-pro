import CodeMirror from '@uiw/react-codemirror';
import { sql as sqlLang } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export const DBML_REFERENCE = `// ERD Builder DBML reference.
// Table, Enum, Ref, indexes, constraints, defaults, and notes can be
// edited here and are applied to the ERD canvas after the DBML is valid.

Table users {
  id BIGINT [pk, not null, increment]
  name VARCHAR(255) [not null]
  email VARCHAR(255) [not null, note: 'Must be unique']
  role users_role [not null, default: 'member']
  created_at TIMESTAMP [not null]
  updated_at TIMESTAMP [not null]
  deleted_at TIMESTAMP [default: NULL]
  Note: 'Account table'

  Indexes {
    (email) [unique, name: "users_email_unique"]
  }
}

Table posts {
  id BIGINT [pk, not null, increment]
  user_id BIGINT [not null]
  status posts_status [not null, default: 'draft']
  title VARCHAR(255) [not null]
  body TEXT

  Indexes {
    (user_id, status) [name: "posts_user_status_index"]
  }
}

Enum users_role {
  admin
  member
}

Enum posts_status {
  draft
  published
  archived
}

// The foreign-key column is on the left; the referenced column is on the right.
Ref "posts_user_id_fk": posts.user_id > users.id [delete: cascade, update: cascade]`;

interface DBMLReferenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resolvedTheme: 'light' | 'dark';
}

export function DBMLReferenceDialog({ open, onOpenChange, resolvedTheme }: DBMLReferenceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>DBML Reference</DialogTitle>
          <DialogDescription>
            Use this example as a starting point for tables, column metadata, enums, indexes, and relationships.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              Every entry inside an <code>Indexes</code> block must wrap its column list in parentheses, including a single-column index such as <code>(email)</code>.
            </p>
            <p>
              Use column-level <code>unique</code> for a simple unnamed constraint. Use <code>Indexes</code> when you need a name, a composite index, or an explicit index definition.
            </p>
            <p>
              A <code>Ref</code> line keeps the foreign-key column on the left and supports optional delete and update actions.
            </p>
          </div>
          <div className="rounded-lg overflow-hidden border border-border/50">
            <CodeMirror
              value={DBML_REFERENCE}
              height="420px"
              theme={resolvedTheme === 'dark' ? oneDark : undefined}
              extensions={[sqlLang()]}
              editable={false}
              basicSetup={{
                lineNumbers: false,
                foldGutter: false,
                highlightActiveLine: false,
              }}
            />
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
