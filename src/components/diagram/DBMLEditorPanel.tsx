import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { Database, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { dbmlToERD, erdToDBML } from '@/lib/dbml-converter';
import CodeMirror from '@uiw/react-codemirror';
import { sql as sqlLang } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { Prec } from '@codemirror/state';
import { EditorView, keymap, type ViewUpdate } from '@codemirror/view';
import { useWorkspace } from '@/providers/WorkspaceContext';
import { dedupeDBMLEnumBlocks } from '@/lib/dbml-utils';
import { getDBMLSuggestions, type DBMLSuggestion, type DBMLTableData } from './DBMLEditorCompletions';
import { createDBMLLinter } from './DBMLEditorLinter';
import { DBMLReferenceDialog } from './DBMLReferenceDialog';
import { canvasFingerprint, isStructurallyComplete } from './dbml-editor-utils';
import type { Node, Edge } from '@xyflow/react';
import type { Entity } from '@/types';
import { cn } from '@/lib/utils';

interface DBMLEditorPanelProps {
  value: string;
  onChange: (value: string, persistNow?: boolean) => void;
  onApply: (nodes: Node<Entity>[], edges: Edge[], source: string) => void;
  nodes: Node<Entity>[];
  edges: Edge[];
  onSelectTable?: (tableName: string) => void;
}

const APPLY_DEBOUNCE_MS = 1500;
const REVERSE_DEBOUNCE_MS = 800;
const MAX_SUGGESTIONS = 8;
const SUGGESTION_MENU_HEIGHT = 176;
const SUGGESTION_MENU_WIDTH = 320;

/** Live two-way DBML ↔ ERD editor. */
export const DBMLEditorPanel = memo(function DBMLEditorPanel({
  value,
  onChange,
  onApply,
  nodes,
  edges,
  onSelectTable,
}: DBMLEditorPanelProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<DBMLSuggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [suggestionPosition, setSuggestionPosition] = useState({ top: 16, left: 16 });
  const { resolvedTheme } = useWorkspace();

  const applyingFromDBML = useRef(false);
  const generatingFromCanvas = useRef(false);
  const isReverseApply = useRef(false);
  const applyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastCanvasHash = useRef('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const suggestionsRef = useRef<DBMLSuggestion[]>([]);
  const selectedSuggestionRef = useRef(0);

  const tableDataRef = useRef<DBMLTableData>({ names: [], cols: new Map() });
  tableDataRef.current = useMemo(() => ({
    names: nodes.map(node => node.data.name),
    cols: new Map(nodes.map(node => [node.data.name, node.data.columns.map(column => column.name)])),
  }), [nodes]);

  const dbmlLinter = useMemo(() => createDBMLLinter(), []);

  const onSelectTableRef = useRef(onSelectTable);
  onSelectTableRef.current = onSelectTable;
  const lastTableRef = useRef('');
  const cursorTracker = useMemo(() => EditorView.updateListener.of(update => {
    if (!update.selectionSet && !update.docChanged) return;
    const callback = onSelectTableRef.current;
    if (!callback) return;

    const position = update.state.selection.main.head;
    const line = update.state.doc.lineAt(position);
    const match = line.text.match(/^\s*(?:Table|table)\s+["']?(\w+)["']?\s*\{/);
    if (match && match[1] !== lastTableRef.current) {
      lastTableRef.current = match[1];
      callback(match[1]);
    } else if (!match) {
      lastTableRef.current = '';
    }
  }), []);

  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const prevValue = useRef(value);
  const lastParsedValue = useRef('');
  const updateSuggestionPosition = useCallback((view: EditorView, count = suggestionsRef.current.length) => {
    if (!count || !containerRef.current) return;
    const coords = view.coordsAtPos(view.state.selection.main.head);
    if (!coords) return;
    const rect = containerRef.current.getBoundingClientRect();
    const width = Math.min(SUGGESTION_MENU_WIDTH, Math.max(0, rect.width - 16));
    const height = Math.min(SUGGESTION_MENU_HEIGHT, count * 30 + 8);
    const left = Math.max(8, Math.min(coords.left - rect.left, rect.width - width - 8));
    const below = coords.bottom - rect.top + 4;
    const above = coords.top - rect.top - height - 4;
    const hasRoomBelow = rect.bottom - coords.bottom >= height + 8;
    setSuggestionPosition({ left, top: hasRoomBelow || coords.top - rect.top <= height + 8 ? below : above });
  }, []);

  const applySuggestion = useCallback((suggestion: DBMLSuggestion) => {
    const view = editorViewRef.current;
    if (!view) return;
    view.dispatch({
      changes: { from: suggestion.from, to: suggestion.to, insert: suggestion.label },
      selection: { anchor: suggestion.from + suggestion.label.length },
    });
    suggestionsRef.current = [];
    setSuggestions([]);
    view.focus();
  }, []);

  const handleChange = useCallback((nextValue: string, viewUpdate: ViewUpdate) => {
    prevValue.current = nextValue;
    clearTimeout(reverseTimer.current);
    onChange(nextValue);
    const next = getDBMLSuggestions(
      nextValue,
      viewUpdate.state.selection.main.head,
      tableDataRef.current,
      MAX_SUGGESTIONS,
    );
    suggestionsRef.current = next;
    selectedSuggestionRef.current = 0;
    setSuggestions(next);
    setSelectedSuggestion(0);
    if (next.length) updateSuggestionPosition(viewUpdate.view, next.length);
  }, [onChange, updateSuggestionPosition]);

  const handleEditorUpdate = useCallback((viewUpdate: ViewUpdate) => {
    if (viewUpdate.focusChanged && !viewUpdate.view.hasFocus) {
      suggestionsRef.current = [];
      setSuggestions([]);
      return;
    }
    if (suggestionsRef.current.length) updateSuggestionPosition(viewUpdate.view);
  }, [updateSuggestionPosition]);

  const extensions = useMemo(() => [
    sqlLang(),
    dbmlLinter,
    cursorTracker,
    Prec.highest(keymap.of([
      {
        key: 'ArrowDown',
        run: () => {
          if (!suggestionsRef.current.length) return false;
          const next = Math.min(selectedSuggestionRef.current + 1, suggestionsRef.current.length - 1);
          selectedSuggestionRef.current = next;
          setSelectedSuggestion(next);
          return true;
        },
      },
      {
        key: 'ArrowUp',
        run: () => {
          if (!suggestionsRef.current.length) return false;
          const next = Math.max(selectedSuggestionRef.current - 1, 0);
          selectedSuggestionRef.current = next;
          setSelectedSuggestion(next);
          return true;
        },
      },
      {
        key: 'Escape',
        run: () => {
          if (!suggestionsRef.current.length) return false;
          suggestionsRef.current = [];
          setSuggestions([]);
          return true;
        },
      },
      ...['Enter', 'Tab'].map(key => ({
        key,
        run: () => {
          const suggestion = suggestionsRef.current[selectedSuggestionRef.current];
          if (!suggestion) return false;
          applySuggestion(suggestion);
          return true;
        },
      })),
    ])),
  ], [applySuggestion, cursorTracker, dbmlLinter]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view || view.hasFocus) return;
    const currentDocument = view.state.doc.toString();
    if (value === currentDocument) return;

    view.dispatch({ changes: { from: 0, to: currentDocument.length, insert: value } });
  }, [value]);

  useEffect(() => {
    if (!value.trim()) return;
    if (value.replace(/\s+/g, ' ') === lastParsedValue.current) return;

    if (isReverseApply.current) {
      isReverseApply.current = false;
      return;
    }
    if (!isStructurallyComplete(value)) return;

    clearTimeout(applyTimer.current);
    applyTimer.current = setTimeout(() => {
      try {
        const result = dbmlToERD(value);
        lastParsedValue.current = value.replace(/\s+/g, ' ');
        applyingFromDBML.current = true;
        onApplyRef.current(result.nodes, result.edges, value);
        setTimeout(() => { applyingFromDBML.current = false; }, 0);
      } catch {
        // Diagnostics explain invalid DBML; invalid text is not applied to the canvas.
      }
    }, APPLY_DEBOUNCE_MS);

    return () => clearTimeout(applyTimer.current);
  }, [value]);

  useEffect(() => {
    if (nodes.length === 0) return;
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
        const otherExtras = previous.match(/^(Note|TableGroup)\s+\S[\s\S]*?\}/gm) || [];

        if (enumExtras.length || otherExtras.length) {
          const enumExtraText = enumExtras.map(enumBlock => enumBlock.trim()).join('\n\n');
          const otherExtraText = otherExtras.length
            ? '\n\n' + otherExtras.map(block => block.trim()).join('\n\n')
            : '';
          const refMatch = dbml.match(/^Ref:/m);

          if (refMatch && refMatch.index !== undefined) {
            const beforeRef = dbml.slice(0, refMatch.index).trimEnd();
            const refSection = dbml.slice(refMatch.index);
            const enumPart = enumExtraText ? '\n\n' + enumExtraText : '';
            dbml = beforeRef + enumPart + '\n\n' + refSection + otherExtraText + '\n';
          } else {
            const extras = [enumExtraText, ...otherExtras.map(block => block.trim())].filter(Boolean);
            dbml = dbml.trimEnd() + '\n\n' + extras.join('\n\n') + '\n';
          }
        }

        dbml = dedupeDBMLEnumBlocks(dbml);
        lastCanvasHash.current = canvasFingerprint(nodes, edges);
        if (dbml !== prevValue.current) {
          isReverseApply.current = true;
          onChangeRef.current(dbml, true);
        }
      } catch {
        // Reverse sync is best effort; the editor keeps the current valid text.
      } finally {
        generatingFromCanvas.current = false;
      }
    }, REVERSE_DEBOUNCE_MS);

    return () => clearTimeout(reverseTimer.current);
  }, [nodes, edges]);

  return (
    <div className="h-full flex flex-col">
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

      <div ref={containerRef} className="relative flex-1 min-h-0 overflow-hidden">
        <CodeMirror
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
            autocompletion: false,
          }}
          onCreateEditor={view => { editorViewRef.current = view; }}
          onChange={handleChange}
          onUpdate={handleEditorUpdate}
        />
        {suggestions.length > 0 && (
          <div
            role="listbox"
            aria-label="DBML suggestions"
            style={{ top: suggestionPosition.top, left: suggestionPosition.left }}
            className="absolute z-20 max-h-44 w-80 max-w-[calc(100%-1rem)] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
          >
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.label}-${index}`}
                type="button"
                role="option"
                aria-selected={index === selectedSuggestion}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-xs',
                  index === selectedSuggestion ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                )}
                onMouseDown={event => {
                  event.preventDefault();
                  applySuggestion(suggestion);
                }}
              >
                <span className="truncate font-mono">{suggestion.label}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{suggestion.detail || suggestion.type}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <DBMLReferenceDialog
        open={helpOpen}
        onOpenChange={setHelpOpen}
        resolvedTheme={resolvedTheme}
      />
    </div>
  );
}, (prev, next) =>
  prev.value === next.value &&
  prev.nodes === next.nodes &&
  prev.edges === next.edges
);
