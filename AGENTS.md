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
4. `NotesView` stores `pendingChange` with `originalContent` snapshot → opens `DiffPreviewModal`
5. User confirms → `handleConfirmChange`:
   - `marked.parse(content)` → HTML
   - `DOMPurify.sanitize(parsedContent)` → aman dari XSS
   - **Replace**: HTML langsung jadi newContent
   - **Append**: originalContent + `<br><hr><br>` + HTML
   - `await saveNote({...activeNote, content: newContent})` — **hanya 1 save**, tanpa `handleNoteChange`
   - Jika gagal → modal tetap terbuka, toast error
   - `confirmLockRef` mencegah double-click
6. Modal closes via `setPendingChange(null)`

### Safeguards (Applied Content)

- **`confirmLockRef`**: ref boolean mencegah double-click saat `saveNote` berjalan
- **`originalContent` snapshot**: diff preview dan logika append/use **content yang ditangkap saat modal dibuka**, bukan `activeNote.content` yang bisa berubah
- **`DOMPurify.sanitize`**: `marked.parse()` output disanitasi sebelum disimpan (cegah XSS)
- **Error toast**: jika `saveNote` return `false` atau throw, modal tetap terbuka + toast error
- **No streaming apply**: tombol Replace/Append tersembunyi saat `isStreaming` aktif

### Save Chain (Notes)

```
Editor onUpdate → onChange (NotesEditor.handleContentChange, INLINE no useCallback)
→ handleNoteChange (parent, debounced 800ms via useNoteChangeHandler)
→ saveNote → setNotes (immediate state sync) → IndexedDB (800ms) + cloud sync (1600ms)
```

Note: `saveNote` now directly calls `setNotes` to sync React state immediately after persist (src/hooks/useNotes.ts:258). The debounced `handleNoteChange` also calls `saveNote` — the state update is redundant but harmless.

### Selection Context for AI

- `TiptapEditor` fires `setSelectionText(text)` on `selectionUpdate`
- `selectionText` persisted in context (NOT cleared on blur, only on empty selection)
- When user sends message with active selection:
  - `sendMessage(content, selectionText)` stores `selection_text` on `AIChatMessage`
  - Persisted to DB via `selection_text` column (TEXT) di `ai_chat_messages`
  - API payload masih inline: `[Selected text: "..."]\nUser request: ...`
  - UI tampilkan quote `selection_text` (max 50 chars) di **bawah** bubble user message, terpisah
- `referenced_file_info` (JSONB) disediakan untuk relasi ke Notes/ERD/flowchart — BUKAN untuk teks seleksi

### Referenced File Info (JSONB)

- `ai_chat_sessions.entity_type + entity_uid` = entry point (file tempat chat dimulai)
- `ai_chat_sessions.referenced_file_info` = array of related files dalam satu workspace (cross-feature: Notes + ERD + Flowchart)
- Contoh: chat dimulai dari Notes di project EMPLOYMENT, AI butuh lihat ERD yang juga di project EMPLOYMENT → ERD tercatat di `referenced_file_info`
- Format: `[{ entity_type: "note"|"diagram"|"flowchart", entity_uid: "uuid" }]`

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
