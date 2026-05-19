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

Note: `saveNote` now directly calls `setNotes` to sync React state immediately after persist (src/hooks/useNotes.ts:258). The debounced `handleNoteChange` also calls `saveNote` — the state update is redundant but harmless.

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

### Referenced File Info (JSONB)

- `ai_chat_sessions.entity_type + entity_uid` = entry point (file where chat was started)
- `ai_chat_sessions.referenced_file_info` = array of related files within one workspace (cross-feature: Notes + ERD + Flowchart)
- Example: chat started from a Note in EMPLOYMENT project, AI needs to see ERD also in EMPLOYMENT → ERD recorded in `referenced_file_info`
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
- `registerContentHandler(handler, strategies?)` — second param is supported `('replace' | 'append')[]`, defaults to `['replace', 'append']`
- `contentHandlerStrategies` exposed via `useAIAction()` — AIChatPanel checks this to show/hide Replace vs Append buttons
- Strategy type: `'replace' | 'append'`
- `selectionText` is single source of truth — passed as argument to `sendMessage()` (not closed over)
- `cleanIdentifier()` (local to `erdActions.ts`): strips backticks/quotes/brackets from SQL identifiers, e.g. `` `users` `` → `users`
- React.memo on NotesView

## AI Context for Notes (markdown-aware)

- `entityContextText` for Notes is sent to AI in **markdown format**, not plain text
- Uses `getMarkdownFromHtml()` from `src/lib/markdownUtils.ts` (TurndownService)
- `<h2>Heading</h2>` → `## Heading`, AI sees heading structure → responds in markdown → `marked.parse()` produces correct `<h2>`
- Applies to all AI actions (Improve Grammar, Summarize, etc.) and direct chat

## AIChatPanel Component Architecture

`AIChatPanel.tsx` (~358 lines) was refactored from a monolithic 833-line component into an orchestrator that delegates to extracted sub-components:

```
src/components/ai/
├── AIChatPanel.tsx      (358 loc) — orchestrator: state, effects, layout
├── ChatMessages.tsx     (277 loc) — message list + scroll effects + expand/copy
├── ChatInput.tsx        (124 loc) — textarea + send + AI Actions dropdown
├── CodeBlock.tsx         (48 loc) — Prism syntax highlighting + copy button
├── SessionItem.tsx       (32 loc) — session row in sidebar
├── SelectionBar.tsx      (28 loc) — active selection indicator bar
└── MinimizedBar.tsx      (22 loc) — floating pill when panel is minimized
```

### Component Responsibilities

- **AIChatPanel**: owns sessions/input state, draft save/restore, click-outside minimize, auto-fill prompt from AI actions, pendingAction stream callback. Renders header + sub-components.
- **ChatMessages**: fully self-contained — owns `scrollContainerRef`, `messagesEndRef`, `userScrolledUpRef` for auto-scroll, `expandedMessages` (Set<string | number>) for collapse/expand, `copiedMsgId` for copy feedback. Receives messages/isStreaming as props. No scroll state lifted to parent.
- **ChatInput**: receives `input`, `isStreaming`, ref, actions list. Renders textarea + send + AI Actions dropdown + stop button. `getActionIcon` helper maps action IDs to Lucide icons.
- **CodeBlock**: receives `language`, `value`, `copyToClipboard`. Renders Prism-highlighted code with language label and copy button.
- **SessionItem**: receives `session`, `isActive`, `onClick`, `onDelete`. Renders session title row with delete button.
- **SelectionBar**: receives `hasActiveSession`, `selectionText`, `onClear`. Renders active selection chip with X button.
- **MinimizedBar**: receives `title`, `onExpand`. Renders floating sparkle pill.

### Key Changes

- `DRAFT_KEY_PREFIX` and `getDraftKey()` remain in `AIChatPanel.tsx` — draft is saved only on close via `handleClose` (no more per-keystroke `useEffect`). Restore on mount preserved.
- `error` variable from `useAIChat` no longer destructured in AIChatPanel (unused).
- All imported from `src/components/ai/` subdirectory; Prism imports (`prismjs/components/prism-sql`, etc.) moved into `ChatMessages.tsx` where `ReactMarkdown` + `CodeBlock` are used.
- `chatContainerRef` / `scrollContainerRef` naming: `ChatMessages` uses `scrollContainerRef` internally (same DOM element, renamed for clarity).

## User Message Collapse

- User messages longer than **>300 characters** are auto-collapsed (line-clamp-6)
- **"Show more"** / **"Show less"** button toggles per-message
- State tracked via `expandedMessages: Set<string | number>` in `ChatMessages.tsx` (internal state)

## Auto-scroll Behavior

- Auto-scroll to bottom on new messages only if user hasn't manually scrolled up
- `userScrolledUpRef` tracks manual scroll with 50px threshold from bottom
- `scrollContainerRef` in `ChatMessages.tsx` for scroll event listener

## Code Blocks (Prism)

- AI chat responses use `ReactMarkdown` with custom `CodeBlock` component for fenced code blocks
- Syntax highlighting via `prismjs` + `prism-themes/themes/prism-dracula.css` (imported in `index.css:8`)
- Supported languages: sql, javascript, typescript, bash, json (imported in `ChatMessages.tsx`)
- Code blocks render with dark background (`#0d1117`), language label bar, copy button on hover
- **No horizontal scroll** — `white-space: pre-wrap` + `word-break: break-word` wraps long lines
- Inline code (backticks) uses `bg-black/30 px-1 py-0.5 rounded text-[11px]` styling
- Code block wrapper has `overflow-x-auto` + `custom-scrollbar` as fallback for extremely long unbreakable content

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
- Context: `src/contexts/AIActionContext.tsx`, `src/components/ai/actions/notesActions.ts`

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
- **`useERDSession`** (`src/hooks/useERDSession.ts`): State management using `useNodesState<Node<Entity>>` and `useEdgesState<Edge>` from XYFlow. Exposes: `addEntity()`, `updateEntity(entity)`, `deleteEntity(id)`, `handleEdgeUpdate()`, `deleteEdge()`, `onConnect`, `undo/redo`, `takeSnapshot`
- **`useDiagrams`** (`src/hooks/useDiagrams.ts`): Diagram metadata CRUD (list, create, rename, delete), persist entities/columns as JSON to DB

### ERD → AI Flow
1. `ERDView` passes `{ nodes, edges, selectedNode }` context to `AIActionButton`
2. `AIActions.ts` builds prompt via `erdTableList()` + `erdRelationships()` → text representation
3. `sendAction(prompt, actionId, onResult)` opens chat panel — `actionId` + `onResult` for auto-apply on stream complete
4. AI responds, then auto-applied via `onResult` → `applyToErdContent` → `setNodes`/`setEdges`
5. Manual Append button also works (auto-detects SQL in response), Replace is hidden for ERD
6. Content handler registered with `['append']` strategy only — `contentHandlerStrategies` hides Replace button in AIChatPanel
7. ERD actions: `erd-generate-sql`, `erd-explain-table`, `erd-suggest-indexes`, `erd-seed-data`

### AI → ERD Content Application (Two-Pass FK Edge Generation)
- `applyToErdContent()` in `src/components/ai/actions/erdActions.ts` — parses SQL DDL (`extractSQLFromMarkdown` + `parseSQLToERD`), merges via `mergeIntoDiagram`
- Pattern: `registerContentHandler` → `AIChatPanel` calls `onStreamComplete` → `pendingAction.onResult` → apply mutations
- Auto-apply via `sendAction` `actionId` + `onResult` callback; manual append works for non-action chat responses
- `extractSQLFromMarkdown` handles ` ```sql ``` ` fences and raw SQL
- `mergeIntoDiagram` matches entities by name (not ID) — handles AI-generated IDs vs existing IDs
- Uses full replace approach (`setNodes`/`setEdges`) with `takeSnapshot` for undo
- **Two-pass FK edge generation**:
  - **Pass 1** (`parseSQLToERD.processRel`): creates edges only between nodes parsed from the same SQL block — skips FK references to tables outside the SQL (e.g., existing diagram tables like `users`)
  - **Pass 2** (in `applyToErdContent`, after `mergeIntoDiagram`): re-scans the full SQL text for FK references and creates edges by matching source/target against the **merged** node set (existing + newly parsed nodes)
  - **Inline FK regex**: `/FOREIGN KEY (...) REFERENCES table(...)/g` — finds source table by scanning backwards from match position for `CREATE TABLE <name>`
  - **ALTER TABLE FK regex**: `/ALTER TABLE <name> ADD FOREIGN KEY (...) REFERENCES table(...)/g` — extracts source table directly from the ALTER TABLE statement (avoids backward-scan ambiguity)
  - Helper `tryAddEdge(sName, sourceColName, targetTableName, targetColName)` checks both sides exist in merged nodes, deduplicates via `existingEdgeKeys`, creates a `smoothstep` Edge with `col-{id}-source`/`col-{id}-target` handles
  - Located in `src/components/ai/actions/erdActions.ts` (inline after `mergeIntoDiagram`)

### Context Prominence Strategy

- `entityContextText` (schema/note content) injected as **prefix of user message**, not system message
- Some models (fine-tuned instruct models) give lower weight to system messages; user message gets higher prominence
- Order: `[entity context]` → `[Selected text]` → `User request: ...`
- Fallback: if `entityContextText` is null, calls `fetchEntityContext()` to fetch from Supabase (used when chat panel is opened outside a specific entity page)
- `fetchEntityContext` result also injected as user message prefix (same prominence treatment)
