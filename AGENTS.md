# ERD Builder Pro — Agent Memory

## Project Overview

ERD Builder Pro — React 18 + Vite 6 + Express.js. Frontend uses Tailwind CSS v4, `react-router-dom` v7 for routing, Supabase (Postgres) for persistence, Cloudflare R2 for asset storage.

## State Management

- **WorkspaceContext** (`src/providers/WorkspaceContext.tsx`): global app state (auth, documents, active IDs, XYFlow, undo/redo, panels)
- **AIActionContext** (`src/contexts/AIActionContext.tsx`): AI assistant actions, `selectionText`, `registerContentHandler`/`applyContent` for `replace`/`append` strategies

## Key Patterns

### AI → Content Application Flow

1. AI response generated in `AIChatPanel`
2. User clicks Replace All or Append button → `applyContent(content, strategy)`
3. Context calls `contentHandler` registered by active view (e.g. `NotesView`)
4. `NotesView` stores `pendingChange` → opens `DiffPreviewModal`
5. User confirms → `handleConfirmChange`:
   - `marked.parse(content)` → HTML
   - **Replace**: HTML langsung jadi newContent
   - **Append**: currentContent + `<br><hr><br>` + HTML
6. `handleNoteChange(newContent)` + `saveNote({...activeNote, content: newContent})`
7. Modal closes via `setPendingChange(null)`

### Save Chain (Notes)

```
Editor onUpdate → onChange (NotesEditor.handleContentChange, INLINE no useCallback)
→ handleNoteChange (parent, debounced 800ms via useNoteChangeHandler)
→ saveNote → IndexedDB (800ms) + cloud sync (1600ms)
```

### Selection Context for AI

- `TiptapEditor` fires `setSelectionText(text)` on `selectionUpdate`
- `selectionText` persisted in context (NOT cleared on blur, only on empty selection)
- Used in `AIChatPanel` for "Active Selection" display and `sendMessage(input, selectionText)` inline context

### Editor Architecture

- `TiptapEditor` (`src/components/TiptapEditor.tsx`) — core rich text editor with StarterKit, tables, images, task lists, links, slash menu
- Wrapped by `NotesEditor` (thin pass-through) → used in `NotesView`
- `NotesView` connects editor to parent `WorkspaceProvider` via `handleNoteChange` prop

## Removed Features

- **Replace Selected** — removed entirely (context: `selectionRange`, `setSelectionRange`, `replaceSelectedText`, `registerReplaceSelected`; UI: Scissors button in AIChatPanel; handler in TiptapEditor/NotesView). The `insertContentAt` + `marked.parse` combo failed because `marked.parse` wraps in `<p>` (block) which can't be inserted inline — schema rejects nested paragraphs.

## Notable Conventions

- `onChange` handler in `NotesEditor` defined **inline** (no `useCallback`), causing TiptapEditor's `handleUpdate` effect to re-register every render. This is intentional but fragile.
- `handleNoteChange` stable via `useCallback` in `useNoteChangeHandler`
- Strategy type: `'replace' | 'append'`
- `selectionText` is single source of truth — passed as argument to `sendMessage()` (not closed over)
- React.memo on NotesView
