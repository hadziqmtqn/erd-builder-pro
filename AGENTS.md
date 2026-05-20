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
- All imported from `src/components/ai/` subdirectory; Prism imports (`prismjs/components/prism-sql`, etc.) moved into `ChatMessages.tsx` where `ReactMarkdown` + `CodeBlock` are used.
- `chatContainerRef` / `scrollContainerRef` naming: `ChatMessages` uses `scrollContainerRef` internally (same DOM element, renamed for clarity).

## User Message Collapse

- User messages longer than **>300 characters** are auto-collapsed (line-clamp-6)
- **"Show more"** / **"Show less"** button toggles per-message
- State tracked via `expandedMessages: Set<string | number>` in `ChatMessages.tsx` (internal state)

## Message Overflow Handling

- Message bubble (`ChatMessages.tsx:148`) has `overflow-x-auto` to prevent wide content (ASCII art, wide tables) from creating panel-level horizontal scroll
- Bubble width constrained by parent `max-w-[85%]` — overflow scrollbar appears inside the bubble only, not on the panel
- Applies to both user and assistant messages (no scrollbar unless content actually overflows)

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
- **No horizontal scroll** — `white-space: pre-wrap` + `word-break: break-word` wraps long lines
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
- **Column ID preservation**: when updating existing nodes, `mergeIntoDiagram` preserves existing column IDs for columns matching by name — this keeps edge `sourceHandle`/`targetHandle` references valid across multiple append calls. Without this, re-appending the same SQL regenerates column IDs and breaks FK edge column connections.
- **ALTER TABLE ADD COLUMN**: `applyToErdContent` now handles `ALTER TABLE ... ADD COLUMN` statements (in addition to `CREATE TABLE`). Parsed via `parseAlterTableAddColumn()` which extracts column name, type, nullability, and PK from each ADD COLUMN clause. Columns are added to existing nodes by table name match. Skips `FOREIGN KEY` / `CONSTRAINT` additions (handled by `parseSQLToERD`).
- **Two-pass FK edge generation**:
  - **Pass 1** (`parseSQLToERD.processRel`): creates edges only between nodes parsed from the same SQL block — skips FK references to tables outside the SQL (e.g., existing diagram tables like `users`)
  - **Pass 2** (in `applyToErdContent`, after `mergeIntoDiagram`): re-scans the full SQL text for FK references and creates edges by matching source/target against the **merged** node set (existing + newly parsed nodes)
  - **Inline FK regex**: `/FOREIGN KEY (...) REFERENCES table(...)/g` — finds source table by scanning backwards from match position for `CREATE TABLE <name>`
  - **ALTER TABLE FK regex**: `/ALTER TABLE <name> ADD FOREIGN KEY (...) REFERENCES table(...)/g` — extracts source table directly from the ALTER TABLE statement (avoids backward-scan ambiguity)
  - Helper `tryAddEdge(sName, sourceColName, targetTableName, targetColName)` checks both sides exist in merged nodes, deduplicates via `existingEdgeKeys`, creates a `smoothstep` Edge with `col-{id}-source`/`col-{id}-target` handles
  - Located in `src/components/ai/actions/erdActions.ts` (inline after `mergeIntoDiagram`)

## AI Action Dropdown Reference

Every AI action lives in `src/components/ai/AIActions.ts` and is registered under one of three views: `erd`, `notes`, or `flowchart`. Each action has a `buildPrompt(context)` that constructs the prompt dynamically from current view context (selected table, columns, edges, note content, etc.).

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

### Flowchart Architecture

#### Shared Helpers (`src/components/ai/actions/flowchartActions.ts`)
- `buildFlowchartLayout(nodes, edges, options?)` — positions nodes using a layered top-down layout engine with smart decision branch detection
- **Smart decision branch layout**: detects diamond nodes, shifts Yes-branch descendants right (+180px) and No-branch left (-180px) to prevent overlap
- `pickClosestHandles(sourceNode, targetNode)` — finds closest edge midpoints for clean connection routing
- `previewFlowchartContent(nodes, edges, content)` — parses AI response JSON into preview nodes/edges without mutating the canvas
- `applyInsertBetween(nodes, edges, content, sourceLabel, targetLabel)` — inserts a new node between two connected nodes, rewiring edges
- `applyReplaceAll(content)` — replaces entire flowchart with AI-generated JSON (for Import from Description)
- `collectDescendants(nodes, edges, nodeId, excludeNodeIds?)` — BFS descendant traversal for smart layout
- Edge parser supports multi-format: `sourceLabel/targetLabel`, `source/target`, `from/to`, label-as-fallback

#### SVG Preview Modal (`src/components/flowchart/FlowchartPreviewModal.tsx`)
- Pure SVG rendering (no ReactFlow) — eliminates XYFlow dual-instance conflict
- Zoom/pan controls (`scale`, `translate` state via mouse wheel + drag)
- Smart connection handles via `pickClosestHandles`; smoothstep-style paths between closest edge midpoints
- Connection dots rendered per node for visual clarity

#### Delete Symbol
- `deleteNode(nodeId)` in FlowchartView — cascading edge delete
- Keyboard Delete/Backspace shortcut
- Delete button in `SymbolPropertiesModal`

#### Auto-Save Guards (FlowchartView)
- Guards checked in order: `initialLoadRef` → `isParsingFromDataRef` → `isDraggingRef`
- `isDraggingRef` (ref, not state) skips auto-save during node drag; `onNodeDragStop` triggers single save at final position
- `handleEdgesChange` + `handleNodesChange` both filter out `type: 'select'` — selection changes never trigger auto-save or content-modified flag
- `useFlowchartChangeHandler` debounces save at 1.5s, updates `activeFlowchart.data` in workspace state

#### Content Handler Routing
- FlowchartView registers content handler with `['append', 'replace']` strategies
- Action ID routing: `flowchart-import` → `applyReplaceAll`, `flowchart-insert` → `applyInsertBetween`, generic → `previewFlowchartContent` + modal
- `pendingPreview` in FlowchartView stores parsed preview result; modal renders as SVG (no ReactFlow); main canvas state unaffected
- `pendingContentRef` stores raw AI response text; `handleConfirmAppend` re-parses via `applyToFlowchartContent` then sets state

### How `buildPrompt` Works
Each action's `buildPrompt(context)` receives the current view context:
- **ERD**: `{ nodes: Node<Entity>[], edges: Edge[], selectedNode: Node<Entity> | null, multiSelectedNodes?: Node<Entity>[], primaryNodeId?: string }`
- **Notes**: `{ content: string, title: string }`
- **Flowchart**: `{ nodes: Node[], edges: Edge[] }`

The prompt is built as a **prefix of the user message** (not system message) — this gives it higher prominence with fine-tuned models. Helper functions:
- `erdTableList(context)` — formats all tables as `name:\n  - col: TYPE 🔑`
- `erdRelationships(context)` — formats edges as `  source → target`
- `flowchartNodeList(context)` — formats symbols as `"label" (shape)`

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
