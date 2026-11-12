import { Kbd } from "@/components/ui/kbd";

// macOS: modifiers in ⌃⌥⇧⌘ order without spaces; elsewhere: Ctrl+Shift+Key.
const keymaps = [
  { title: 'General', rows: [
    ['Sync pending changes', '⌘S', 'Ctrl+S'],
    ['Focus file search', '⌘K', 'Ctrl+K'],
    ['Open or close AI Assistant', '⌘J', 'Ctrl+J'],
    ['Open Settings (desktop)', '⌘,', 'Ctrl+,'],
  ] },
  { title: 'Notes', rows: [
    ['Bold', '⌘B', 'Ctrl+B'], ['Italic', '⌘I', 'Ctrl+I'], ['Underline', '⌘U', 'Ctrl+U'],
    ['Strikethrough', '⇧⌘S', 'Ctrl+Shift+S'], ['Inline code', '⌘E', 'Ctrl+E'],
    ['Heading 1–4', '⌥⌘1–4', 'Ctrl+Alt+1–4'], ['Bulleted list', '⇧⌘8', 'Ctrl+Shift+8'],
    ['Numbered list', '⇧⌘7', 'Ctrl+Shift+7'], ['Task list', '⇧⌘9', 'Ctrl+Shift+9'],
    ['Blockquote', '⇧⌘B', 'Ctrl+Shift+B'], ['Code block', '⌥⌘C', 'Ctrl+Alt+C'],
    ['Insert table', '⌥⌘T', 'Ctrl+Alt+T'], ['Toggle badge', '⌥⌘B', 'Ctrl+Alt+B'],
    ['Align left / center / right', '⇧⌘L / C / R', 'Ctrl+Shift+L / C / R'],
    ['Undo / redo', '⌘Z / ⌘Y', 'Ctrl+Z / Ctrl+Y'],
    ['Export note', '⇧⌘E', 'Ctrl+Shift+E'], ['Import note', '⇧⌘I', 'Ctrl+Shift+I'],
  ] },
  { title: 'ERD Builder', rows: [
    ['Open Explorer (tables and relationships)', '⇧⌘F', 'Ctrl+Shift+F'],
    ['Close the table editor', 'Esc', 'Esc'],
    ['Undo / redo', '⌘Z / ⇧⌘Z', 'Ctrl+Z / Ctrl+Y'],
    ['Add or remove from selection', '⌘-click', 'Ctrl+click'],
  ] },
  { title: 'Flowchart', rows: [
    ['Undo / redo', '⌘Z / ⇧⌘Z', 'Ctrl+Z / Ctrl+Shift+Z'],
    ['Delete selected node or edge', 'Delete / Backspace', 'Delete / Backspace'],
  ] },
];

const dbClientKeymaps = [
  ['Focus table search', '⌘P', 'Ctrl+P'],
  ['Toggle filters', '⌘F', 'Ctrl+F'],
  ['Refresh records', '⌘R', 'Ctrl+R'],
  ['Select all records', '⌘A', 'Ctrl+A'],
  ['Add or remove a record from selection', '⌘-click', 'Ctrl+click'],
  ['Save record or structure', '⌘S', 'Ctrl+S'],
  ['Run SQL query', '⌘Enter', 'Ctrl+Enter'],
  ['Format SQL query', '⌘I', 'Ctrl+I'],
  ['Cancel inline changes', 'Esc', 'Esc'],
];

export function KeymapTab() {
  const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.platform);
  const isDbClientAvailable = typeof window !== 'undefined' && (
    !!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__) ||
    (window as any).ERD_INSTALL_MODE === 'cli'
  );
  const sections = isDbClientAvailable
    ? [...keymaps, { title: 'DB Client', rows: dbClientKeymaps }]
    : keymaps;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Keymap</h2>
        <p className="mt-1 text-sm text-muted-foreground">Keyboard shortcuts available in ERD Builder Pro.</p>
      </div>

      {sections.map(({ title, rows }) => (
        <section key={title} className="overflow-hidden rounded-lg border border-border">
          <h3 className="border-b border-border bg-muted/40 px-4 py-2.5 text-sm font-medium">{title}</h3>
          <div className="divide-y divide-border">
            {rows.map(([action, mac, windows]) => (
              <div key={action} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-sm">
                <span>{action}</span>
                <Kbd className="h-6 px-2 text-xs">{isMac ? mac : windows}</Kbd>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="rounded-lg border border-border p-4 text-sm">
        <h3 className="font-medium">Drawings</h3>
        <p className="mt-1 text-muted-foreground">Drawings use Excalidraw’s built-in keymap. Open Help from its menu to view the shortcuts available for the current editor version.</p>
      </section>
    </div>
  );
}
