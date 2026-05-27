# ERD Builder Pro — Agent Memory

## Project Overview

ERD Builder Pro — React 18 + Vite 6 + Express.js. Frontend uses Tailwind CSS v4, `react-router-dom` v7 for routing, Supabase (Postgres) for persistence, Cloudflare R2 for asset storage.

## State Management

- **WorkspaceContext** ([`src/providers/WorkspaceContext.tsx`](./src/providers/WorkspaceContext.tsx)): global app state (auth, documents, active IDs, XYFlow, undo/redo, panels)
- **AIActionContext** ([`src/contexts/AIActionContext.tsx`](./src/contexts/AIActionContext.tsx)): AI assistant actions, `selectionText`, `registerContentHandler`/`applyContent` for `replace`/`append` strategies

## Key Patterns

### AI → Content Application Flow

1. AI response generated in `AIChatPanel`
2. User clicks Replace All or Append button → `applyContent(content, strategy)`
3. Context calls `contentHandler` registered by active view (e.g. `NotesView`)
4. `NotesView` stores `pendingChange` with `originalContent` snapshot → opens `DiffPreviewModal`
5. User confirms → `handleConfirmChange`:
   - `marked.parse(content)` → HTML
   - `DOMPurify.sanitize(parsedContent)` → XSS-safe
   - **Replace**: HTML becomes newContent directly
   - **Append**: originalContent + `<br><hr><br>` + HTML
   - `handleNoteChange(newContent)` → debounced save + state update
   - `await saveNote({...activeNote, content: newContent})` — **immediate persist** + `setNotes` state sync
   - If it fails → modal stays open, error toast shown
   - `confirmLockRef` prevents double-click
6. Modal closes via `setPendingChange(null)`

### Safeguards (Applied Content)

- **`confirmLockRef`**: boolean ref prevents double-click while `saveNote` is in progress
- **`originalContent` snapshot**: diff preview and append logic use **content captured when modal opened**, not live `activeNote.content` (which may change)
- **`DOMPurify.sanitize`**: `marked.parse()` output is sanitized before saving (prevents XSS)
- **Error toast**: if `saveNote` returns `false` or throws, modal stays open + toast error
- **No streaming apply**: Replace/Append buttons hidden while `isStreaming` is active

### Save Chain (Notes)

```
Editor onUpdate → onChange (NotesEditor.handleContentChange, INLINE no useCallback)
→ handleNoteChange (parent, debounced 800ms via useNoteChangeHandler)
→ saveNote → setNotes (immediate state sync) → IndexedDB (800ms) + cloud sync (1600ms)
```

Note: `saveNote` now directly calls `setNotes` to sync React state immediately after persist ([`src/hooks/useNotes.ts`](./src/hooks/useNotes.ts):258). The debounced `handleNoteChange` also calls `saveNote` — the state update is redundant but harmless.

### Selection Context for AI

- `TiptapEditor` fires `setSelectionText(text)` on `selectionUpdate`
- `selectionText` persisted in context (NOT cleared on blur, only on empty selection)
- When user sends message with active selection:
  - `sendMessage(content, selectionText)` stores `selection_text` on `AIChatMessage`
  - Persisted to DB via `selection_text` column (TEXT) on `ai_chat_messages`
  - API payload still inline: `[Selected text: "..."]\nUser request: ...`
  - UI shows `selection_text` quote (max 50 chars) **below** user message bubble, visually separated
- **ERD multi-select**: `selectionText` includes full column details (name, type, PK, nullable) for each table, e.g. `Tables: users (id: BIGINT PK, name: VARCHAR(255)); admins (id: BIGINT, user_id: BIGINT, role: VARCHAR(255), name: VARCHAR(255) NOT NULL)` — AI sees live column data directly in user message, not just system context
- SelectionBar shows count badge (e.g. "2 tables") parsed from `Tables:` pattern by counting `); ` separators
- `referenced_file_info` (JSONB) is for cross-feature links (Notes/ERD/flowchart) — NOT for selection text

### Cross-Feature Context: `project_id` (Filter OR untuk Orphan Sessions)

- **Keputusan arsitektur**: Gunakan `project_id` (FK ke `projects`) di `ai_chat_sessions` sebagai sumber kebenaran, **bukan** `referenced_file_info` (JSONB).
- **Kenapa**: `referenced_file_info` adalah cache yang cepat stale (file dihapus/dipindah → referensi tidak valid). Dengan `project_id`, query dinamis semua file per project dilakukan setiap `sendMessage()` — selalu fresh, zero maintenance.
- **Saat ini**: `createSession()` di `useAIChat.ts` menyertakan `project_id` jika file punya workspace, plus `entity_type` + `entity_uid` sebagai origin file identifier.
- **Orphan session handling**: `listSessions` di `useAIChat.ts` menggunakan filter OR: `(project_id = X OR (project_id IS NULL AND entity_type = ? AND entity_uid = ?))` — session dengan `project_id` tampil di semua file project, session `NULL` tetap private ke file asalnya.
- **Workspace safety**: `project_id` diisi dari active entity saat session dibuat. Saat user pindah project, `entityContext` berubah → session baru mendapat `project_id` baru. Session lama tetap di project_id lama.
- Dynamic sibling query: `buildSiblingContext()` parallel 4 tabel, greedy budget 6000 chars.

### Dynamic `project_id` Sync pada `sendMessage`

Setiap kali user mengirim pesan di AI Chat, `sendMessage` di `useAIChat.ts` melakukan:

1. **Baca `project_id` file aktif** dari `projectIdRef.current` (ref yang selalu sync dengan prop `projectId` dari AppLayout)
2. **Bandingkan** dengan `currentSession.project_id`
3. **Jika berbeda**, update session di Supabase:
   - `UPDATE ai_chat_sessions SET project_id = $1, updated_at = NOW() WHERE id = $2`
   - Sync state lokal (`setCurrentSession`, `setSessions`)
4. **Gunakan `liveProjectId`** (bukan `currentSession.project_id`) untuk `buildSiblingContext` — jika `null`, sibling context tidak di-inject

**3 skenario yang ter-handle:**
- **File pindah project A → B**: session.project_id jadi B → sibling context query project B
- **File pindah ke uncategorized (NULL)**: session.project_id jadi NULL → sibling context skip
- **Session private (NULL) masuk workspace**: session.project_id jadi WORKSPACE → sibling context aktif

**Mengapa pakai ref**: `sendMessage` adalah `useCallback` dengan deps terbatas (`currentSession`, `messages`, `entityContextText`, `entityContext`). `projectId` tidak bisa jadi dep karena akan re-create callback setiap file pindah project. Ref (`projectIdRef`) memutus dependency chain — nilainya selalu terbaca fresh di dalam callback tanpa perlu re-create.

**File**: [`src/hooks/useAIChat.ts`](./src/hooks/useAIChat.ts):70-71 (ref + effect), :427-444 (sync logic), :450 (sibling context menggunakan `liveProjectId`)

### AI Chat @Mentions (File Referencing)

- User types `@` in ChatInput textarea → dropdown shows files from same project (notes, diagrams, flowcharts, drawings)
- Dropdown filterable by typing after `@`; keyboard navigable (↑↓ Enter Tab Escape)
- On mention select, `@FileName` text inserted at cursor position via textarea ref manipulation
- On send (`AIChatPanel.handleSend`), message text scanned for `@FileName` patterns via `/@([^\s\n]+)/g`
- File lookup by case-insensitive name match in `mentionFiles` (built from workspace arrays filtered by `projectId`)
- Content resolved per type: **Note** from local state or Supabase fetch, **Flowchart** from `fc.data`, **Diagram** title-only, **Drawing** from `dw.data`
- Content truncated to 2000 chars per file; HTML stripped; injected as `[Referenced file "{name}" ({type})]:\n{content}\n\n` prefix to user message
- `@FileName` stays visible in chat message text (raw mention preserved in DB)
- Cursor position for dropdown measured by cloning textarea styles into a temporary div
- Dropdown positioned absolutely relative to textarea; auto-closes on ESC or blur
- **Key files**: `ChatInput.tsx` (mention UI), `AIChatPanel.tsx` (resolveMentions + mentionFiles), `AppLayout.tsx` (passes `notes`/`diagrams`/`flowcharts`/`drawings` as props)

### Editor Architecture

- `TiptapEditor` ([`src/components/TiptapEditor.tsx`](./src/components/TiptapEditor.tsx)) — core rich text editor with StarterKit, tables, images, task lists, links, slash menu
- Wrapped by `NotesEditor` (thin pass-through) → used in `NotesView`
- `NotesView` connects editor to parent `WorkspaceProvider` via `handleNoteChange` prop

## RenameDocumentDialog Project Sync

- `RenameDocumentDialog` uses `selectedProjectId` (from parent `renameProjectId`) for the `<Select>` value
- **Bug**: `selectedProjectId` and `activeDocument` can desync — parent computes `renameProjectId` separately from the document lookup used for `activeDocument` prop
- **Fix**: `useEffect` in `RenameDocumentDialog.tsx:77` syncs `selectedProjectId` from `activeDocument` when `isOpen` becomes `true`:
  ```tsx
  useEffect(() => {
    if (isOpen && !isCreate && activeDocument) {
      const pid = activeDocument?.project_id ?? activeDocument?.projectId;
      setSelectedProjectId(pid != null ? String(pid) : 'none');
    }
  }, [isOpen]);
  ```
- Deps = `[isOpen]` intentionally — effect only fires on dialog open/close, not on `activeDocument` changes while open (preserves user selection mid-edit)
- Both Edit and Create dialog instances in `AppLayout.tsx` share the same `renameProjectId`/`setRenameProjectId` state

## Removed Features

- **Replace Selected** — removed entirely (context: `selectionRange`, `setSelectionRange`, `replaceSelectedText`, `registerReplaceSelected`; UI: Scissors button in AIChatPanel; handler in TiptapEditor/NotesView). The `insertContentAt` + `marked.parse` combo failed because `marked.parse` wraps in `<p>` (block) which can't be inserted inline — schema rejects nested paragraphs.
- **`applyColorScheme`** — removed from `flowchartActions.ts`. Fungsi mapping label → hex color tidak pernah di-wire ke action apapun dan dianggap tidak sesuai best practice (warna tidak boleh dipaksakan per label oleh AI).

## Notable Conventions

- `onChange` handler in `NotesEditor` defined **inline** (no `useCallback`), causing TiptapEditor's `handleUpdate` effect to re-register every render. This is intentional but fragile.
- `handleNoteChange` stable via `useCallback` in `useNoteChangeHandler`
- `registerContentHandler(handler, strategies?)` — second param is supported `('replace' | 'append')[]`, defaults to `['replace', 'append']`
- `contentHandlerStrategies` exposed via `useAIAction()` — AIChatPanel checks this to show/hide Replace vs Append buttons
- Strategy type: `'replace' | 'append'`
- `selectionText` is single source of truth — passed as argument to `sendMessage()` (not closed over)
- `cleanIdentifier()` (local to `erdActions.ts`): strips backticks/quotes/brackets from SQL identifiers, e.g. `` `users` `` → `users`
- React.memo on NotesView
- **Auto-update AGENTS.md**: after completing any feature/improvement/fix, proactively update this file with relevant new patterns, components, and mechanisms — no need to wait for user to ask

## UUID vs Numeric ID (Delete/Restore)

All document types (flowchart, notes, drawings, erd/diagram) have hooks with `delete*`, `restore*`, and `delete*Permanent` functions that accept a `uid: string` parameter.

### The Bug Pattern
- `MoveToTrashAlert.handleConfirm` passes `activeDocument?.uid ?? activeDocument?.id` for flowchart/drawings, but **only `activeDocument?.id`** for erd and notes (numeric).
- API endpoints (`/api/notes/{id}/restore`, etc.) expect UUID strings, not numeric IDs.
- PostgreSQL rejects `invalid input syntax for type uuid: "3"`.

### The Fix Pattern
Every `delete*`/`restore*`/`delete*Permanent` function now:
1. Looks up the resource using **dual-field matching**: `*Ref.current.find(d => String(d.id) === String(uid) || String(d.uid) === String(uid))` — checks both `id` and `uid` to handle numeric callers, unlike the old `String(d.uid ?? d.id) === String(uid)` which fails when `uid` exists (UUID) but `id` parameter is numeric
2. Uses `identifier = resource?.uid || uid` for the API URL
3. Falls back to the raw `uid` parameter if lookup fails (graceful degeneration)

### Consistent filter pattern
State filters use dual-field matching: `String(n.id) !== String(uid) && String(n.uid) !== String(uid)` instead of `String(n.uid ?? n.id) !== uid` — the old pattern fails when `uid` is numeric but `n.uid` exists.

### Total decrement
Every `delete*` function must call `set*Total(prev => Math.max(0, prev - 1))` in both guest and API branches. This fixes the stale count bug after deletion.

### Files with this fix
- [`src/hooks/useFlowcharts.ts`](./src/hooks/useFlowcharts.ts): `matchesFlowchartId` helper — `String(f.uid ?? f.id)` → `String(f.id) || String(f.uid)` dual check
- [`src/hooks/useDiagrams.ts`](./src/hooks/useDiagrams.ts): all `diagramsRef.find` lookups — `String(d.id) || String(d.uid)` dual check (was `d.id` only or `String(d.uid ?? d.id)`)
- [`src/hooks/useNotes.ts`](./src/hooks/useNotes.ts): all lookups and state filters — `String(n.id) || String(n.uid)` dual check. Additionally, `saveNote` guard updated from `!note.id` to `!note.id && !note.uid` (falling back to `note.uid` for local storage draft saving when `id` is not present), resolving confirm-save failures during AI content application (Replace/Append) in `NotesView`.
- [`src/hooks/useDrawings.ts`](./src/hooks/useDrawings.ts): `matchesDrawingId` helper + all inline lookups/filters — `String(d.id) || String(d.uid)` dual check
- [`src/hooks/useAppMetadata.ts`](./src/hooks/useAppMetadata.ts): `activeDocument`, `initialShareSettings`, `activeDrawing` lookups — dual check
- [`src/hooks/useAutoSave.ts`](./src/hooks/useAutoSave.ts), `useFlowchartChangeHandler.ts`, `useDrawingChangeHandler.ts`, `useFocusSync.ts`: all `String(d.uid ?? d.id)` → dual check
- [`src/routes/TableRoute.tsx`](./src/routes/TableRoute.tsx): `makeDeleteHandler` — sets `setTableDeleteDoc(item)` so MoveToTrashAlert gets the correct `activeDocument`
- [`src/hooks/useTrashHandlers.ts`](./src/hooks/useTrashHandlers.ts): `handleTrashRestoreDiagram` fixed to use `file.uid ?? file.id` (was `file.id` only)
- [`src/components/modals/MoveToTrashAlert.tsx`](./src/components/modals/MoveToTrashAlert.tsx): `handleConfirm` — added `'erd'` and `'notes'` to UUID-first extraction (`activeDocument?.uid ?? activeDocument?.id`), was only for flowchart/drawings

### Stale Table List After Delete (Pagination Refresh)
After a Move-to-Trash, the table list shows stale data (missing/empty slots) because `delete*` functions only mutate local state — they don't re-fetch the current page from the server. The previous fix (`onAfterDelete` → `handleViewChange`) only navigates to `/table/<view>`, which is a no-op when already on page 1.

**Fix**: `tableRefreshKey` — a counter in `WorkspaceContext` that increments after delete, triggering `useTableViewPagination` effects to re-fetch:
1. `onAfterDelete` in `AppLayout.tsx` calls `triggerTableRefresh()` after `handleViewChange`
2. `triggerTableRefresh` increments `tableRefreshKey` in `WorkspaceProvider`
3. `useTableViewPagination` has `tableRefreshKey` in all 4 `useEffect` dependency arrays — whenever it changes, the current page is re-fetched from the server
4. This ensures the correct data fills the gap left by the deletion

**Loading spinner optimization**: Default fetch tetap `{ silent: true }` (tidak ada loading spinner untuk passive changes: search debounce, auth change, project list change, dll). User-initiated actions (delete, page change, workspace filter) set `tableLoadingState='loading'` di context, membuat `useTableViewPagination` panggil fetch tanpa `silent` — table show spinner, setelah fetch selesai `tableLoadingState` di-reset ke `'idle'`.
- `delete`: via `onAfterDelete` di `AppLayout.tsx` → `setTableLoadingState('loading')` + `triggerTableRefresh()`
- `page change`: via `handlePageChange` di `TableRoute.tsx` → `setTableLoadingState('loading')` + `setTableSearchParams()`
- `workspace filter`: via `handleWorkspaceClick` di `TableRoute.tsx` → `setTableLoadingState('loading')` + `setTableSearchParams()`

**Files involved**:
- [`src/providers/WorkspaceContext.tsx`](./src/providers/WorkspaceContext.tsx): added `triggerTableRefresh: () => void`, `tableLoadingState`, `setTableLoadingState` to interface; added `isDiagramsLoading`, `isNotesLoading`, `isDrawingsLoading`, `isFlowchartsLoading` to interface
- [`src/providers/WorkspaceProvider.tsx`](./src/providers/WorkspaceProvider.tsx): added `tableRefreshKey` state + `triggerTableRefresh` callback; added `tableLoadingState` state + `setTableLoadingState`; passed to context value and `useTableViewPagination`; exposed per-feature loading states in context value
- [`src/hooks/useTableViewPagination.ts`](./src/hooks/useTableViewPagination.ts): uses `tableLoadingState` to decide silent vs non-silent fetch; resets to `'idle'` after fetch completes
- [`src/routes/AppLayout.tsx`](./src/routes/AppLayout.tsx): added `setTableLoadingState('loading')` call in `onAfterDelete`
- [`src/routes/TableRoute.tsx`](./src/routes/TableRoute.tsx): added `setTableLoadingState('loading')` on page/workspace change; passes loading state as `isLoading` prop

## AI Context for Notes (markdown-aware)

- `entityContextText` for Notes is sent to AI in **markdown format**, not plain text
- Uses `getMarkdownFromHtml()` from [`src/lib/markdownUtils.ts`](./src/lib/markdownUtils.ts) (TurndownService)
- `<h2>Heading</h2>` → `## Heading`, AI sees heading structure → responds in markdown → `marked.parse()` produces correct `<h2>`
- Applies to all AI actions (Improve Grammar, Summarize, etc.) and direct chat

## AIChatPanel Component Architecture

`AIChatPanel.tsx` (~358 lines) was refactored from a monolithic 833-line component into an orchestrator that delegates to extracted sub-components:

```
src/components/ai/
├── AIChatPanel.tsx      (358 loc) — orchestrator: state, effects, layout
├── ChatMessages.tsx     (277 loc) — message list + scroll effects + expand/copy
├── ChatInput.tsx        (124 loc) — textarea + send + AI Actions radio toggle pills
├── CodeBlock.tsx         (48 loc) — Prism syntax highlighting + copy button
├── SessionItem.tsx       (32 loc) — session row in sidebar
├── SelectionBar.tsx      (28 loc) — active selection indicator bar
└── MinimizedBar.tsx      (22 loc) — floating pill when panel is minimized
```

### Component Responsibilities

- **AIChatPanel**: owns sessions/input state, `activeActionId`/`activeActionPrompt` for hidden system prompt, draft save/restore, click-outside minimize, auto-fill prompt from AI actions, pendingAction stream callback. Prepends system prompt with `---SYSTEM_PROMPT---` marker on send. Renders header + sub-components.
- **ChatMessages**: fully self-contained — owns `scrollContainerRef`, `messagesEndRef`, `userScrolledUpRef` for auto-scroll, `expandedMessages` (Set<string | number>) for collapse/expand, `copiedMsgId` for copy feedback, `isSystemExpanded` for collapsible system prompt. Detects `---SYSTEM_PROMPT---` marker to show/hide context. Floating scroll-to-bottom FAB (appears when >60px from bottom). Exposes `scrollToBottom` via `forwardRef` + `useImperativeHandle`.
- **ChatInput**: receives `input`, `isStreaming`, `activeActionId`, `activeAction` config, ref. Renders textarea + send + **radio toggle pills** for action modes (one active at a time, like radio buttons) + stop button. Each pill has a `HoverCard` showing action description. Dynamic placeholder changes per active action. `getActionIcon` helper maps action IDs to Lucide icons.
- **CodeBlock**: receives `language`, `value`, `copyToClipboard`. Renders Prism-highlighted code with language label and copy button.
- **SessionItem**: receives `session`, `isActive`, `onClick`, `onDelete`. Renders session title row with delete button.
- **SelectionBar**: receives `hasActiveSession`, `selectionText`, `onClear`. Renders active selection chip with X button.
- **MinimizedBar**: receives `title`, `onExpand`. Renders floating sparkle pill.

### Key Changes

- `DRAFT_KEY_PREFIX` and `getDraftKey()` remain in `AIChatPanel.tsx` — draft is saved only on close via `handleClose` (no more per-keystroke `useEffect`). Restore on mount preserved.
- `error` variable from `useAIChat` no longer destructured in AIChatPanel (unused).
- All imported from [`src/components/ai/`](./src/components/ai/) subdirectory; Prism imports (`prismjs/components/prism-sql`, etc.) moved into `ChatMessages.tsx` where `ReactMarkdown` + `CodeBlock` are used.
- `chatContainerRef` / `scrollContainerRef` naming: `ChatMessages` uses `scrollContainerRef` internally (same DOM element, renamed for clarity).

### Auto-hide Apply Buttons

- `contentCheckType` prop on `ChatMessages`: `'flowchart'` | `'erd'` | `'none'` (computed from `entityType` in AIChatPanel)
- When `contentCheckType === 'flowchart'`, Replace/Append buttons only render if `hasFlowchartJSON(content)` returns true (message contains JSON with `nodes` array)
- When `contentCheckType === 'erd'`, Replace/Append buttons only render if `hasSQLContent(content)` returns true (message contains SQL DDL — `CREATE TABLE`, `ALTER TABLE`, `INSERT INTO`)
- When `contentCheckType === 'none'` (notes, etc.), buttons always render
- **Copy button always visible** — rendered outside the content-check conditional, so it appears on every message regardless of content type

## User Message Collapse

- User messages longer than **>300 characters** are auto-collapsed (line-clamp-6)
- **"Show more"** / **"Show less"** button toggles per-message
- State tracked via `expandedMessages: Set<string | number>` in `ChatMessages.tsx` (internal state)

## Message Overflow Handling

- Message bubble (`ChatMessages.tsx:148`) has `overflow-x-auto` + **`w-full`** — `items-start`/`items-end` parent otherwise sizes bubble to content width, causing wide content to overflow the 85% cap and get clipped by `overflow-x-hidden`; `w-full` forces bubble to fill container width, so `overflow-x-auto` properly activates
- Bubble parent (`ChatMessages.tsx:146`) has `max-w-[85%]` + **`min-w-0`** — critical flexbox fix allowing the flex item to shrink below its intrinsic content width, so `max-w-[85%]` is respected
- Scroll container (`ChatMessages.tsx:87`) has `overflow-x-hidden` as a safety measure to prevent any element from creating a page-level horizontal scrollbar
- Code blocks (`CodeBlock.tsx`) have their own `overflow-x-auto` wrapper; language-labeled blocks use `white-space: pre-wrap` (wrap), unlabeled blocks (ASCII art) use `white-space: pre` (no wrap + scrollbar)
- Applies to both user and assistant messages

## Auto-scroll Behavior

- Auto-scroll to bottom on new messages only if user hasn't manually scrolled up
- `userScrolledUpRef` tracks manual scroll with 50px threshold from bottom
- `scrollContainerRef` in `ChatMessages.tsx` for scroll event listener

## Markdown Tables in Chat

- AI chat messages use `ReactMarkdown` with `remarkGfm` plugin for GFM support (tables, strikethrough, etc.)
- Tables render as standard HTML `<table>`, styled with Tailwind border/dark classes

## Code Blocks (Prism)

- AI chat responses use `ReactMarkdown` with custom `CodeBlock` component for fenced code blocks
- Syntax highlighting via `prismjs` + `prism-themes/themes/prism-dracula.css` (imported in `index.css:8`)
- Supported languages: sql, javascript, typescript, bash, json (imported in `ChatMessages.tsx`)
- Code blocks render with dark background (`#0d1117`), language label bar, copy button on hover
- **Fenced code blocks without language** (e.g. ` ``` ` with no specifier for ASCII art) now also render as `CodeBlock` — previously fell through to inline `<code>`, causing horizontal overflow
- **Language-labeled blocks** (` ```sql `, ` ```js `, etc.) → `white-space: pre-wrap` + `word-break: break-word` (wrap text normally)
- **Unlabeled blocks** (plain ` ``` `, ASCII art) → `white-space: pre` (no wrap, formatting preserved, horizontal scrollbar via wrapper's `overflow-x-auto`)
- Inline code (backticks) uses `bg-black/30 px-1 py-0.5 rounded text-[11px]` styling
- Code block wrapper has `overflow-x-auto` + `custom-scrollbar` as fallback for extremely long unbreakable content

## Action Mode (Radio Buttons + Hidden System Prompt)

### Radio-style Action Buttons
- ChatInput uses **radio toggle pills** instead of dropdown — each action is a pill button with Lucide icon
- Clicking a pill activates it (one active at a time, like radio buttons)
- Each pill has a `HoverCard` showing action description on hover
- `getActionIcon` maps action IDs to icons: `Wand2` (generate), `FileText` (explain), `Code` (pseudocode), `GitBranch` (insert), `FileDown` (import)

### Hidden System Prompt
- `activeActionId` + `activeActionPrompt` state in AIChatPanel (local state)
- System prompt stored in background — user only sees/edits their own instruction
- On send, combined message format: `{userText}\n\n---SYSTEM_PROMPT---\n{systemPrompt}`
- `activeActionId` cleared after send; `lastActionId` passed to view content handler for action-specific processing
- No more system prompt indicator bar in the UI

### Collapsible System Prompt in Chat Bubble
- `ChatMessages` detects `---SYSTEM_PROMPT---` marker in message content
- Shows user text normally + `▶ Show context` toggle button
- Clicking expands to show the hidden system prompt portion
- State tracked via `isSystemExpanded` (internal state in ChatMessages)

### Dynamic Placeholder
- Textarea placeholder changes per active action:
  - Generic/ask: "Ask anything..."
  - Explain: "Ask about this flowchart..."
  - Pseudocode: "Describe what to generate..."
  - Insert: "Describe where to insert a symbol..."
  - Import: "Describe the flowchart to create..."

### Floating Scroll-to-Bottom Button
- Absolute-positioned FAB outside scroll container
- Semi-transparent, appears when user scrolls >60px from bottom
- Clicking scrolls to bottom smoothly
- Hidden when already at bottom

## Retry on Failed AI Call

- **"Resend"** button appears below the last user message when AI response fails
- Condition: last message is a user message, `isStreaming` is false, and no assistant message follows
- Clicking Resend re-sends the same content with the original `selection_text`

## AI Action Content Strategy

- `applyContent()` and `registerContentHandler()` now accept optional `actionId` parameter
- `NotesView.handleConfirmChange` uses `applyToNoteContent()` from `notesActions.ts` when `actionId` is present:
  - `notes-improve-grammar` → replace full content
  - `notes-summarize` → append with `## Summary` header
  - `notes-generate-docs` → append with `## Documentation` header
- Generic strategy (`replace`/`append` buttons) is used when no `actionId`
- `lastActionId` tracked in AIChatPanel (local state), cleared on each message send
- Context: [`src/contexts/AIActionContext.tsx`](./src/contexts/AIActionContext.tsx), [`src/components/ai/actions/notesActions.ts`](./src/components/ai/actions/notesActions.ts)

## Confirm Save Loading State

- `isSaving` state in NotesView, passed to DiffPreviewModal
- Confirm button shows spinner + "Saving..." while `saveNote` is in progress
- Cancel button disabled during save
- Prevents double-click and gives visual feedback

## Guest Mode

- Guest user: `user = { id: 'guest', email: 'guest@local', name: 'Guest User' }`, `isGuest = true`
- Guest data sourced from **IndexedDB** (`localPersistence`), not from API/Supabase
- All `fetch*` functions in hooks have an `if (isGuest)` branch that reads from `localPersistence` and returns early
- **Critical pattern**: every guest early return MUST call `setIsLoading(false)` before `return;` — otherwise loading spinner hangs forever
- Settings menu (`NavUser`) hidden when `isGuest === true` (checked in `nav-user.tsx` via `WorkspaceContext.isGuest`)
- AI settings not loaded for guest (`useAISettings.ts` skips `fetchData` entirely)
- AI Chat still functional in Guest Mode (routed to local persistence)
- Hooks fixed for guest loading (all follow same pattern — `setIsLoading(false)` before guest return):
  - `useNotes.ts:66`
  - `useDiagrams.ts:67`
  - `useDrawings.ts:68`
  - `useFlowcharts.ts:74`
  - `useProjects.ts:60`
  - `useTrash.ts:40`
  - `useAISettings.ts:28-29`
- Composite `isLoading` in `WorkspaceProvider.tsx:841` = `isDiagramsLoading || isNotesLoading || isDrawingsLoading || isFlowchartsLoading || isProjectsLoading`

## ERD Architecture

### Data Structures
- **Entity**: `{ id, name, x, y, color, columns: Column[] }` — node data stored in React Flow `Node<Entity>`
- **Column**: `{ id, name, type, is_pk, is_nullable, enum_values?, sort_order?, _is_fk? }`
- **Relationship**: `{ id, source_entity_id, target_entity_id, source_column_id?, target_column_id?, source_handle?, target_handle?, type, label? }` — stored as React Flow `Edge` with `type: 'smoothstep'`

### Key Hooks
- **`useERDSession`** ([`src/hooks/useERDSession.ts`](./src/hooks/useERDSession.ts)): State management using `useNodesState<Node<Entity>>` and `useEdgesState<Edge>` from XYFlow. Exposes: `addEntity()`, `updateEntity(entity)`, `deleteEntity(id)`, `handleEdgeUpdate()`, `deleteEdge()`, `onConnect`, `undo/redo`, `takeSnapshot`
- **`useDiagrams`** ([`src/hooks/useDiagrams.ts`](./src/hooks/useDiagrams.ts)): Diagram metadata CRUD (list, create, rename, delete), persist entities/columns as JSON to DB

### ERD → AI Flow
1. `ERDView` passes `{ nodes, edges, selectedNode }` context to `AIActionButton`
2. `AIActions.ts` builds prompt via `erdTableList()` + `erdRelationships()` → text representation
3. `sendAction(prompt, actionId, onResult)` opens chat panel — `actionId` + `onResult` for auto-apply on stream complete
4. AI responds, then auto-applied via `onResult` → `applyToErdContent` → `setNodes`/`setEdges`
5. Manual Append button also works (auto-detects SQL in response), Replace is hidden for ERD
6. Content handler registered with `['append']` strategy only — `contentHandlerStrategies` hides Replace button in AIChatPanel
7. ERD actions: `erd-generate-sql`, `erd-explain-table`, `erd-suggest-indexes`, `erd-seed-data`

### AI → ERD Content Application (Two-Pass FK Edge Generation)
- `applyToErdContent()` in [`src/components/ai/actions/erdActions.ts`](./src/components/ai/actions/erdActions.ts) — parses SQL DDL (`extractSQLFromMarkdown` + `parseSQLToERD`), merges via `mergeIntoDiagram`
- Pattern: `registerContentHandler` → `AIChatPanel` calls `onStreamComplete` → `pendingAction.onResult` → apply mutations
- Auto-apply via `sendAction` `actionId` + `onResult` callback; manual append works for non-action chat responses
- `extractSQLFromMarkdown` handles ` ```sql ``` ` fences and raw SQL
- `mergeIntoDiagram` matches entities by name (not ID) — handles AI-generated IDs vs existing IDs
- Uses full replace approach (`setNodes`/`setEdges`) with `takeSnapshot` for undo
- **Column ID preservation**: when updating existing nodes, `mergeIntoDiagram` preserves existing column IDs for columns matching by name — this keeps edge `sourceHandle`/`targetHandle` references valid across multiple append calls. Without this, re-appending the same SQL regenerates column IDs and breaks FK edge column connections.
- **ALTER TABLE ADD COLUMN**: `applyToErdContent` now handles `ALTER TABLE ... ADD COLUMN` statements (in addition to `CREATE TABLE`). Parsed via `parseAlterTableAddColumn()` which extracts column name, type, nullability, and PK from each ADD COLUMN clause. Columns are added to existing nodes by table name match. Skips `FOREIGN KEY` / `CONSTRAINT` additions (handled by `parseSQLToERD`).
- **Two-pass FK edge generation**:
  - **Pass 1** (`parseSQLToERD.processRel`): creates edges only between nodes parsed from the same SQL block — skips FK references to tables outside the SQL (e.g., existing diagram tables like `users`)
  - **Pass 2** (in `applyToErdContent`, after `mergeIntoDiagram`): re-scans the full SQL text for FK references and creates edges by matching source/target against the **merged** node set (existing + newly parsed nodes)
  - **Inline FK regex**: `/FOREIGN KEY (...) REFERENCES table(...)/g` — finds source table by scanning backwards from match position for `CREATE TABLE <name>`
  - **ALTER TABLE FK regex**: `/ALTER TABLE <name> ADD FOREIGN KEY (...) REFERENCES table(...)/g` — extracts source table directly from the ALTER TABLE statement (avoids backward-scan ambiguity)
  - Helper `tryAddEdge(sName, sourceColName, targetTableName, targetColName)` checks both sides exist in merged nodes, deduplicates via `existingEdgeKeys`, creates a `smoothstep` Edge with `col-{id}-source`/`col-{id}-target` handles
  - Located in [`src/components/ai/actions/erdActions.ts`](./src/components/ai/actions/erdActions.ts) (inline after `mergeIntoDiagram`)

## AI Action Dropdown Reference

Every AI action lives in [`src/components/ai/AIActions.ts`](./src/components/ai/AIActions.ts) and is registered under one of three views: `erd`, `notes`, or `flowchart`. Each action has a `buildPrompt(context)` that constructs the prompt dynamically from current view context (selected table, columns, edges, note content, etc.).

### ERD Actions (`AIActions.ts:40-120`)

| Action | ID | Auto-apply | Behavior |
|--------|----|------------|----------|
| **Edit Columns** | `erd-edit-column` | ✅ Yes | AI responds with JSON mutations (`add_column`/`drop_column`/`modify_column`). Parsed by `erdActions.applyColumnChanges()` → updates selected node's columns. Supports multi-table selection (Ctrl/Cmd+click). |
| **Explain Table** | `erd-explain-table` | ❌ No (read-only) | AI describes selected table in plain language — what it stores, column meanings, use cases. Output rendered as chat message text. Requires a selected table node. |
| **Suggest Indexes** | `erd-suggest-indexes` | ❌ No (read-only) | AI analyzes all tables and recommends B-tree indexes per column. Includes `ALTER TABLE ... ADD INDEX` SQL. Prompt explicitly prohibits hallucinating non-existent FK columns. |
| **Seed Data** | `erd-seed-data` | ❌ No (read-only) | AI generates `INSERT` statements with 3-5 rows per table, FK-referenced consistently. Output as chat-only SQL blocks — user must copy manually to DB tool. |

**Auto-apply mechanism for Edit Columns:**
1. Chat panel sends prompt → AI streams response
2. On stream complete, `pendingAction.onResult` fires → `applyToErdContent(..., 'erd-edit-column')`
3. `extractJSONFromMarkdown` extracts JSON from AI response
4. `tryParseMultiColumnChanges` detects format:
   - **Multi-table**: `{ "table_name": { "mutations": [...] } }` — matches by table name, applies per-node
   - **Single-table**: `{ "mutations": [...] }` — column-aware fallback: extracts column names from mutations (e.g. `drop_column: "name"`), finds selected node with most matching columns; if no match (e.g. `add_column` only), falls back to `primaryNodeId` (last regular-clicked node), not `selectedNodeIds[0]`
5. Returns `{ nodes, edges }` → ERDView calls `setNodes` + `takeSnapshot` for undo
6. Multi-table: snapshot taken once before ALL mutations (atomic undo)
7. AI prompt instructs AI to append a user-facing message after the JSON code block, e.g. "Klik tombol **Append** untuk menerapkan perubahan ke tabel admins."

### Notes Actions (`AIActions.ts:124-157`)

| Action | ID | Apply strategy | Behavior |
|--------|----|----------------|----------|
| **Summarize** | `notes-summarize` | Append with `## Summary` header | AI returns a concise summary (default 3 sentences). Applied via `applyToNoteContent` which appends after `<hr>` with `## Summary` heading. |
| **Improve Grammar** | `notes-improve-grammar` | Replace entire content | AI returns corrected text. Applied as full replacement — original content is overwritten. |
| **Generate Docs** | `notes-generate-docs` | Append with `## Documentation` header | AI reformats note as technical documentation (markdown headings, code blocks, tables). Appended after `<hr>` with `## Documentation` heading. |

**Apply flow for Notes:**
1. User clicks action → chat opens with pre-built prompt (`buildPrompt` includes note content as markdown)
2. AI streams response → user clicks Replace/Append button (or auto-applies if `actionId` matches)
3. `NotesView.handleConfirmChange`:
   - `marked.parse(content)` → HTML
   - `DOMPurify.sanitize` → XSS-safe
   - Append: original + `<br><hr><br>` + HTML
   - Replace: HTML as new content
   - `applyToNoteContent()` handles action-specific formatting (e.g., `## Summary` header for summarize)
   - `saveNote()` → immediate persist + state sync
4. DiffPreviewModal shows changes before confirm

### Flowchart Actions (`AIActions.ts:172-203`)

| Action | ID | Auto-apply | Strategy | Behavior |
|--------|----|------------|----------|----------|
| **Generate Diagram** | `flowchart-generate` | ❌ No (Append) | Append | AI generates full flowchart from description in JSON. Append to add to existing diagram. |
| **Explain Flow** | `flowchart-explain` | ❌ No (read-only) | — | AI describes flowchart as step-by-step process in plain language. Reads all node labels, shapes, and connections. |
| **Generate Pseudocode** | `flowchart-pseudocode` | ❌ No (read-only) | — | AI generates pseudocode representing the flowchart logic. Reads all symbols and connections. |
| **Insert Between** | `flowchart-insert` | ❌ No (Append) | Append | AI inserts a new symbol between two connected symbols. User selects source and target nodes, AI generates the intermediate step. |
| **Import from Description** | `flowchart-import` | ❌ No (Replace) | Replace | AI generates full flowchart from description. Replace wipes the canvas and replaces with AI output. |

### Flowchart AI Context (JSON Format Instruction)

- `buildFlowchartContext()` in [`src/hooks/aiEntityContext/flowchart.ts`](./src/hooks/aiEntityContext/flowchart.ts) groups symbols by section (BFS from Start nodes) under `=== Section Title [id:grp_xxx] ===` headers. Ungrouped (unreachable) symbols go under `=== Ungrouped ===`. Flat list fallback if no Start nodes exist.
- Includes `Grid layout` section with exact dimensions (160×70px symbol box, 160px vertical spacing, 240px horizontal spacing) so AI can answer layout/gap questions.
- Includes `Group-aware instructions` telling AI to scope changes to a specific group when user mentions a section title or group id.
- `buildFlowchartContext()` also appends `[Flowchart Editor Format]` instructions describing the JSON schema (`{ nodes, edges }`), supported shapes, and colors
- AI is instructed to ask the user whether they prefer **Flowchart Editor JSON** (for visual editing), **Mermaid** (for documentation), or **plain text explanation**
- This ensures the AI can respond with parseable JSON when the user wants to create/modify a diagram, making the Append/Replace button appear
- `hasFlowchartJSON()` in `ChatMessages.tsx` detects `{ nodes: [...] }` inside ` ```json ` blocks or raw JSON

### Flowchart Architecture

#### Shared Helpers ([`src/components/ai/actions/flowchartActions.ts`](./src/components/ai/actions/flowchartActions.ts))
- `buildFlowchartLayout(nodes, parsed, labelToIds, idToNode)` — positions nodes using a robust cycle-aware, layered top-down layout engine with DP + DFS column assignment.
- **Smart decision branch layout**: detects cycles via DFS back-edges, assigns DP-based layers, orders yes/no decision branches, assigns collision-free grid columns, and centers convergence nodes.
- **Branch offset** (`BRANCH_OFFSET=280`) matches `HORIZONTAL_SPACING` — Yes/No branches align to grid columns.
- **Per-diamond shift tracking** (`perDiamondShift`) replaces global `shiftedNodes` guard — diamond chains (e.g. Diamond A → Diamond B → Process) accumulate shifts: +280 from A, then +280 from B = +560 total, keeping column alignment.
- **Convergence centering**: after all branch shifts, nodes with ≥2 incoming edges from different X positions (e.g. End node where Yes/No branches meet) are centered between min and max source X.
- `pickClosestHandles(sourceNode, targetNode)` — finds closest edge midpoints for clean connection routing
- `previewFlowchartContent(nodes, edges, content)` — parses AI response JSON into preview nodes/edges without mutating the canvas
- `applyInsertBetween(nodes, edges, content, sourceLabel, targetLabel)` — inserts a new node between two connected nodes, rewiring edges
- `applyReplaceAll(content)` — replaces entire flowchart with AI-generated JSON (for Import from Description)
- Edge parser supports multi-format: `sourceLabel/targetLabel`, `source/target`, `from/to`, label-as-fallback
- **`labelToIds`** (`Map<string, string[]>`): array-based label mapping (supports duplicate labels). `resolveEdgeIds` uses `sourceIndex`/`targetIndex` (1‑based) as highest priority, then `sourceLabel`/`targetLabel`, then legacy `source`/`from`. If label lookup finds >1 match, resolves to the first entry.

#### SVG Preview Modal ([`src/components/flowchart/FlowchartPreviewModal.tsx`](./src/components/flowchart/FlowchartPreviewModal.tsx))
- Pure SVG rendering (no ReactFlow) — eliminates XYFlow dual-instance conflict
- Zoom/pan controls (`scale`, `translate` state via mouse wheel + drag)
- Grab cursor (`grab`/`grabbing`) activates when scale > 0.5 (50% zoom) — panning enabled at that threshold
- Smart connection handles via `pickClosestHandles`; smoothstep-style paths between closest edge midpoints
- Connection dots rendered per node for visual clarity
- `confirmLabel` optional prop (default `"Confirm Append"`) — FlowchartView passes `"Confirm Insert"` for Insert Between mode

#### Delete Symbol
- `deleteNode(nodeId)` in FlowchartView — cascading edge delete
- Keyboard Delete/Backspace shortcut (registered via `window.addEventListener('keydown', ...)`)
- **Guard**: handler skips if `e.target` is `INPUT`, `TEXTAREA`, or `isContentEditable` — prevents accidental deletion when typing in modal fields (e.g., Group Title)
- Delete button in `SymbolPropertiesModal`

#### Auto-Save Guards (FlowchartView)
- Guards checked in order: `initialLoadRef` → `isParsingFromDataRef` → `isDraggingRef` → `isEditingEdgeRef` → `isEditingNodeRef`
- `isDraggingRef` (ref, not state) skips auto-save during node drag; `onNodeDragStop` triggers single save at final position

#### Drag Performance Optimizations (ERDView)

Three fixes prevent cascading re-renders on every drag frame:
1. **`styledNodes` preserves references** (line 121): instead of `nodes.map(n => ({...n, selected: ...}))` which creates new objects for ALL nodes, now only creates a new object for nodes whose `selected` state actually changed (`if (!!n.selected === selected) return n`). The `!!` coerce normalizes `undefined`/`null` (common after `setNodes()` from AI append) to `false`, preventing unnecessary wrappers on first post-append drag. During drag, only the dragged node gets a new reference from `useNodesState` — all other nodes keep their identity, letting React Flow skip reconciliation for them.
2. **`styledEdges` preserves references**: same identity-preserving pattern for edges — only creates new objects for edges whose `className` (animation state) actually changed.
3. **`defaultEdgeOptions` memoized**: stable reference prevents React Flow from re-processing default edge options on every render.

### Drag Performance Optimizations (FlowchartView)
Three fixes prevent cascading re-renders on every drag frame:
1. **`memoizedNodes` preserves references** (line 295): instead of `nodes.map(n => ({...n, selected: ...}))` which creates new objects for ALL nodes, now only creates a new object for nodes whose `selected` state actually changed (`if (n.selected === selected) return n`). During drag, only the dragged node gets a new reference from `useNodesState` — all other nodes keep their identity, letting React Flow skip reconciliation for them.
2. **`setActionContextData` skips during drag** (line 323): the `useEffect` that syncs nodes/edges to AIActionContext now returns early when `isDraggingRef.current` is true. This prevents a cascading second re-render: without this guard, every drag frame triggered `setActionContextData` → `AIActionProvider` re-render → `FlowchartView` (as `useAIAction` consumer) re-renders again → `memoizedNodes` recomputes → React Flow reconciles all nodes twice per frame.
3. **`useEdgesState` edges reference is stable during drag** — edges don't change when nodes move, so `memoizedEdges` doesn't recompute mid-drag. The only drag-triggered re-render comes from `nodes` changes, which now only recreate the dragged node's object.
4. **`memoizedEdges` preserves references** (line 409): non-active edges (not hovered/selected) return the original edge reference — only edges that are actively hovered or selected get new objects with white stroke/width overrides. React Flow skips reconciliation for unchanged edges.
- `isEditingEdgeRef` skips auto-save while ConnectorPropertiesModal is open — prevents auto-save cascade on every keystroke when editing edge labels. On modal close, a flush save fires automatically to persist pending changes.
- `isEditingNodeRef` skips auto-save while SymbolPropertiesModal is open — same pattern as edge editing to prevent dialog close on keystroke
- Init effect (`useEffect` dep `[activeFlowchartId, activeFlowchart.data]`) **only clears `selectedNodeId`/`selectedEdgeId` when flowchart ID changes**, not on every data sync — prevents auto-save cycle from closing modal dialogs.
- `handleEdgesChange` + `handleNodesChange` both filter out `type: 'select'` — selection changes never trigger auto-save or content-modified flag
- `useFlowchartChangeHandler` debounces save at 1.5s, updates `activeFlowchart.data` in workspace state

#### Content Handler Routing
- FlowchartView registers content handler with `['append', 'replace']` strategies
- Action ID routing: `flowchart-import` → `applyReplaceAll`, `flowchart-insert` → `applyInsertBetween`, generic → `previewFlowchartContent` + modal
- `pendingPreview` in FlowchartView stores parsed preview result; modal renders as SVG (no ReactFlow); main canvas state unaffected
- `pendingContentRef` stores raw AI response text; `handleConfirmAppend` re-parses via `applyToFlowchartContent` then sets state
- **Insert Between now shows preview** via `FlowchartPreviewModal` (was direct apply). `pendingApplyModeRef` tracks `'insert'` vs `'append'`; `handleConfirmAppend` calls `applyInsertBetween()` in insert mode.
- **Undo for AI changes**: `useUndoRedo().takeSnapshot()` called before every AI mutation (import replace, handleConfirmAppend). Same hook as ERD — saves node/edge state snapshots. No undo/redo UI yet (future work).

## Lazy Render Optimizations

### ERD Canvas (`EntityNode.tsx`, `ERDView.tsx`, `useERDSession.ts`)

- **Memoized ColumnRow** (`EntityColumnRow`): extracted column rows into a separate `React.memo` component with stable inline style objects (`useMemo`) — prevents re-creating 4N Handle components per node on every re-render
- **Memoized column sort**: `sortedColumns` derived via `useMemo` keyed on `data.columns` (direct reference) — re-sorts whenever any column property changes (name, type, nullable, PK, etc.). Previously was keyed on `columnOrderHash` (id+sort_order only) which caused stale canvas renders when only name/type changed — **bug fixed**.
- **`columnOrderHash`**: separate `useMemo` keyed on `data.columns` used only for `updateNodeInternals` effect (Handle positions depend on column IDs/sort_order, not other properties).
- **Filter `select` changes**: `handleNodesChangeLocal` in ERDView filters out `type: 'select'` changes before forwarding to React Flow (mirrors FlowchartView pattern) — prevents selection-only events from cascading through styledNodes/styledEdges
- **Targeted memo comparator**: replaced `JSON.stringify` in `ERDView.memo` comparator with field-by-field comparison (`nodesEqual`/`edgesEqual` functions) — avoids serializing 90+ columns on every parent re-render
- **FK detection optimization**: replaced `JSON.stringify(newColumns) !== JSON.stringify(node.data.columns)` with inline `_is_fk !== isFk` comparison in `useERDSession.ts`

### Per-Table Dialog: `TableDialog`

- **`TableDialog`** ([`src/components/modals/TableDialog.tsx`](./src/components/modals/TableDialog.tsx)): single dialog with two tabs — **Properties** (embeds `PropertiesPanel` for name/color/columns editing) and **Schema** (MySQL, PostgreSQL, Laravel Migration/Model, TypeScript, Prisma, Zod sub-tabs). Replaces two separate dropdown items in `EntityNode` ("Edit Table" + "Generate Schema") with one "Edit" item.
- Rendered locally inside `EntityNode.tsx` (not via global `CustomEvent` or WorkspaceProvider modal), matching the existing `GeneratedCodeModal` pattern.
- Uses `useWorkspace()` directly for `handleEntityUpdate`, `deleteEntity`, `setSelectedNodeId`, `setIsDeleteAlertOpen`.
- `defaultTab` prop controls which tab opens (`'properties'` from `handleEdit`, `'schema'` from `handleGenerate`).
- `EntityNode.tsx` dropdown reduced from 3 items (Edit Table, Generate Schema, Delete Table) to 2 items (Edit, Delete Table). Both `TablePropertiesModal` and `GeneratedCodeModal` remain as standalone components (backward compat, body double-click still opens global `TablePropertiesModal`).

### PropertiesPanel Column Scroll & Stale Canvas Fixes

- **Column scroll**: `PropertiesPanel.tsx` column list section has `max-h-[300px] overflow-y-auto custom-scrollbar` — vertical scrollbar only on column cards, Add Column button stays in sticky header outside scroll area.
- **Stale canvas on column edit**: `sortedColumns` useMemo dependency changed from `columnOrderHash` (id+sort_order only, missing name/type) to `data.columns` (full reference) — ensures any column property change triggers canvas re-render.

### Flowchart AI Content Parsing Performance

- **`Array.shift()` → index pointer**: both `collectDescendants()` and the Sugiyama layer-assignment BFS used `q.shift()` which is O(n²). Both now use `q[idx++]` pointer pattern — O(n).
- **`pickClosestHandles` precompute**: handle positions are precomputed per-node via `computeHandlePoints()` + `nodePosMap`, then stored in `srcHandleCache`/`tgtHandleCache` for O(1) reuse across all edges. Old code recomputed `handlePositions[side](sx, sy)` inside a 16-iteration double loop for every edge.
- **`computeHandles` NODE_H=70** — synced with preview modal height for consistent edge handle placement between canvas and SVG preview.
- **Parse cache**: `getCachedOrParse(aiResponse)` caches `parseNodesAndEdges` result between `previewFlowchartContent` and `applyToFlowchartContent`/`applyReplaceAll`. `clearParseCache()` frees memory after confirm. `applyInsertBetween` does not use the cache (different schema).
- **Stable IDs**: all AI-generated node/edge IDs use `hashStr(JSON.stringify(parsed))` instead of `Date.now()`, ensuring identical AI responses produce identical IDs. `hashStr` is a simple 32-bit FNV-1a-like hash.
- **`maxIter` guard**: `collectDescendants(id, outgoing, exclude, maxIter=200)` prevents infinite BFS loops from malformed graphs.
- **Sugiyama BFS capped**: `maxBFSIter = newNodes.length * 3` prevents infinite loop on cyclic graphs (back-edges). The original `while (queue.length > 0)` never terminates when the graph has cycles (e.g. `n4→n2→n3→n4` loop) because each cycle pass re-queues all cycle nodes with higher layers, growing the queue unboundedly.
- **Fast-path positions**: if ALL AI-provided nodes have `position` with `x`/`y` numbers, `buildFlowchartLayout` uses them directly and skips the Sugiyama layout entirely — eliminates the layout bottleneck for AI responses that include positions.

### Flowchart AI Content Safety Guards

- **`MAX_AI_NODES = 60`**, **`MAX_AI_EDGES = 120`**, **`MAX_AI_TEXT_BYTES = 512_000`** in `flowchartActions.ts` — hard limits that prevent parsing/rendering huge AI responses
- `parseJSON()` returns `null` if `text.length > MAX_AI_TEXT_BYTES`
- `parseNodesAndEdges()` returns `null` if `parsed.nodes.length > MAX_AI_NODES` or `parsed.edges.length > MAX_AI_EDGES`
- Content handler in `FlowchartView` wraps the entire callback in `try/catch` with `toast.error` fallback — prevents unhandled errors from crashing the page
- If parsing fails (nodes empty, exceeded limits, or malformed JSON), a toast warns the user the data couldn't be parsed

### Flowchart Canvas (`FlowchartNode.tsx`)

- `isHovered` local state is scoped per-node — only the hovered node re-renders, not the entire canvas
- `shapeBackground` memoized on `[data.color, data.shape, selected]` — SVG paths recompute only on actual property changes
- **Handle visibility**: `handleClasses` = `opacity-0 group-hover:opacity-100` — handles (bulatan edge) hanya muncul saat cursor menyorot node. Parent div punya `group` class.

### Shared patterns

- `onlyRenderVisibleElements={true}` on both ERD and Flowchart ReactFlow instances — off-screen nodes are not rendered
- `colorMode="dark"` avoids runtime theme switch recalculation
- Both custom node components wrapped in `React.memo`
- Auto-save guards (`isDraggingRef`, `isParsingFromDataRef`) prevent serialization/save cycles during interaction

### How `buildPrompt` Works
Each action's `buildPrompt(context)` receives the current view context:
- **ERD**: `{ nodes: Node<Entity>[], edges: Edge[], selectedNode: Node<Entity> | null, multiSelectedNodes?: Node<Entity>[], primaryNodeId?: string }`
- **Notes**: `{ content: string, title: string }`
- **Flowchart**: `{ nodes: Node[], edges: Edge[] }`

The prompt is built as a **prefix of the user message** (not system message) — this gives it higher prominence with fine-tuned models. Helper functions:
- `erdTableList(context)` — formats all tables as `name:\n  - col: TYPE 🔑`
- `erdRelationships(context)` — formats edges as `  source → target`
- `flowchartSymbolDetail(context)` — formats symbols grouped by **section** (Group Title from Start node). Detects `Start` nodes, BFS-traverses each flow, and renders groups under `=== Section Title ===` headers. Nodes not reachable from any Start go to `=== Ungrouped ===`. Falls back to flat list if no Start nodes exist.

## Flowchart Section / Group Feature

- Semua simbol (termasuk Start/End) bisa dihapus bebas — `deleteNode` tidak lagi memiliki guard Start/End
- **Start nodes** have a "Group Title" input field in properties modal — stored as `section` in `FlowchartNodeData`
- **Start label detection**: `isStartNode`/`isStartLabel` uses `.includes('start')` (case-insensitive) — not exact match. Labels like "Start Login", "Start Process", "restart" trigger Group Title form.
- **Group title uniqueness**: validated on write via `updateNodeData` with toast error on duplicate.
- **Delete Group**: `deleteGroup` di FlowchartView — hapus semua node yang punya `section` (grup) yang sama. Tombol "Hapus Grup" muncul di `SymbolPropertiesModal` untuk Start node yang punya Group Title.
- **`groupId`**: setiap Start node punya unique key (e.g. `grp_quickstart`) — auto-generated saat node dibuat, tampil di AI context sebagai `[id:grp_xxx]`. AI bisa referensi via `sourceGroupId`/`targetGroupId` di JSON response.
- **AI grouping**: `flowchartSymbolDetail()` groups symbols by section using BFS from each Start node. Each group rendered under `=== {section} [id:grp_xxx] ===` header. Supports overlapping groups (user can have multiple Start nodes sharing the same End).
- **Insert Between resolution order**: `sourceGroupId` → `sourceIndex` → `sourceLabel` (prioritas tertinggi ke terendah).
- **Move Group** (FlowchartView toolbar): `<Select>` dropdown listing semua grup (dari `canvasGroups`). Pilih grup → BFS select semua node anggota via `selected: true` → bounding box dashed indigo muncul di sekeliling grup. Drag satu node anggota → semua anggota grup ikut bergerak (ReactFlow multi-drag native). Klik pane → grup deselected. Bounding box SVG di-render di luar ReactFlow dengan viewport transform (`onMove` tracker) agar posisi rect konsisten dengan flow coordinates saat pan/zoom. File: [`src/components/views/FlowchartView.tsx`](./src/components/views/FlowchartView.tsx)

## Flowchart SVG Export

- [`src/lib/generateFlowchartSVG.ts`](./src/lib/generateFlowchartSVG.ts): utility yang menghasilkan SVG string dari nodes + edges, termasuk shapes, labels, connections, dan arrow markers. Support semua shape (oval, diamond, parallelogram, database, document, cloud, circle, rectangle). `downloadSVG(svgString, filename)` trigger download.
- **Export flow**: FlowchartView mendaftarkan `FlowchartExportHandler` ke `WorkspaceContext` via `setFlowchartExportHandler` pada mount. Handler berisi `exportAll()`, `exportGroup(group)`, dan `groups[]`.
- **Preview modal** ([`src/components/flowchart/FlowchartExportModal.tsx`](./src/components/flowchart/FlowchartExportModal.tsx)): sebelum di-ekspor, FlowchartView buka `FlowchartExportModal` yang render ReactFlow asli (pakai `FlowchartNode` component) — bukan native SVG style. User bisa preview dan klik "Download SVG" untuk trigger export.
- **Export All Canvas**: semua nodes + edges di-render di modal ReactFlow, lalu di-ekspor sebagai SVG lengkap dengan dark background (`#0f0f14`), arrow markers, handle dots, dan section badges.
- **Export Group**: BFS dari Start node grup → kumpulkan semua connected nodes/edges → filter hanya nodes dalam grup → render di modal → ekspor sebagai SVG.
- **NavActionsMenu** ([`src/components/NavActionsMenu.tsx`](./src/components/NavActionsMenu.tsx)): untuk `documentType === 'flowchart'`, render submenu Export → SVG Format → "All Canvas" + satu item per grup. Membaca handler dari `useWorkspace().flowchartExportHandler`.
- **FlowchartExportHandler** didefinisikan di `WorkspaceContext.tsx`: `{ exportAll: () => void; exportGroup: (group: string) => void; groups: string[] }`.



**Special instructions for Edit Columns prompt:**
- When multiple tables selected, prompt shows ALL selected tables with column structures
- Instructs AI to respond with JSON + a user-facing message after the code block (e.g., "Klik tombol **Append** untuk menerapkan perubahan ke tabel admins.")
- Multi-table JSON format: `{"table_name": {"mutations": [...]}}` — per-table key, not an array of sets
- Single-table format: `{"mutations": [...]}` — used when only 1 table selected

### Context Prominence Strategy

- `entityContextText` (schema/note content) injected as **prefix of user message**, not system message
- Some models (fine-tuned instruct models) give lower weight to system messages; user message gets higher prominence
- Order: `[entity context]` → `[Selected text]` → `User request: ...`
- Fallback: if `entityContextText` is null, calls `fetchEntityContext()` to fetch from Supabase (used when chat panel is opened outside a specific entity page)
- `fetchEntityContext` result also injected as user message prefix (same prominence treatment)

## Text Stats for Notes (NavActionsMenu)

- **Submenu "Text Stats"** added after Export in `NavActionsMenu` — only visible for Notes (`documentType === 'notes'`)
- Shows Words, Sentences, Paragraphs, and Characters (separated by divider) in a `DropdownMenuSubContent` panel
- Stats computed from `noteContent` prop (HTML string from `activeNote.content`) passed via chain: `AppLayout` → `MainHeader` → `NavActionsMenu`
- `stripHtml()` helper strips all HTML tags before counting; characters excludes whitespace
- Paragraphs counted via `<p>` tag regex first, falls back to double-newline split (for non-HTML content)
- Chain: `AppLayout` (`activeNote?.content`) → `MainHeader` (`noteContent` prop) → `NavActionsMenu` (`getTextStats()`)
- All values formatted with `toLocaleString()` for readability
- [`src/components/NavActionsMenu.tsx`](./src/components/NavActionsMenu.tsx): `noteContent` prop, `getTextStats` + `stripHtml` helpers
- [`src/components/MainHeader.tsx`](./src/components/MainHeader.tsx): `noteContent` prop forwarded to `NavActionsMenu`
- [`src/routes/AppLayout.tsx`](./src/routes/AppLayout.tsx): passes `activeNote?.content` as `noteContent`

## API Client (Migration Ready)

- **`src/lib/api.ts`**: Centralized API helper with `API_BASE_URL` (from `VITE_API_URL` env var) and `apiFetch()` wrapper
  ```ts
  export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
    return fetch(`${API_BASE_URL}${input}`, { credentials: 'include', ...init });
  }
  ```
- All `fetch('/api/...')` calls replaced with `apiFetch('/api/...')` — when repos split, set `VITE_API_URL=https://api.server.com` and all calls redirect
- **Global 401 interceptor** (`main.tsx:12`): patched to detect API calls by checking `API_BASE_URL` prefix in addition to relative `/api/` paths
- **Vite proxy** (`vite.config.ts:20`): `/api` proxied to `VITE_API_URL || http://localhost:3000` for standalone dev
- **No `Content-Type` auto-setting** — upload calls (FormData) work without override

## Server Architecture (Standalone)

- **`server/index.ts`**: Pure Express app setup (middleware + routes) — no listen, no Vite. Exports `app`
- **`server/run.ts`**: Standalone entry — imports app, listens on `PORT`, serves static `dist/` in production
- **`server/dev.ts`**: Dev entry — imports app, attaches Vite middleware, listens (old monolith workflow)
- **`api/index.ts`**: Vercel entry — imports app, exports default for `vercel.json` routing
- **Scripts**:
  - `npm run dev` → old monolith (Express + Vite middleware via `server/dev.ts`)
  - `npm run dev:api` → standalone backend only (`server/run.ts`)
  - `npm run dev:client` → Vite frontend only (proxies `/api` to backend)
  - `npm run start` → production standalone (`server/run.ts`)

## Shared Types

- **`shared/types.ts`**: All TypeScript interfaces (Column, Entity, Diagram, Note, etc.) — single source of truth
- **`src/types.ts`**: Re-exports everything from `../shared/types` — all existing imports continue to work
- Backend can import directly from `shared/types` when it gets its own repo
- Covers: ERD entities, documents (Diagram/Note/Drawing/Flowchart), AI integration (Provider/Model/Config/Chat), projects, audit

## AGENTS.md File References Convention

- All `src/` file paths in AGENTS.md use relative `./` links with backtick formatting: `` [`src/path/file.ts`](./src/path/file.ts) ``
- Links open files locally when clicked in supporting terminals
- Relative sibling paths (without `src/` prefix, e.g. after a comma) are NOT linked

## URL Sync Safety Net (Editor Routes)

- Setiap editor route ([`NoteEditorRoute`](./src/routes/NoteEditorRoute.tsx), [`DiagramEditorRoute`](./src/routes/DiagramEditorRoute.tsx), [`DrawingEditorRoute`](./src/routes/DrawingEditorRoute.tsx), [`FlowchartEditorRoute`](./src/routes/FlowchartEditorRoute.tsx)) memiliki `useEffect` safety net yang menyinkronkan `id` dari `useParams()` ke context `active*Id`/`active*Uid`.
- **Masalah**: Navigation hooks (`useNoteNavigation`, `useDiagramNavigation`, dll.) memiliki URL sync effect, tapi ada race condition — data fetch dari `selectNote`/`selectDiagram` bisa selesai SEBELUM initial data fetch. Akibatnya `isItemLoading` jadi `false` dan `activeNote` masih `null`, memicu "not found" padahal file masih loading.
- **Fix Tahap 1 (Safety Net)**: Setiap editor route:
  1. `processedUrlRef` (`useRef(false)`) — flag sekali-proses per mount
  2. `useEffect` dengan dep `[id, activeId, isPublicView, handleSelect]`:
     - Jika `activeId` sudah match dengan `id` → set `processedUrlRef = true`, return
     - Jika `activeId` masih null → panggil `handleSelect(id)`, set `processedUrlRef = true`
  3. Di guard "select a ... to view" (`!activeId`): jika `id` ada tapi `processedUrlRef` masih `false` → render loading spinner (bukan "select")
- **Duplicate guard**: `handleSelect` (dari navigation hooks) memiliki guard 1.5s via `lastSelected*Ref`, jadi safety net effect tidak menyebabkan double-fetch jika URL sync effect sudah jalan duluan.
- **Fix Tahap 2 (Fetch Wipe Prevention)**: Race condition tambahan — `selectNote` menyelesaikan fetch duluan dan menambahkan note ke array, lalu `fetchNotes(pageData)` selesai dan **mereplace seluruh array** (via `setNotes(page1Data)`), menghapus active note dari array → `activeNote` jadi null, `isItemLoading` false → "not found". Fix di semua 4 hook:
  - Tambah ref untuk active ID di setiap hook: `activeNoteUidRef`, `activeDiagramIdRef`, `activeDrawingUidRef`, `activeFlowchartIdRef`
  - Di `fetch*`, cabang non-loadMore: `set*(prev => {...})` — jika active ID tidak ada di new page data, preserve item dari `prev`
  - File:
    - [`src/hooks/useNotes.ts`](./src/hooks/useNotes.ts): `activeNoteUidRef` + conditional preserve di `setNotes`
    - [`src/hooks/useDiagrams.ts`](./src/hooks/useDiagrams.ts): `activeDiagramIdRef` + preserve di `setDiagrams`
    - [`src/hooks/useDrawings.ts`](./src/hooks/useDrawings.ts): `activeDrawingUidRef` + preserve di `setDrawings` (merge pattern)
    - [`src/hooks/useFlowcharts.ts`](./src/hooks/useFlowcharts.ts): `activeFlowchartIdRef` + preserve di `setFlowcharts` (merge pattern)
- **File pattern safety net**: [`src/routes/NoteEditorRoute.tsx`](./src/routes/NoteEditorRoute.tsx):17-30 (safety net effect), 32-42 (guard + loading fallback)

## Server-Side AI Proxy

- **`server/routes/ai.ts`**: `POST /api/ai/proxy` — proxy endpoint yang meneruskan request chat ke OpenAI-compatible provider dan stream SSE response kembali ke client.
- **Kenapa proxy**: API key tidak langsung ter-expose ke third-party di browser DevTools. Key dikirim dalam POST body dari client ke server, lalu server forward ke provider.
- **`res.on("close")` vs `req.on("close")`**: Gunakan `res.on("close")` untuk detect client disconnect. `req.on("close")` fires premature saat POST body selesai dibaca oleh `express.json()`, yang menyebabkan `AbortController.abort()` dipanggil sebelum fetch ke AI provider sempat konek.
- **30s timeout**: Safety timeout agar fetch ke provider tidak hang forever.
- **File**: [`server/routes/ai.ts`](./server/routes/ai.ts)

## @Mentions as Clickable Links in Chat

- User messages in `ChatMessages.tsx` parse `@FileName` patterns via the same regex as `resolveMentions` (`/@([^\s\n]+)/g`)
- Matching mentions render as cyan-colored `<Link>` elements (underline on hover) that navigate to the referenced file
- Route lookup: note → `/notes/{uid}`, diagram → `/erd/{uid}`, flowchart → `/flowchart/{uid}`, drawing → `/drawing/{uid}`
- `mentionFiles` prop passed from `AIChatPanel` to `ChatMessages` (same data used for ChatInput dropdown)
- Unmatched `@text` (no file found) remains as plain text — unchanged
- Uses `renderMentionText(text)` function called inside the user message `<p>` element, replacing raw `{displayText}`

## Custom SQL DDL AST Parser & Lexer

- **Parser Architecture**: Ganti regex matching yang ringkih di [`src/lib/sqlParser.ts`](./src/lib/sqlParser.ts) dengan custom **Lexer & Parser DDL** token-based.
- **Lexer (`SqlLexer`)**:
  - Mengabaikan komentar SQL (`--`, `/* */`, `#`).
  - Tokenizer yang membedakan: `KEYWORD`, `IDENTIFIER` (membersihkan backticks, quotes, braces `[]`), `SYMBOL` (`(`, `)`, `,`, `;`, `.`), `NUMBER`, dan `STRING`.
- **Parser (`SqlParser` / `parseSqlDdl`)**:
  - Melakukan parsing pernyataan `CREATE TABLE` dan `ALTER TABLE` menggunakan token stream.
  - Mendukung column inline constraints (`PRIMARY KEY`, `NOT NULL`, `NULL`, inline `REFERENCES`).
  - Mendukung table level constraints (`PRIMARY KEY (...)` dan `FOREIGN KEY (...) REFERENCES ...`).
  - Mengabaikan noise dialek SQL seperti `ENGINE=InnoDB`, `DEFAULT CHARSET`, collation kustom, indeks kustom (`INDEX`/`KEY`/`UNIQUE`).
  - Membatasi boundary check di `parseColumnConstraints` agar berhenti di `;` (semicolon), sehingga statement `ALTER TABLE` berurutan ter-parse dengan benar tanpa melompati baris.
- **Integration**:
  - [`src/components/ai/actions/erdActions.ts`](./src/components/ai/actions/erdActions.ts) mengimpor `parseSqlDdl` untuk menggantikan regex-based `parseAlterTableAddColumn` dan parsing relasi manual.
- Diagram visual sinkron 100% dengan dialek PostgreSQL, MySQL, dan SQLite.

## Fase 2 Cross-Document Interoperability & AI Workspace Architect

- **Automated Document Creation**:
  - Tombol **"Create ERD"** dan **"Create Flowchart"** ditambahkan pada balon pesan chat AI jika asisten menghasilkan SQL DDL atau JSON flowchart.
  - Alur: Mengambil data terkait → Menyimpannya di `localStorage` (`pending_create_erd_ddl` atau `pending_create_flowchart_json`) → Memanggil fungsi pembuatan dokumen dari context (`handleSidebarDiagramCreate` / `handleSidebarFlowchartCreate`) → Mengarahkan pengguna ke halaman baru.
  - **Project ID Inheritance (Workspace Integration)**: Mengalirkan prop `projectId` dari active document (diperoleh di `AppLayout` lewat entity context) ke `AIChatPanel` → `<ChatMessages activeProjectId={projectId} />`. Klik tombol "Create ERD" / "Create Flowchart" memicu `handleSidebarDiagramCreate` / `handleSidebarFlowchartCreate` dengan `projectId` ini, menjamin dokumen baru terbuat dengan `project_id` yang sama demi integritas workspace/project.
  - Mount hook: [`src/components/views/ERDView.tsx`](./src/components/views/ERDView.tsx) dan [`src/components/views/FlowchartView.tsx`](./src/components/views/FlowchartView.tsx) mendeteksi item `localStorage` pada mount, memparsing konten, menginisialisasi canvas, mengambil snapshot riwayat (untuk undo/redo), dan membersihkan storage secara otomatis.
- **Rich Context Mentions**:
  - **Diagram Mentions**: Penyebutan `@DiagramName` pada chat memicu pencarian database dinamis untuk mengidentifikasi seluruh daftar tabel, tipe kolom, dan primary keys untuk dikirim sebagai prompt konteks (sebelumnya hanya mengirimkan nama diagram).
  - **Flowchart Mentions**: Penyebutan `@FlowchartName` memparsing JSON alur ReactFlow menjadi ringkasan deskriptif terstruktur ("Steps" dan "Connections") sebelum dikirim ke AI, menghemat alokasi token dan meningkatkan pemahaman alur oleh model.

## Spacing & Spacing Fixes (Editor and PDF Export)

- **In-App Editor Spacing**:
  - **Bug**: Di Tiptap editor (yang dibungkus class `.tiptap-editor-lined`), gap tinggi antar heading (`h1` sampai `h6`) dengan paragraf/content sekitarnya terlalu mepet/stacked (Gambar 2). Hal ini dikarenakan selector `.tiptap-editor-lined .ProseMirror>*` memaksa `margin-top: 0 !important` dan `margin-bottom: 0 !important`.
  - **Fix**: Mengubah reset global di [`src/index.css`](./src/index.css) menggunakan `:not(h1):not(h2):not(h3):not(h4):not(h5):not(h6)` sehingga mengecualikan heading dari zero-margin reset. Mendefinisikan margin-top/bottom yang proporsional dan spacious untuk `h1` sampai `h6` agar memiliki breathing room yang optimal, serta menambahkan selector `:first-child` khusus pada heading untuk mereset `margin-top` ke `0.5rem` bila heading berada paling atas dokumen.
- **PDF Export Spacing**:
  - **Bug**: Pada hasil export Note ke PDF (Gambar 1), jarak (gap) antar heading, paragraf, dan list item terlalu longgar karena margins/paddings default browser tidak ter-reset, ditambah penambahan gap manual yang terlalu besar pada `exportToPDF` (jsPDF direct object builder) dan print styling (`printNote`).
  - **Fix**:
    1. **Direct PDF Export (`exportToPDF` di [`src/lib/exporters/note-exporter.ts`](./src/lib/exporters/note-exporter.ts))**:
       - Mengimplementasikan static helper `NoteExporter.decodeHtml(html)` untuk me-resolve HTML entities (seperti `&amp;` -> `&`) pada Table of Contents outline dan heading teks.
       - Mengubah render loop flat menjadi engine rekursif DOM traversal (`renderNode`) untuk menangani rendering elemen block, list (`ul`/`ol`), list item (`li`), dan blockquote secara presisi dengan dynamic indentation berdasarkan level kedalaman list (`listDepth * 16`).
       - Memperketat spacing vertikal dengan mengurangi `margin-bottom` paragraph dari `12pt` ke `5pt` dan `margin-bottom` heading dari `20pt` ke `5pt`.
    2. **High-Quality Print PDF (`printNote` di [`src/lib/exporters/note-exporter.ts`](./src/lib/exporters/note-exporter.ts))**:
       - Menambahkan CSS reset global (`* { margin: 0; padding: 0; box-sizing: border-box; }`) di `exportStyles` guna mencegah margin default browser menumpuk.
       - Mengatur margin heading dan paragraph yang lebih compact (`margin-bottom: 10px` untuk `p`, `margin-top: 20px` / `margin-bottom: 8px` untuk `h2`).
       - Menambahkan rule `li p { margin-bottom: 0; }` agar paragraph di dalam list item tidak menduplikasi margin bawah.

## Fase 3: Living Flowcharts Simulation & Visual Schema Diffing

- **Living Flowcharts (AI Logic Simulation Sandbox)**:
  - **Logic Execution Sandbox**: Memungkinkan pengguna melampirkan potongan kode JavaScript di belakang simbol flowchart melalui `SymbolPropertiesModal` (disimpan dalam data node sebagai `code`). Simulasi dieksekusi di browser menggunakan `new Function('context', ...)` untuk mengisolasi variabel input/output ke objek `context` JSON.
  - **Interactive Simulation Controls**: Menambahkan tombol **"Simulate Flow"** pada bilah alat atas. Saat diklik, panel sandbox meluncur di sisi kanan canvas untuk menguji input JSON dan melihat logs eksekusi.
  - **Dynamic Path & Node Visuals**: Selama simulasi, alur dianimasikan secara real-time. Node aktif bersinar jingga (*amber glow*) dan berkedip dengan animasi denyut, node yang dikunjungi menyala hijau (*emerald glow*), konektor (panah) berubah menjadi hijau solid/jingga solid dan beranimasi (bergerak/berdenyut) untuk memetakan penelusuran.
  - **Conditional Branch Selection**: Jika simpul keputusan (diamond) memiliki beberapa cabang keluar (outward edges), executor secara otomatis mengikuti cabang yang labelnya cocok dengan nilai kembalian (*return value*) dari kode JS. Jika tidak ada kode atau tidak ada cabang yang cocok, simulasi dijeda dan panel logs menyediakan opsi bagi pengguna untuk mengklik tombol cabang secara manual guna melanjutkan penelusuran.

- **Visual Schema Diffing & Merge Resolution (Git-style Database Design)**:
  - **Schema Diff Engine**: Utilitas [`src/lib/schema-diff.ts`](./src/lib/schema-diff.ts) membandingkan skema ERD lama dengan usulan skema SQL DDL baru dari AI. Utilitas ini menandai node/tabel dengan `diffState` (`'new' | 'modified' | 'deleted'`) dan kolom individual dengan tanda yang sama.
  - **Visual Diff Highlights**: Di atas canvas ERD, tabel baru digambar dengan batas hijau terang (serta badge "NEW" dan bayangan emerald), tabel yang dimodifikasi digambar batas jingga (badge "MOD"), dan tabel yang dihapus digambar batas merah pudar (badge "DEL" dengan opacity rendah). Kolom baru diawali tanda `+` hijau, sedangkan kolom terhapus dicoret (line-through) merah.
  - **Conflict & Merge Resolution Panel**: Menampilkan floating toolbar di bagian bawah canvas dengan ringkasan perubahan (misal: "2 New, 1 Mod, 0 Del"). Pengguna dapat membuka **Checklist Panel** untuk meninjau secara detail dan memilih tabel mana saja yang ingin disetujui untuk di-merge.
  - **Merge & Reversion Logic**: Saat tombol **"Merge Selected"** diklik:
    - Tabel baru/modifikasi yang disetujui akan di-merge (menghapus penanda `diffState` dan menyaring kolom yang ditandai untuk dihapus agar tidak ikut tersimpan).
    - Tabel modifikasi/hapus yang ditolak akan dikembalikan (*reverted*) ke skema originalnya sebelum AI menyentuhnya.
    - Relasi (konektor panah/edges) dibangun ulang secara dinamis untuk menyambungkan hanya tabel-tabel yang terpilih/disetujui.

## Auto-Generated Document Persistence Fix

### Bug: Auto-generated ERD/Flowchart content lost on reload

**Root Cause (3 issues):**

1. **Draft ID mismatch (ERD only)**: `handleSidebarDiagramCreate` passed `d.id` (numeric) to `handleDiagramSelect`, setting `activeDiagramId` to numeric. `saveDiagram` saved draft to IndexedDB keyed by numeric id. `syncDrafts` constructed endpoint `/api/diagrams/save/${draft.id}` with numeric id, but server route queries `.eq("uid", uid)` — fails because numeric != UUID.

2. **Missing `triggerDebouncedSync()` call**: Both `ERDView` and `FlowchartView` mount effects called `saveDiagram`/`saveFlowchart` after parsing `pending_create_erd_ddl`/`pending_create_flowchart_json` from localStorage. These save functions only write to IndexedDB draft — they do NOT trigger cloud sync. Without `triggerDebouncedSync()`, the draft stays local.

3. **Auto-save 2-second guard**: `useAutoSave.ts` has a guard that ignores all save events for the first 2 seconds after diagram load (`Date.now() - lastDiagramLoadTimestampRef.current < 2000`). This consumed and discarded the `saveCounter` increment from auto-generated content, preventing auto-save from triggering cloud sync.

**Fix:**

- [`src/hooks/useSidebarHandlers.ts`](./src/hooks/useSidebarHandlers.ts): Changed `handleDiagramSelect(d.id)` → `handleDiagramSelect(d.uid || d.id)` to match flowchart pattern (`f.uid`). This ensures `activeDiagramId` is UUID and draft ID matches what the sync endpoint expects.
- [`src/components/views/ERDView.tsx`](./src/components/views/ERDView.tsx): Added `triggerDebouncedSync` prop. Called `triggerDebouncedSync()` in `.then()` after `saveDiagram()` in the pending DDL mount effect.
- [`src/components/views/FlowchartView.tsx`](./src/components/views/FlowchartView.tsx): Added `triggerDebouncedSync` prop. Called `triggerDebouncedSync()` in `.then()` after `saveFlowchart()` in the pending flowchart mount effect.
- [`src/routes/DiagramEditorRoute.tsx`](./src/routes/DiagramEditorRoute.tsx): Passes `triggerDebouncedSync` from workspace context to `ERDView`.
- [`src/routes/FlowchartEditorRoute.tsx`](./src/routes/FlowchartEditorRoute.tsx): Passes `triggerDebouncedSync` from workspace context to `FlowchartView`.

## Create ERD/Flowchart/Notes/Drawing — UUID Persistence Fix

### Bug: `api/diagrams/save/9` — Draft saved with numeric ID instead of UUID

**Root Cause (Systemic)**: Three separate issues conspire to set `activeDiagramId` to numeric `id` instead of UUID `uid`:

1. **DB `uid` column may not auto-generate**: `POST /api/diagrams` does not explicitly set `uid`. If the database `uuid` column lacks `gen_random_uuid()` default, `uid` returns `null`.
2. **`selectDiagram` callback overwrites `activeDiagramId`**: `useDiagramNavigation.ts:118` passes raw `id` to `selectDiagram`; `useERDSession.ts:104` calls `callback(id)` which overwrites the correctly-set UUID with the numeric `id`.
3. **Race on initial load**: On first page load, `fetchDiagrams` may not have completed before URL sync fires `handleDiagramSelect`. The diagram is not yet in `currentDiagrams`, so `urlIdentifier = undefined || id` = numeric `id`.
4. **Server save endpoint only accepts UUID**: `POST /api/diagrams/save/:uid` at `server/routes/diagrams.ts:294` used `.eq("uid", uid)` exclusively — no fallback for numeric IDs. Even after client-side fixes, saves from diagrams without DB `uid` failed.
5. **Server create endpoint doesn't persist `uid`**: `POST /api/diagrams` at `server/routes/diagrams.ts:58` never accepted `uid` from the client — even if client generated a UUID, the DB row still had `uid = null`.

The chain: `activeDiagramId = numeric` → `saveDiagram` → `saveDraft(DraftType.ERD, numericId, data)` → `syncDrafts` → `/api/diagrams/save/${numericId}` → server `.eq("uid", numericId)` fails (numeric doesn't match UUID column).

**Fix (5 layers)**:

1. **Client `createDiagram` sends `uid` to server** ([`src/hooks/useDiagrams.ts`](./src/hooks/useDiagrams.ts):141): Generates `createUid = crypto.randomUUID()` and sends it as `uid` field in the POST body. If the API response omits `uid`, falls back to `createUid`. This ensures both the client object AND the DB row (via server fix #4) have a UUID.

2. **`selectDiagram` callback uses `urlIdentifier`** ([`src/hooks/useDiagramNavigation.ts`](./src/hooks/useDiagramNavigation.ts):118): Changed `selectDiagram(id, ...)` → `selectDiagram(urlIdentifier, ...)`. `urlIdentifier` (`diagram?.uid || id`) prefers UUID, preventing the callback inside `useERDSession.handleDiagramSelect` from overwriting with numeric `id`.

3. **Post-load UUID correction** ([`src/hooks/useERDSession.ts`](./src/hooks/useERDSession.ts):225): After diagram data loads (`finalData` contains `uid`), if `finalData.uid` differs from the raw `id` param, calls `setActiveDiagramId(finalData.uid)` to correct any numeric ID that was set by the race condition on initial load.

4. **Server save accepts numeric IDs + backfills `uid`** ([`server/routes/diagrams.ts`](./server/routes/diagrams.ts):291-320): The save endpoint now detects UUID vs numeric ID (same pattern as GET/:uid). When found by numeric `id` and `uid` is null, backfills with `crypto.randomUUID()`. This fixes saves for ALL existing diagrams that lack `uid`.

5. **Server create persists `uid` from client** ([`server/routes/diagrams.ts`](./server/routes/diagrams.ts):58): `POST /api/diagrams` now accepts optional `uid` from `req.body`. When the client sends a UUID, it's stored in the `uid` column — eliminating the DB-mismatch for newly created diagrams.

**Key insight**: The `useERDSession.handleDiagramSelect` (line 95) takes `(id, setActiveDiagramId, options?)`. Its line 104 calls `setActiveDiagramId(id)` with the raw `id` parameter. If `id` is numeric, `activeDiagramId` becomes numeric and the save chain uses numeric ID. The fix ensures `urlIdentifier` (UUID-preferring) flows through this callback path, AND the server accepts numeric IDs as fallback for existing data.

## Sync Service & Draft Management

- **`useSyncService`** ([`src/hooks/useSyncService.ts`](./src/hooks/useSyncService.ts)): reads pending drafts from IndexedDB (`localPersistence.getAllPendingSyncs()`) and POST/PUT to cloud API.
- **404 handling** (line 177-181): when a sync draft returns 404, draft is **marked as synced** (`markSynced`) — NOT deleted. This preserves data in IndexedDB (local-first) while preventing infinite retry loops. The stale numeric ERD draft pattern: pre-UUID-migration drafts stored with numeric `id` can't be found by server (`diagram id=9` may not exist), so 404 cleanup marks them as synced instead of retrying forever.
- **Stale draft cause**: before UUID fixes, `activeDiagramId` could be numeric → `saveDraft(ERD, 9, data)` → draft stuck because server couldn't query numeric ID by `uid` column. After server fix (numeric ID lookup via `.eq("id", identifier)`) + 404 markSynced, stale drafts stop retrying.

## ERD Double-Save Fix (Property Edit Race Condition)

### Bug: `handleEntityUpdate` sends 2 saves for 1 column type change

**Root Cause**: `handleEntityUpdate` in `WorkspaceProvider.tsx` (lines 365-380) has two independent save paths:
1. `updateEntity(updatedEntity)` → `takeSnapshot()` → increments `saveCounter` (triggers auto-save)
2. Direct `saveDiagram(currentNodes, ...)` → SAVE #1
3. Auto-save `useEffect` catches `saveCounter` change → 800ms timeout → `saveDiagram(...)` → SAVE #2

The 500ms guard inside the auto-save timeout (`Date.now() - lastSaveCallRef.current < 500`) is irrelevant because 800ms > 500ms — by the time the guard runs, SAVE #1 is 800ms old.

**Fix**: 100ms guard in [`src/hooks/useAutoSave.ts`](./src/hooks/useAutoSave.ts):130 — right after the `saveCounter` change check, if `Date.now() - lastSaveCallRef.current < 100`, consume the `saveCounter` and return early:
```ts
if (Date.now() - lastSaveCallRef.current < 100) {
  lastProcessedCounterRef.current = saveCounter;
  return;
}
```
This prevents the auto-save effect from scheduling its 800ms timeout when `handleEntityUpdate` already saved directly. The gap between direct save completion and React re-render is always < 1ms in practice, so 100ms is a safe threshold.

## Cross-Feature Chat (Satu Sesi untuk Semua Fitur)

- **Satu sesi chat bisa bahas Notes, ERD, dan Flowchart** — `entity_type`/`entity_uid` diisi saat sesi pertama dibuat, tidak berubah. Tapi konten chat fleksibel.
- **Radio pills** di `ChatInput.tsx` menampilkan actions sesuai **file fitur yang sedang dibuka** (bukan sesi `entity_type`). Ditentukan dari `entityType` prop (current view).
  - File: [`src/components/ai/AIChatPanel.tsx`](./src/components/ai/AIChatPanel.tsx):106 — `getActionsForView(currentViewType)` berdasarkan `entityType` (current file, bukan session origin)
  - File: [`src/components/ai/ChatInput.tsx`](./src/components/ai/ChatInput.tsx):198 — `showActions = !isStreaming && actions.length > 0` (tidak ada filter `isCrossEntity` — actions tetap muncul meski sesi dari view berbeda)
- **Pencegahan duplikat Create ERD/Flowchart**: setiap kali user klik tombol Create ERD/Flowchart dari chat, UID diagram yang dibuat disimpan di ref (`chatErdUidRef`) + localStorage (`chat_erd_uid`). Klik berikutnya → update existing diagram (navigate + pending DDL/JSON di localStorage), bukan create baru.
  - File: [`src/components/ai/ChatMessages.tsx`](./src/components/ai/ChatMessages.tsx): `chatErdUidRef`, `chatFlowchartUidRef`
  - `handleSidebarDiagramCreate`/`handleSidebarFlowchartCreate` return created object (changed from `Promise<void>` to `Promise<any>` di [`src/hooks/useSidebarHandlers.ts`](./src/hooks/useSidebarHandlers.ts) dan [`src/providers/WorkspaceContext.tsx`](./src/providers/WorkspaceContext.tsx))
- **Content-aware buttons**: setiap AI message bisa punya multiple action buttons:
  - Markdown/text → Replace/Append (routed ke content handler view aktif, e.g. NotesView)
  - SQL DDL → "Create/Update ERD" — membuka dialog inline di `ChatMessages.tsx`
  - Flowchart JSON → "Create Flowchart" / "Update Flowchart"
  - Semua tombol independen — tidak ada routing konflik
- **ERD Dialog (inline di `ChatMessages.tsx`)**: dialog yang muncul saat user klik Database button pada AI message yang mengandung SQL DDL:
  - **Radio-style cards** (`erdMode: 'create' | 'update' | null`): dua card selectable — "Create New" (indigo) dan "Update Existing" (amber). Tidak ada yang langsung eksekusi, semua tunggu tombol Submit.
  - **Submit button** di footer: disabled sampai mode dipilih (dan untuk update, sampai file target dipilih). Ada loading spinner (`erdModeConfirming`) selama eksekusi.
  - **Create New**: menampilkan table cards (parsed SQL sebagai card per tabel dengan kolom, PK/FK badge) — tidak ada element tambahan.
  - **Update Existing**: hanya menampilkan Target ERD selector (base-ui `Select`) — **tidak ada preview tabel sebelum file dipilih**. Diff muncul setelah user pilih file + data existing termuat.
  - **Unified diff (GitHub-style)**: setelah user pilih file target dan data existing selesai di-fetch (`erdExistingData` via `apiFetch`), menampilkan per tabel:
    - Header tabel (sticky, `bg-[#0d1117]` solid — no ghosting)
    - `+` green bg/emerald text untuk kolom baru atau modified
    - `-` red bg/red text untuk kolom dihapus
    - ` ` no bg/gray text untuk unchanged
    - Modified columns tampil sebagai `- old` + `+ new` sequence
    - Type column warna terpisah (`text-gray-500`/muted) dari nama kolom
  - **Filter ERD**: hanya diagram yang sesuai `projectId` sesi (atau tanpa project) yang muncul di file selector
  - **Dua localStorage key** tetap sama: `pending_create_erd_ddl` (Create) dan `pending_update_erd_ddl` (Update)
  - Dialog menggunakan `size="2xl"` (max-w-2xl) untuk ruang lebih lega
  - State: `erdMode`, `erdSql`, `erdUpdateUid`, `erdExistingData`, `erdFetchingExisting`, `erdModeConfirming`

### Schema Diff Engine

- **`computeSchemaDiff(currentNodes, currentEdges, proposedNodes, proposedEdges)`** ([`src/lib/schema-diff.ts`](./src/lib/schema-diff.ts)):
  - Match tabel by **name** (lowercase) — bukan node ID, karena `parseSQLToERD` generate random ID per parse
  - Menghasilkan `DiffResult` dengan `nodes` (annotated), `edges`, `newCount`, `modifiedCount`, `deletedCount`
  - Setiap node diberi `diffState`: `'new'` | `'modified'` | `'deleted'` | `undefined`
  - Setiap kolom diberi `diffState`: `'new'` | `'deleted'` | `undefined`
  - Posisi node original dipertahankan (`origNode.position`) agar diff tampil di layout yang familiar
- **ERDView `startDiff`** ([`src/components/views/ERDView.tsx`](./src/components/views/ERDView.tsx):230): menggunakan `computeSchemaDiff` untuk menampilkan diff overlay di canvas utama (merge panel + approve/reject per tabel)

