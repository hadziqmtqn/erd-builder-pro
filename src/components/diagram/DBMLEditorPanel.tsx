import { useCallback, useState, useEffect, useRef, useMemo, memo } from 'react';
import { Database, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { dbmlToERD, erdToDBML } from '@/lib/dbml-converter';
import { Parser } from '@dbml/core';
import CodeMirror from '@uiw/react-codemirror';
import { sql as sqlLang } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { autocompletion, type CompletionContext, type Completion, type CompletionResult } from '@codemirror/autocomplete';
import { linter, type Diagnostic } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import { useWorkspace } from '@/providers/WorkspaceContext';
import { COLUMN_TYPES } from '@/lib/utils';
import {
  buildDBMLTableDefinitions,
  parseDBMLColumn,
  parseDBMLRef,
  parseDBMLTableName,
  readDBMLEnumNames,
} from '@/lib/dbml-utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from '@/components/ui/dialog';
import type { Node, Edge } from '@xyflow/react';
import type { Entity } from '@/types';

interface DBMLEditorPanelProps {
  value: string;
  onChange: (value: string) => void;
  /** Push parsed DBML to the ERD canvas */
  onApply: (nodes: Node<Entity>[], edges: Edge[]) => void;
  /** Current canvas nodes/edges for reverse sync */
  nodes: Node<Entity>[];
  edges: Edge[];
  /** Called when cursor lands on a table name line — passes table name */
  onSelectTable?: (tableName: string) => void;
}

const APPLY_DEBOUNCE_MS = 1500;
const REVERSE_DEBOUNCE_MS = 800;

const DBML_REFERENCE = `Table users {
  id integer [pk, increment]
  username varchar [unique, not null]
  email varchar [note: 'user email']
  created_at timestamp [default: \`now()\`]
}

// Inline FK
Table posts {
  id integer [pk]
  user_id integer [ref: > users.id]
  title varchar
}

// Separate ref
Ref: posts.user_id > users.id
Ref: orders.user_id < users.id   // < = many-to-one

// Composite PK
Table bookmarks {
  user_id integer [pk, ref: > users.id]
  post_id integer [pk, ref: > posts.id]
}

// Enum
Enum status {
  draft
  published
  archived
}

// Indexes
Table logs {
  id integer [pk]
  event varchar
  Indexes {
    (event) [name: idx_event]
  }
}

// Notes
Note default_note {
  'This is a project note'
}

// Table group
TableGroup auth_tables {
  users
  sessions
}`;

/**
 * DBMLEditorPanel — live two-way DBML ↔ ERD editor.
 *
 * - Typing in DBML editor → debounced auto-apply to canvas.
 * - ERD canvas changes → debounced auto-generate DBML text.
 */
export const DBMLEditorPanel = memo(function DBMLEditorPanel({ value, onChange, onApply, nodes, edges, onSelectTable }: DBMLEditorPanelProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const { resolvedTheme } = useWorkspace();

  // ── Feedback loop guards ──
  const applyingFromDBML = useRef(false);
  const generatingFromCanvas = useRef(false);
  const isReverseApply = useRef(false);
  const applyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Last known canvas hash to avoid redundant reverse sync ──
  const lastCanvasHash = useRef('');

  // ── Autocomplete: suggest keywords, types, table/column names ──
  const tableDataRef = useRef({ names: [] as string[], cols: new Map<string, string[]>() });
  tableDataRef.current = useMemo(() => {
    const names = nodes.map(n => n.data.name);
    const cols = new Map<string, string[]>();
    for (const n of nodes) {
      cols.set(n.data.name, n.data.columns.map(c => c.name));
    }
    return { names, cols };
  }, [nodes]);

  // Stable completion lists (never change)
  const KEYWORDS: Completion[] = useMemo(() => [
    { label: 'Table', type: 'keyword', detail: 'table definition' },
    { label: 'Ref', type: 'keyword', detail: 'relationship' },
    { label: 'Enum', type: 'keyword', detail: 'enum definition' },
    { label: 'TableGroup', type: 'keyword', detail: 'table group' },
    { label: 'Note', type: 'keyword', detail: 'project note' },
    { label: 'Indexes', type: 'keyword', detail: 'index block' },
  ], []);

  const SETTINGS: Completion[] = useMemo(() => [
    { label: 'pk', type: 'keyword', detail: 'primary key' },
    { label: 'unique', type: 'keyword', detail: 'unique constraint' },
    { label: 'not null', type: 'keyword', detail: 'not null' },
    { label: 'note', type: 'keyword', detail: "column note: 'text'" },
    { label: 'default', type: 'keyword', detail: 'default value' },
    { label: 'increment', type: 'keyword', detail: 'auto-increment' },
    { label: 'ref', type: 'keyword', detail: 'inline FK: > table.col' },
    { label: 'headerColor', type: 'keyword', detail: 'table header color' },
  ], []);

  const TYPES: Completion[] = useMemo(() =>
    COLUMN_TYPES.map(t => ({ label: t, type: 'type' as const, detail: 'column type' }))
  , []);

  // Stable completion source function
  const dbmlCompletions = useCallback((ctx: CompletionContext): CompletionResult | null => {
    const { names: tableNames, cols: tableCols } = tableDataRef.current;
    const line = ctx.state.doc.lineAt(ctx.pos);
    const before = line.text.slice(0, ctx.pos - line.from);
    const word = ctx.matchBefore(/\w+/);
    if (!word) return null;
    const partial = word.text.toLowerCase();
    if (!partial) return null;

    // ── Context detection ──
    const beforeTrimmed = before.slice(0, word.from - line.from).trimEnd();
    const isLineStart = !beforeTrimmed || beforeTrimmed.startsWith('//');
    const insideTableBody = /^\s/.test(line.text) && !/^\s*(Table|Ref|Enum|TableGroup|Note|Indexes)\b/i.test(line.text);
    // Column name may be quoted: "name" or bare: name
    const afterColName = /^\s+"[^"]+"\s+\w*$/.test(before) || /^\s+\w+\s+\w*$/.test(before);

    // ── Ref line: suggest table/column names ──
    const isRefLine = /^\s*Ref:\s/i.test(line.text);
    if (isRefLine) {
      const afterRef = before.replace(/^\s*Ref:\s*/, '');
      // Before any > or < → suggest table names
      if (!/[><]/.test(afterRef)) {
        // Check if we're after a dot: table.col
        const dotMatch = afterRef.match(/^(\w+)\.(\w*)$/);
        if (dotMatch) {
          const cols = tableCols.get(dotMatch[1]);
          if (cols) {
            const options: Completion[] = cols
              .filter(c => c.toLowerCase().startsWith(partial))
              .map(c => ({ label: c, type: 'property' as const, detail: dotMatch[1] }));
            if (options.length) return { from: word.from, options };
          }
          return null;
        }
        // Suggest table names
        const options: Completion[] = tableNames
          .filter(t => t.toLowerCase().startsWith(partial))
          .map(t => ({ label: t, type: 'class' as const }));
        if (options.length) return { from: word.from, options };
        return null;
      }
    }

    // ── Ref context: after > or < → table names ──
    const afterArrow = before.match(/>\s*(\w*)$/i) || before.match(/<\s*(\w*)$/i);
    if (afterArrow) {
      const options: Completion[] = tableNames
        .filter(t => t.toLowerCase().startsWith(partial))
        .map(t => ({ label: t, type: 'class' as const }));
      if (options.length) return { from: word.from, options };
      return null;
    }

    // ── Ref context: after table. → column names ──
    const afterDot = before.match(/>\s*(\w+)\.(\w*)$/i) || before.match(/<\s*(\w+)\.(\w*)$/i);
    if (afterDot) {
      const tableName = afterDot[1];
      const cols = tableCols.get(tableName);
      if (!cols) return null;
      const options: Completion[] = cols
        .filter(c => c.toLowerCase().startsWith(partial))
        .map(c => ({ label: c, type: 'property' as const, detail: tableName }));
      if (options.length) return { from: word.from, options };
      return null;
    }

    // ── Column types: inside table body, after column name ──
    if (insideTableBody && afterColName) {
      const options = TYPES.filter(t =>
        t.label.toLowerCase().startsWith(partial),
      );
      if (options.length) return { from: word.from, options };
      // Return empty to suppress SQL keyword leak (VARCHAR, INT from sqlLang)
      return { from: word.from, options: [], filter: false };
    }

    // ── Inside brackets `[...]` → suggest settings ──
    if (before.match(/\[[^\]]*\w*$/)) {
      const options = SETTINGS.filter(s =>
        s.label.toLowerCase().startsWith(partial),
      );
      if (options.length) return { from: word.from, options };
    }

    // ── Keywords: only at line start ──
    if (isLineStart) {
      const options = KEYWORDS.filter(k =>
        k.label.toLowerCase().startsWith(partial),
      );
      if (options.length) return { from: word.from, options };
    }

    // Return empty instead of null — suppresses sqlLang() keyword leak
    return { from: word?.from ?? ctx.pos, options: [], filter: false };
  }, [KEYWORDS, SETTINGS, TYPES]);

  // ── Lint source: underline errors like VS Code ──
  const dbmlLinter = useMemo(() => {
    const validTypes = new Set(COLUMN_TYPES.map(t => t.toUpperCase()));
    return linter((view) => {
      const doc = view.state.doc;
      const text = doc.toString();
      const diagnostics: Diagnostic[] = [];
      const lines = text.split('\n');
      let currentTable = '';
      let inTable = false;
      const enumNames = readDBMLEnumNames(lines);

      // ── Type errors ──
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        const lineFrom = doc.line(i + 1).from;

        const tableName = parseDBMLTableName(line);
        if (tableName) {
          currentTable = tableName;
          inTable = true;
          continue;
        }
        if (trimmed === '}' || trimmed.startsWith('}')) {
          inTable = false; currentTable = ''; continue;
        }
        if (inTable && trimmed && !trimmed.startsWith('//')) {
          // Match quoted or unquoted column: "name" TYPE or name TYPE
          const column = parseDBMLColumn(trimmed);
          if (column) {
            const { name: colName, type: typeName } = column;
            if (typeName && !validTypes.has(typeName.toUpperCase()) && !enumNames.has(typeName.toLowerCase())) {
              const typeStart = line.indexOf(typeName);
              diagnostics.push({
                from: lineFrom + typeStart,
                to: lineFrom + typeStart + typeName.length,
                severity: 'error',
                message: `Invalid type "${typeName}" in "${currentTable}.${colName}"`,
              });
            }
          }
        }
      }

      // ── Relationship/reference validation ──
      const { tableDefs, lineTables } = buildDBMLTableDefinitions(lines);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineFrom = doc.line(i + 1).from;
        const ref = parseDBMLRef(line, lineTables[i]);
        if (ref) {
          const { fkTable, fkCol, pkTable, pkCol } = ref;

          // Validate FK table exists
          const fkCols = tableDefs.get(fkTable);
          if (!fkCols) continue;

          // Validate FK column exists
          if (fkCol && !fkCols.has(fkCol)) {
            const idx = line.indexOf(fkCol);
            if (idx >= 0) diagnostics.push({
              from: lineFrom + idx, to: lineFrom + idx + fkCol.length,
              severity: 'error',
              message: `Column "${fkCol}" not found in "${fkTable}"`,
            });
            continue;
          }

          // Validate target table exists
          const targetCols = tableDefs.get(pkTable);
          if (!targetCols) {
            const idx = line.indexOf(pkTable);
            if (idx >= 0) diagnostics.push({
              from: lineFrom + idx, to: lineFrom + idx + pkTable.length,
              severity: 'error',
              message: `Table "${pkTable}" not found`,
            });
            continue;
          }

          // Validate target column exists
          if (!targetCols.has(pkCol)) {
            const idx = line.indexOf(pkCol);
            if (idx >= 0) diagnostics.push({
              from: lineFrom + idx, to: lineFrom + idx + pkCol.length,
              severity: 'error',
              message: `Column "${pkCol}" not found in "${pkTable}"`,
            });
            continue;
          }

          // Validate column types match
          if (fkCol && fkCols.has(fkCol)) {
            const fkType = (fkCols.get(fkCol) || '').toUpperCase().replace(/\s+/g, '');
            const pkType = (targetCols.get(pkCol) || '').toUpperCase().replace(/\s+/g, '');
            if (fkType && pkType && fkType !== pkType) {
              const idx = line.indexOf(fkCol);
              if (idx >= 0) diagnostics.push({
                from: lineFrom + idx, to: lineFrom + idx + fkCol.length,
                severity: 'error',
                message: `Type mismatch: "${fkTable}.${fkCol}" is ${fkCols.get(fkCol)} but "${pkTable}.${pkCol}" is ${targetCols.get(pkCol)}`,
              });
            }
          }
        }
      }

      // ── Parse errors (lazy — only if structurally complete) ──
      let depth = 0;
      for (const ch of text) {
        if (ch === '{') depth++;
        if (ch === '}') depth--;
      }
      if (depth === 0 && /\bTable\b/i.test(text)) {
        try {
          Parser.parse(text, 'dbml');
        } catch (e: any) {
          const diags = e?.diags;
          if (diags) {
            for (const d of diags) {
              const line = d.location?.start?.line;
              const col = (d.location?.start?.column || 1) - 1;
              if (line && line <= lines.length) {
                const lf = doc.line(line).from;
                diagnostics.push({
                  from: lf + col,
                  to: lf + col + 1,
                  severity: 'error',
                  message: d.message,
                });
              }
            }
          }
        }
      }

      return diagnostics;
    }, { delay: 500 });
  }, []);

  // ── Cursor → table name tracking ──
  const onSelectTableRef = useRef(onSelectTable);
  onSelectTableRef.current = onSelectTable;
  const lastTableRef = useRef('');

  const cursorTracker = useMemo(() => EditorView.updateListener.of((update) => {
    if (!update.selectionSet && !update.docChanged) return;
    const cb = onSelectTableRef.current;
    if (!cb) return;
    const pos = update.state.selection.main.head;
    const line = update.state.doc.lineAt(pos);
    const m = line.text.match(/^\s*(?:Table|table)\s+["']?(\w+)["']?\s*\{/);
    if (m && m[1] !== lastTableRef.current) {
      lastTableRef.current = m[1];
      cb(m[1]);
    } else if (!m) {
      lastTableRef.current = '';
    }
  }), []);

  // ── Stable extensions array ──
  const extensions = useMemo(() => [
    sqlLang(),
    autocompletion({ override: [dbmlCompletions], selectOnOpen: false }),
    dbmlLinter,
    cursorTracker,
  ], [dbmlCompletions, dbmlLinter, cursorTracker]);

  const handleChange = useCallback(
    (val: string) => {
      prevValue.current = val;
      clearTimeout(reverseTimer.current);
      onChange(val);
    },
    [onChange],
  );

  // ── Stable refs to avoid feedback loop in effects ──
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const prevValue = useRef(value);
  const editorRef = useRef<{ view?: { dispatch: (tr: Record<string, unknown>) => void; state: { doc: { toString: () => string }; update: (spec: Record<string, unknown>) => Record<string, unknown> } } | null } | null>(null);

  // Only push external value changes to CodeMirror — don't use controlled prop
  useEffect(() => {
    if (!editorRef.current?.view) return;
    const curDoc = editorRef.current.view.state.doc.toString();
    if (value !== curDoc) {
      const tr = editorRef.current.view.state.update({
        changes: { from: 0, to: curDoc.length, insert: value },
      });
      editorRef.current.view.dispatch(tr);
    }
  }, [value]);

  // ── Track last parsed content to skip whitespace-only changes ──
  const lastParsedValue = useRef('');

  // ── DBML → Canvas (live, debounced) ──
  useEffect(() => {
    if (!value.trim()) return;

    // Skip parse when only whitespace/formatting changed (e.g. pressing Enter)
    if (value.replace(/\s+/g, ' ') === lastParsedValue.current) return;

    // Skip parse when text was generated by reverse sync (opening panel)
    if (isReverseApply.current) {
      isReverseApply.current = false;
      return;
    }

    // Quick structural check: braces must be balanced before attempting parse
    if (!isStructurallyComplete(value)) return;

    clearTimeout(applyTimer.current);
    applyTimer.current = setTimeout(() => {
      try {
        const result = dbmlToERD(value);
        lastParsedValue.current = value.replace(/\s+/g, ' ');
        applyingFromDBML.current = true;
        onApplyRef.current(result.nodes, result.edges);
        setTimeout(() => { applyingFromDBML.current = false; }, 0);
      } catch {
        // Errors shown via lint — no parse/apply/save until fully valid
      }
    }, APPLY_DEBOUNCE_MS);

    return () => clearTimeout(applyTimer.current);
  }, [value]);

  // ── Canvas → DBML (reverse sync, debounced) ──
  useEffect(() => {
    if (nodes.length === 0) return;

    // Skip if this canvas change was triggered by our own DBML apply
    if (applyingFromDBML.current) {
      applyingFromDBML.current = false;
      return;
    }

    const hash = canvasFingerprint(nodes, edges);
    if (hash === lastCanvasHash.current) return;

    clearTimeout(reverseTimer.current);
    reverseTimer.current = setTimeout(() => {
      if (generatingFromCanvas.current) return;
      generatingFromCanvas.current = true;

      try {
        let dbml = erdToDBML(nodes, edges);
        // Enum blocks used by a canvas column are regenerated from enum
        // metadata. Preserve only enum names the generated DBML does not
        // contain (for example, a standalone enum), avoiding duplicates.
        const previous = prevValue.current || '';
        const generatedEnumNames = new Set(
          [...dbml.matchAll(/^\s*Enum\s+(?:"([^"]+)"|(\w+))\s*\{/gim)]
            .map(match => (match[1] || match[2]).toLowerCase()),
        );
        const enumExtras = ((previous.match(/^\s*Enum\s+(?:"[^"]+"|\w+)\s*\{[\s\S]*?^\s*\}/gim) || []) as string[])
          .filter(block => {
            const match = block.match(/^\s*Enum\s+(?:"([^"]+)"|(\w+))\s*\{/i);
            return match && !generatedEnumNames.has((match[1] || match[2]).toLowerCase());
          });
        const extras = [
          ...enumExtras,
          ...(previous.match(/^(Note|TableGroup)\s+\S[\s\S]*?\}/gm) || []),
        ];
        if (extras.length) {
          // Insert enum extras before Ref section, Note/TableGroup at the end
          // Trim each block to prevent accumulation of blank lines on repeated auto-applies
          const enumExtraText = enumExtras.length ? enumExtras.map(e => e.trim()).join('\n\n') : '';
          const otherExtras = previous.match(/^(Note|TableGroup)\s+\S[\s\S]*?\}/gm) || [];
          const otherExtraText = otherExtras.length ? '\n\n' + otherExtras.map(e => e.trim()).join('\n\n') : '';

          // Find the Ref section in generated DBML to insert enums before it
          const refMatch = dbml.match(/^Ref:/m);
          if (refMatch && refMatch.index !== undefined) {
            const beforeRef = dbml.slice(0, refMatch.index).trimEnd();
            const refSection = dbml.slice(refMatch.index);
            const enumPart = enumExtraText ? '\n\n' + enumExtraText : '';
            dbml = beforeRef + enumPart + '\n\n' + refSection + otherExtraText + '\n';
          } else {
            // No Ref section — append at end
            dbml = dbml.trimEnd() + '\n\n' + extras.map(e => e.trim()).join('\n\n') + '\n';
          }
        }
        lastCanvasHash.current = canvasFingerprint(nodes, edges);
        // Only update if text actually changed — prevents cursor jump
        if (dbml !== prevValue.current) {
          isReverseApply.current = true;
          onChangeRef.current(dbml);
        }
      } catch {
        // ignore
      } finally {
        generatingFromCanvas.current = false;
      }
    }, REVERSE_DEBOUNCE_MS);

    return () => clearTimeout(reverseTimer.current);
  }, [nodes, edges]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b bg-muted/20">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-primary" />
          <h3 className="text-sm font-semibold tracking-tight">DBML Editor</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => setHelpOpen(true)}
          title="DBML Reference"
        >
          <HelpCircle className="size-3.5" />
        </Button>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <CodeMirror
          ref={editorRef as any}
          value={value}
          height="100%"
          theme={resolvedTheme === 'dark' ? oneDark : undefined}
          extensions={extensions}
          placeholder={`// DBML (Database Markup Language)\n// Type your schema — live preview on canvas\n\nTable users {\n  id integer [pk]\n  name varchar\n}\n`}
          className="h-full text-sm"
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            bracketMatching: true,
            closeBrackets: true,
            indentOnInput: true,
            autocompletion: true,
          }}
          onChange={handleChange}
        />
      </div>

      {/* DBML Reference Dialog */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>DBML Reference</DialogTitle>
          </DialogHeader>
          <DialogBody>
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
    </div>
  );
}, (prev, next) =>
  prev.value === next.value &&
  prev.nodes === next.nodes &&
  prev.edges === next.edges
);

/** Lightweight fingerprint for canvas state — avoids deep-equal on every render. */
function canvasFingerprint(nodes: Node<Entity>[], edges: Edge[]): string {
  const nodeIds = nodes.map(n => n.id).sort().join(',');
  const edgeIds = edges.map(e => e.id).sort().join(',');
  const positions = nodes.map(n => `${n.id}:${Math.round(n.position.x)},${Math.round(n.position.y)}`).sort().join(';');
  const columns = nodes.map(n =>
    `${n.id}:${n.data.columns.map(c => `${c.name}:${c.type}:${c.enum_name || ''}:${c.enum_values || ''}:${c.is_pk}:${c.is_nullable}`).join(',')}`
  ).sort().join('|');
  return `${nodeIds}|${edgeIds}|${positions}|${columns}`;
}

/** Quick structural check: braces balanced, at least one table-like block. */
function isStructurallyComplete(text: string): boolean {
  let depth = 0;
  for (const ch of text) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth < 0) return false;
  }
  return depth === 0 && /\bTable\b/i.test(text);
}
