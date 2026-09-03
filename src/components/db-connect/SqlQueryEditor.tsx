import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql as sqlLang } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { Prec } from '@codemirror/state';
import { keymap, type EditorView, type ViewUpdate } from '@codemirror/view';
import { runnableSql } from './data-query-state';
import { buildSqlSuggestionSource, type SqlSuggestion } from './query-autocomplete';

type SqlQueryEditorProps = {
  value: string;
  tables: any[];
  resolvedTheme: 'light' | 'dark';
  editorRef: RefObject<EditorView | null>;
  onChange: (value: string) => void;
  onRun: (script: string) => void | Promise<void>;
  onBeautify: (script: string) => void;
};

const MAX_SUGGESTIONS = 8;
const SUGGESTION_MENU_HEIGHT = 176;
const SUGGESTION_MENU_WIDTH = 320;

export function SqlQueryEditor({ value, tables, resolvedTheme, editorRef, onChange, onRun, onBeautify }: SqlQueryEditorProps) {
  const suggestionSource = useMemo(() => buildSqlSuggestionSource(tables), [tables]);
  const basicSetup = useMemo(() => ({ autocompletion: false, lineNumbers: true }), []);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const suggestionsRef = useRef<SqlSuggestion[]>([]);
  const selectedIndexRef = useRef(0);
  const [suggestions, setSuggestions] = useState<SqlSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [suggestionPosition, setSuggestionPosition] = useState({ top: 16, left: 16 });

  useEffect(() => {
    suggestionsRef.current = suggestions;
  }, [suggestions]);

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  const updateSuggestionPosition = useCallback((view: EditorView, suggestionCount = suggestionsRef.current.length) => {
    if (!suggestionCount) return;
    const container = containerRef.current;
    const coords = view.coordsAtPos(view.state.selection.main.head);
    if (!container || !coords) return;

    const rect = container.getBoundingClientRect();
    const menuWidth = Math.min(SUGGESTION_MENU_WIDTH, Math.max(0, rect.width - 16));
    const menuHeight = Math.min(SUGGESTION_MENU_HEIGHT, suggestionCount * 30 + 8);
    const left = Math.max(8, Math.min(coords.left - rect.left, rect.width - menuWidth - 8));
    const belowTop = coords.bottom - rect.top + 4;
    const aboveTop = coords.top - rect.top - menuHeight - 4;
    const hasRoomBelow = rect.bottom - coords.bottom >= menuHeight + 8;

    setSuggestionPosition({
      left,
      top: hasRoomBelow || coords.top - rect.top <= menuHeight + 8 ? belowTop : aboveTop,
    });
  }, []);

  const applySuggestion = useCallback((suggestion: SqlSuggestion) => {
    const view = editorRef.current;
    if (!view) return;

    const cursor = view.state.selection.main.head;
    const word = view.state.sliceDoc(0, cursor).match(/[\w.]+$/);
    if (!word) return;

    const replacement = suggestion.apply || suggestion.label;
    const from = cursor - word[0].length;
    view.dispatch({
      changes: { from, to: cursor, insert: replacement },
      selection: { anchor: from + replacement.length },
    });
    suggestionsRef.current = [];
    setSuggestions([]);
    view.focus();
  }, [editorRef]);

  const handleChange = useCallback((text: string, viewUpdate: ViewUpdate) => {
    onChange(text);
    const cursor = viewUpdate.state.selection.main.head;
    const next = suggestionSource(text, cursor, MAX_SUGGESTIONS);
    suggestionsRef.current = next;
    selectedIndexRef.current = 0;
    setSuggestions(next);
    setSelectedIndex(0);
    if (next.length) updateSuggestionPosition(viewUpdate.view, next.length);
  }, [onChange, suggestionSource, updateSuggestionPosition]);

  const handleEditorUpdate = useCallback((viewUpdate: ViewUpdate) => {
    if (viewUpdate.focusChanged && !viewUpdate.view.hasFocus) {
      suggestionsRef.current = [];
      setSuggestions([]);
      return;
    }
    if (suggestionsRef.current.length) updateSuggestionPosition(viewUpdate.view);
  }, [updateSuggestionPosition]);

  const editorExtensions = useMemo(() => [
    sqlLang(),
    Prec.highest(keymap.of([
      {
        key: 'ArrowDown',
        run: () => {
          if (!suggestionsRef.current.length) return false;
          const next = Math.min(selectedIndexRef.current + 1, suggestionsRef.current.length - 1);
          selectedIndexRef.current = next;
          setSelectedIndex(next);
          return true;
        },
      },
      {
        key: 'ArrowUp',
        run: () => {
          if (!suggestionsRef.current.length) return false;
          const next = Math.max(selectedIndexRef.current - 1, 0);
          selectedIndexRef.current = next;
          setSelectedIndex(next);
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
      {
        key: 'Enter',
        run: () => {
          const suggestion = suggestionsRef.current[selectedIndexRef.current];
          if (!suggestion) return false;
          applySuggestion(suggestion);
          return true;
        },
      },
      {
        key: 'Tab',
        run: () => {
          const suggestion = suggestionsRef.current[selectedIndexRef.current];
          if (!suggestion) return false;
          applySuggestion(suggestion);
          return true;
        },
      },
      {
        key: 'Mod-Enter',
        run: view => {
          void onRun(runnableSql(view, ''));
          return true;
        },
      },
      {
        key: 'Mod-i',
        run: view => {
          onBeautify(view.state.doc.toString());
          return true;
        },
      },
    ])),
  ], [applySuggestion, onBeautify, onRun]);

  return (
    <div ref={containerRef} className="relative h-full">
      <CodeMirror
        value={value}
        height="100%"
        theme={resolvedTheme === 'dark' ? oneDark : undefined}
        basicSetup={basicSetup}
        extensions={editorExtensions}
        onCreateEditor={view => { editorRef.current = view; }}
        onChange={handleChange}
        onUpdate={handleEditorUpdate}
        className="h-full text-sm"
      />
      {suggestions.length > 0 && (
        <div
          role="listbox"
          aria-label="SQL suggestions"
          style={{ top: suggestionPosition.top, left: suggestionPosition.left }}
          className="absolute z-20 max-h-44 w-80 max-w-[calc(100%-1rem)] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.label}-${index}`}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              className={`flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-xs ${index === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'}`}
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
  );
}
