# ERD Builder Pro — Agent Memory

## Project Overview

ERD Builder Pro — React 18 + Vite 6 + Express.js. Frontend uses Tailwind CSS v4, `react-router-dom` v7 for routing, Supabase (Postgres) for persistence, Cloudflare R2 for asset storage.

## State Management

- **WorkspaceContext** ([`src/providers/WorkspaceContext.tsx`](file:///Users/meowpush/Projects/erd-builder-pro/src/providers/WorkspaceContext.tsx)): global app state (auth, documents, active IDs, XYFlow, undo/redo, panels)
- **AIActionContext** ([`src/contexts/AIActionContext.tsx`](file:///Users/meowpush/Projects/erd-builder-pro/src/contexts/AIActionContext.tsx)): AI assistant actions, `selectionText`, `registerContentHandler`/`applyContent` for `replace`/`append` strategies

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

Note: `saveNote` now directly calls `setNotes` to sync React state immediately after persist ([`src/hooks/useNotes.ts`](file:///Users/meowpush/Projects/erd-builder-pro/src/hooks/useNotes.ts):258). The debounced `handleNoteChange` also calls `saveNote` — the state update is redundant but harmless.

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

### Cross-Feature Context: `project_id` (Relasi, Bukan `referenced_file_info`)

- **Keputusan arsitektur**: Gunakan `project_id` (FK ke `projects`) di `ai_chat_sessions` sebagai sumber kebenaran, **bukan** `referenced_file_info` (JSONB).
- **Kenapa**: `referenced_file_info` adalah cache yang cepat stale (file dihapus/dipindah → referensi tidak valid). Dengan `project_id`, query dinamis semua file (`notes`, `diagrams`, `flowcharts`, `drawings`) per project dilakukan setiap `sendMessage()` — selalu fresh, zero maintenance.
- **Saat ini**: `createSession()` di `useAIChat.ts` **belum** menyertakan `project_id`. Implementasi plan ada di `.opencode/tasks/ai-cross-feature-integration.md`
- **Workspace safety**: `project_id` diisi dari active entity saat session dibuat. Saat user pindah project, `entityContext` berubah → session baru mendapat `project_id` baru. Session lama tetap di project_id lama.
- Dynamic sibling query: `buildSiblingContext()` parallel 4 tabel, greedy budget 6000 chars.

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

- `TiptapEditor` ([`src/components/TiptapEditor.tsx`](file:///Users/meowpush/Projects/erd-builder-pro/src/components/TiptapEditor.tsx)) — core rich text editor with StarterKit, tables, images, task lists, links, slash menu
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
- [`src/hooks/useFlowcharts.ts`](file:///Users/meowpush/Projects/erd-builder-pro/src/hooks/useFlowcharts.ts): `matchesFlowchartId` helper — `String(f.uid ?? f.id)` → `String(f.id) || String(f.uid)` dual check
- [`src/hooks/useDiagrams.ts`](file:///Users/meowpush/Projects/erd-builder-pro/src/hooks/useDiagrams.ts): all `diagramsRef.find` lookups — `String(d.id) || String(d.uid)` dual check (was `d.id` only or `String(d.uid ?? d.id)`)
- [`src/hooks/useNotes.ts`](file:///Users/meowpush/Projects/erd-builder-pro/src/hooks/useNotes.ts): all lookups and state filters — `String(n.id) || String(n.uid)` dual check
- [`src/hooks/useDrawings.ts`](file:///Users/meowpush/Projects/erd-builder-pro/src/hooks/useDrawings.ts): `matchesDrawingId` helper + all inline lookups/filters — `String(d.id) || String(d.uid)` dual check
- [`src/hooks/useAppMetadata.ts`](file:///Users/meowpush/Projects/erd-builder-pro/src/hooks/useAppMetadata.ts): `activeDocument`, `initialShareSettings`, `activeDrawing` lookups — dual check
- [`src/hooks/useAutoSave.ts`](file:///Users/meowpush/Projects/erd-builder-pro/src/hooks/useAutoSave.ts), `useFlowchartChangeHandler.ts`, `useDrawingChangeHandler.ts`, `useFocusSync.ts`: all `String(d.uid ?? d.id)` → dual check
- [`src/routes/TableRoute.tsx`](file:///Users/meowpush/Projects/erd-builder-pro/src/routes/TableRoute.tsx): `makeDeleteHandler` — sets `setTableDeleteDoc(item)` so MoveToTrashAlert gets the correct `activeDocument`
- [`src/hooks/useTrashHandlers.ts`](file:///Users/meowpush/Projects/erd-builder-pro/src/hooks/useTrashHandlers.ts): `handleTrashRestoreDiagram` fixed to use `file.uid ?? file.id` (was `file.id` only)
- [`src/components/modals/MoveToTrashAlert.tsx`](file:///Users/meowpush/Projects/erd-builder-pro/src/components/modals/MoveToTrashAlert.tsx): `handleConfirm` — added `'erd'` and `'notes'` to UUID-first extraction (`activeDocument?.uid ?? activeDocument?.id`), was only for flowchart/drawings

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
- [`src/providers/WorkspaceContext.tsx`](file:///Users/meowpush/Projects/erd-builder-pro/src/providers/WorkspaceContext.tsx): added `triggerTableRefresh: () => void`, `tableLoadingState`, `setTableLoadingState` to interface; added `isDiagramsLoading`, `isNotesLoading`, `isDrawingsLoading`, `isFlowchartsLoading` to interface
- [`src/providers/WorkspaceProvider.tsx`](file:///Users/meowpush/Projects/erd-builder-pro/src/providers/WorkspaceProvider.tsx): added `tableRefreshKey` state + `triggerTableRefresh` callback; added `tableLoadingState` state + `setTableLoadingState`; passed to context value and `useTableViewPagination`; exposed per-feature loading states in context value
- [`src/hooks/useTableViewPagination.ts`](file:///Users/meowpush/Projects/erd-builder-pro/src/hooks/useTableViewPagination.ts): uses `tableLoadingState` to decide silent vs non-silent fetch; resets to `'idle'` after fetch completes
- [`src/routes/AppLayout.tsx`](file:///Users/meowpush/Projects/erd-builder-pro/src/routes/AppLayout.tsx): added `setTableLoadingState('loading')` call in `onAfterDelete`
- [`src/routes/TableRoute.tsx`](file:///Users/meowpush/Projects/erd-builder-pro/src/routes/TableRoute.tsx): added `setTableLoadingState('loading')` on page/workspace change; passes loading state as `isLoading` prop

## AI Context for Notes (markdown-aware)

- `entityContextText` for Notes is sent to AI in **markdown format**, not plain text
- Uses `getMarkdownFromHtml()` from [`src/lib/markdownUtils.ts`](file:///Users/meowpush/Projects/erd-builder-pro/src/lib/markdownUtils.ts) (TurndownService)
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
- All imported from [`src/components/ai/`](file:///Users/meowpush/Projects/erd-builder-pro/src/components/ai/) subdirectory; Prism imports (`prismjs/components/prism-sql`, etc.) moved into `ChatMessages.tsx` where `ReactMarkdown` + `CodeBlock` are used.
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
- Context: [`src/contexts/AIActionContext.tsx`](file:///Users/meowpush/Projects/erd-builder-pro/src/contexts/AIActionContext.tsx), [`src/components/ai/actions/notesActions.ts`](file:///Users/meowpush/Projects/erd-builder-pro/src/components/ai/actions/notesActions.ts)

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
- **`useERDSession`** ([`src/hooks/useERDSession.ts`](file:///Users/meowpush/Projects/erd-builder-pro/src/hooks/useERDSession.ts)): State management using `useNodesState<Node<Entity>>` and `useEdgesState<Edge>` from XYFlow. Exposes: `addEntity()`, `updateEntity(entity)`, `deleteEntity(id)`, `handleEdgeUpdate()`, `deleteEdge()`, `onConnect`, `undo/redo`, `takeSnapshot`
- **`useDiagrams`** ([`src/hooks/useDiagrams.ts`](file:///Users/meowpush/Projects/erd-builder-pro/src/hooks/useDiagrams.ts)): Diagram metadata CRUD (list, create, rename, delete), persist entities/columns as JSON to DB

### ERD → AI Flow
1. `ERDView` passes `{ nodes, edges, selectedNode }` context to `AIActionButton`
2. `AIActions.ts` builds prompt via `erdTableList()` + `erdRelationships()` → text representation
3. `sendAction(prompt, actionId, onResult)` opens chat panel — `actionId` + `onResult` for auto-apply on stream complete
4. AI responds, then auto-applied via `onResult` → `applyToErdContent` → `setNodes`/`setEdges`
5. Manual Append button also works (auto-detects SQL in response), Replace is hidden for ERD
6. Content handler registered with `['append']` strategy only — `contentHandlerStrategies` hides Replace button in AIChatPanel
7. ERD actions: `erd-generate-sql`, `erd-explain-table`, `erd-suggest-indexes`, `erd-seed-data`

### AI → ERD Content Application (Two-Pass FK Edge Generation)
- `applyToErdContent()` in [`src/components/ai/actions/erdActions.ts`](file:///Users/meowpush/Projects/erd-builder-pro/src/components/ai/actions/erdActions.ts) — parses SQL DDL (`extractSQLFromMarkdown` + `parseSQLToERD`), merges via `mergeIntoDiagram`
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
  - Located in [`src/components/ai/actions/erdActions.ts`](file:///Users/meowpush/Projects/erd-builder-pro/src/components/ai/actions/erdActions.ts) (inline after `mergeIntoDiagram`)

## AI Action Dropdown Reference

Every AI action lives in [`src/components/ai/AIActions.ts`](file:///Users/meowpush/Projects/erd-builder-pro/src/components/ai/AIActions.ts) and is registered under one of three views: `erd`, `notes`, or `flowchart`. Each action has a `buildPrompt(context)` that constructs the prompt dynamically from current view context (selected table, columns, edges, note content, etc.).

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

- `buildFlowchartContext()` in [`src/hooks/aiEntityContext/flowchart.ts`](file:///Users/meowpush/Projects/erd-builder-pro/src/hooks/aiEntityContext/flowchart.ts) now appends `[Flowchart Editor Format]` instructions describing the JSON schema (`{ nodes, edges }`), supported shapes, and colors
- AI is instructed to ask the user whether they prefer **Flowchart Editor JSON** (for visual editing), **Mermaid** (for documentation), or **plain text explanation**
- This ensures the AI can respond with parseable JSON when the user wants to create/modify a diagram, making the Append/Replace button appear
- `hasFlowchartJSON()` in `ChatMessages.tsx` detects `{ nodes: [...] }` inside ` ```json ` blocks or raw JSON

### Flowchart Architecture

#### Shared Helpers ([`src/components/ai/actions/flowchartActions.ts`](file:///Users/meowpush/Projects/erd-builder-pro/src/components/ai/actions/flowchartActions.ts))
- `buildFlowchartLayout(nodes, parsed, labelToIds, idToNode)` — positions nodes using a layered top-down layout engine with smart decision branch detection
- **Smart decision branch layout**: detects diamond nodes, shifts Yes-branch descendants right (+180px) and No-branch left (-180px) to prevent overlap
- `pickClosestHandles(sourceNode, targetNode)` — finds closest edge midpoints for clean connection routing
- `previewFlowchartContent(nodes, edges, content)` — parses AI response JSON into preview nodes/edges without mutating the canvas
- `applyInsertBetween(nodes, edges, content, sourceLabel, targetLabel)` — inserts a new node between two connected nodes, rewiring edges
- `applyReplaceAll(content)` — replaces entire flowchart with AI-generated JSON (for Import from Description)
- `collectDescendants(nodes, edges, nodeId, excludeNodeIds?)` — BFS descendant traversal for smart layout
- Edge parser supports multi-format: `sourceLabel/targetLabel`, `source/target`, `from/to`, label-as-fallback
- **`labelToIds`** (`Map<string, string[]>`): array-based label mapping (supports duplicate labels). `resolveEdgeIds` uses `sourceIndex`/`targetIndex` (1‑based) as highest priority, then `sourceLabel`/`targetLabel`, then legacy `source`/`from`. If label lookup finds >1 match, resolves to the first entry.

#### SVG Preview Modal ([`src/components/flowchart/FlowchartPreviewModal.tsx`](file:///Users/meowpush/Projects/erd-builder-pro/src/components/flowchart/FlowchartPreviewModal.tsx))
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
- **Memoized column sort**: `sortedColumns` derived via `useMemo` keyed on `columnOrderHash` — no re-sort on unrelated data changes
- **Filter `select` changes**: `handleNodesChangeLocal` in ERDView filters out `type: 'select'` changes before forwarding to React Flow (mirrors FlowchartView pattern) — prevents selection-only events from cascading through styledNodes/styledEdges
- **Targeted memo comparator**: replaced `JSON.stringify` in `ERDView.memo` comparator with field-by-field comparison (`nodesEqual`/`edgesEqual` functions) — avoids serializing 90+ columns on every parent re-render
- **FK detection optimization**: replaced `JSON.stringify(newColumns) !== JSON.stringify(node.data.columns)` with inline `_is_fk !== isFk` comparison in `useERDSession.ts`

### Flowchart AI Content Parsing Performance

- **`Array.shift()` → index pointer**: both `collectDescendants()` and the Sugiyama layer-assignment BFS used `q.shift()` which is O(n²). Both now use `q[idx++]` pointer pattern — O(n).
- **`pickClosestHandles` precompute**: handle positions are precomputed per-node via `computeHandlePoints()` + `nodePosMap`, then stored in `srcHandleCache`/`tgtHandleCache` for O(1) reuse across all edges. Old code recomputed `handlePositions[side](sx, sy)` inside a 16-iteration double loop for every edge.
- **Diamond BFS early-exit**: if both yes/no children are already shifted (by a previous diamond), the function skips BFS entirely.
- **`shiftPos` helper**: extracted position mutation + `shiftedNodes.add()` into a single `shiftPos(id, dx)` function — no code duplication between yes/no/child branches.
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
- **Delete Group**: `deleteGroup` di FlowchartView — hapus semua node yang punya `section` (grup) yang sama. Tombol "Hapus Grup" muncul di `SymbolPropertiesModal` untuk Start node yang punya Group Title.
- **`groupId`**: setiap Start node punya unique key (e.g. `grp_quickstart`) — auto-generated saat node dibuat, tampil di AI context sebagai `[id:grp_xxx]`. AI bisa referensi via `sourceGroupId`/`targetGroupId` di JSON response.
- **AI grouping**: `flowchartSymbolDetail()` groups symbols by section using BFS from each Start node. Each group rendered under `=== {section} [id:grp_xxx] ===` header. Supports overlapping groups (user can have multiple Start nodes sharing the same End).
- **Insert Between resolution order**: `sourceGroupId` → `sourceIndex` → `sourceLabel` (prioritas tertinggi ke terendah).

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
- [`src/components/NavActionsMenu.tsx`](file:///Users/meowpush/Projects/erd-builder-pro/src/components/NavActionsMenu.tsx): `noteContent` prop, `getTextStats` + `stripHtml` helpers
- [`src/components/MainHeader.tsx`](file:///Users/meowpush/Projects/erd-builder-pro/src/components/MainHeader.tsx): `noteContent` prop forwarded to `NavActionsMenu`
- [`src/routes/AppLayout.tsx`](file:///Users/meowpush/Projects/erd-builder-pro/src/routes/AppLayout.tsx): passes `activeNote?.content` as `noteContent`

## AGENTS.md File References Convention

- All `src/` file paths in AGENTS.md use clickable `file://` links with backtick formatting: `` [`src/path/file.ts`](file:///abs/path/src/path/file.ts) ``
- Links open files locally when clicked in supporting terminals
- Relative sibling paths (without `src/` prefix, e.g. after a comma) are NOT linked

## @Mentions as Clickable Links in Chat

- User messages in `ChatMessages.tsx` parse `@FileName` patterns via the same regex as `resolveMentions` (`/@([^\s\n]+)/g`)
- Matching mentions render as cyan-colored `<Link>` elements (underline on hover) that navigate to the referenced file
- Route lookup: note → `/notes/{uid}`, diagram → `/erd/{uid}`, flowchart → `/flowchart/{uid}`, drawing → `/drawing/{uid}`
- `mentionFiles` prop passed from `AIChatPanel` to `ChatMessages` (same data used for ChatInput dropdown)
- Unmatched `@text` (no file found) remains as plain text — unchanged
- Uses `renderMentionText(text)` function called inside the user message `<p>` element, replacing raw `{displayText}`
