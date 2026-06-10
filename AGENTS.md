# ERD Builder Pro — Agent Memory

## Project Overview

ERD Builder Pro — React 18 + Vite 6 + Express.js. Frontend uses Tailwind CSS v4, `react-router-dom` v7 for routing, Supabase (Postgres) for persistence, Cloudflare R2 for asset storage. All frontend DB access goes through `apiFetch` → Express → Prisma — no direct Supabase client in the frontend.

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

### Cross-Feature Context: Session Scoping

- **Architecture decision**: Use `project_id` (FK to `projects`) in `ai_chat_sessions` as the source of truth, **not** `referenced_file_info` (JSONB).
- **Why**: `referenced_file_info` is a cache that goes stale quickly (files deleted/moved → invalid references). With `project_id`, dynamic queries of all files per project are done on every `sendMessage()` — always fresh, zero maintenance.
- **`createSession()`**: Sets `project_id` if available, plus `entity_type` + `entity_uid` as the origin file identifier.
- **Session scoping (`buildSessionUrl` / `listSessions`)**: [`src/hooks/useAIChat.ts`](./src/hooks/useAIChat.ts) always sends `entity_type` + `entity_uid` and `project_id` (if available) as query params. No `getUserId()` guard exists — the server auth middleware (JWT cookie) handles user filtering, eliminating the race where auth resolves after `listSessions` callbacks were already memoized.
- **Server (`/sessions` GET)** at [`server/routes/ai-chat.ts`](./server/routes/ai-chat.ts):8 — three-tier query:
  - `project_id` + `entity_uid` → OR query: `project_id = X OR (project_id IS NULL AND entity_type = Y AND entity_uid = Z)` — shows project sessions AND file's own orphan sessions
  - `project_id` only → `project_id = X`
  - `entity_uid` only (no project) → `project_id IS NULL AND entity_type = Y AND entity_uid = Z` — file's orphan sessions only
  - No params → `return res.json([])` — was `project_id IS NULL` before (leaked ALL orphan sessions across files)
- **Why `entity_uid` in listing**: Orphan sessions (`project_id IS NULL`) need file-level scoping. Without entity params, the server returns all orphan sessions regardless of origin file — leaking sessions across notes/diagrams with null project_id.
- **Why no `getUserId()` guard**: The old `buildSessionUrl` returned the URL with NO params when `getUserId()` returned null (auth not loaded on initial render). `listSessions` deps didn't include user ID, so it never refetched. The auth middleware on the server always extracts `user_id` from JWT, making the client-side guard unnecessary.
- **`userRef` removed** from `useAIChat.ts` — was only used by the removed `getUserId()` helper.
- **Workspace safety**: `project_id` is filled from the active entity when the session is created. When the user switches projects, `entityContext` changes → new session gets a new `project_id`. Old sessions stay with their old project_id.
- Dynamic sibling query: `buildSiblingContext()` parallel 4 tabel, greedy budget 6000 chars.

### Dynamic `project_id` Sync on `sendMessage`

Every time user sends a message in AI Chat, `sendMessage` in `useAIChat.ts` does:

1. **Read active file's `project_id`** from `projectIdRef.current` (ref always synced with `projectId` prop from AppLayout)
2. **Compare** with `currentSession.project_id`
3. **If different**, update the session in Supabase:
   - `UPDATE ai_chat_sessions SET project_id = $1, updated_at = NOW() WHERE id = $2`
   - Sync local state (`setCurrentSession`, `setSessions`)
4. **Use `liveProjectId`** (not `currentSession.project_id`) for `buildSiblingContext` — if `null`, sibling context is not injected

**3 handled scenarios:**
- **File moves from project A → B**: session.project_id becomes B → sibling context queries project B
- **File moves to uncategorized (NULL)**: session.project_id becomes NULL → sibling context skipped
- **Session private (NULL) enters workspace**: session.project_id becomes WORKSPACE → sibling context active

**Why use ref**: `sendMessage` is a `useCallback` with limited deps (`currentSession`, `messages`, `entityContextText`, `entityContext`). `projectId` cannot be a dependency because it would re-create the callback every time a file moves project. The ref (`projectIdRef`) breaks the dependency chain — its value is always read fresh inside the callback without needing re-creation.

**File**: [`src/hooks/useAIChat.ts`](./src/hooks/useAIChat.ts):73-74 (ref + effect), :417-434 (sync logic), :441 (sibling context using `liveProjectId`)

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

## Searchable Type Select (ERD Column Type Dropdown)

- **Problem**: 40+ SQL data types in `COLUMN_TYPES` ([`src/lib/utils.ts:8-28`](./src/lib/utils.ts)) — flat dropdown was hard to scan.
- **Solution**: New [`SearchableTypeSelect`](./src/components/SearchableTypeSelect.tsx) component — wraps base-ui's `Select` with a sticky search input at the top of the popup.
- **Behavior**:
  - Auto-focus search input when popup opens (10ms delay so popup mounts first)
  - Filter `COLUMN_TYPES` case-insensitive substring match as user types
  - Empty state: `No types match "..."` message
  - **Enter** in search input → select first filtered item + close
  - **Escape** → close
  - Up/Down arrow keys still navigate items (base-ui default)
  - Search resets on close (handled in `useEffect` on `open` state)
  - Search input is `sticky top-0` with border-bottom so it stays visible while scrolling
  - `onPointerDown` / `onClick` / `onKeyDown` stopPropagation prevents base-ui from intercepting clicks/keys inside the input
- **Critical fix — focus-out close**: base-ui's `Select` fires `onOpenChange(false, { reason: 'focus-out' })` when focus moves from the trigger to the search Input. Since the Input is INSIDE the popup, this is a false positive that closes the dropdown mid-typing. Fix: in `onOpenChange`, call `eventDetails.cancel()` when reason is `'focus-out'` to override base-ui's default close. Real outside clicks (`'outside-press'`) and Escape still close normally. See [base-ui SelectRoot.d.ts:143](./node_modules/@base-ui/react/esm/select/root/SelectRoot.d.ts) for full reason list.
- **Wired into**: [`PropertiesPanel.tsx`](./src/components/PropertiesPanel.tsx) — replaced the plain `<Select>` for column type. Other column properties (PK, NotNull) keep their own buttons.
- **Unused imports cleaned**: removed `Select*` and `COLUMN_TYPES` from `PropertiesPanel.tsx` imports (now lives inside `SearchableTypeSelect`).

## ERD Table Duplicate

- **Feature**: Right-click dropdown on any ERD table → **Duplicate** clones the table with all its columns but a unique name (e.g., `users` → `users_1`). Relationships are **NOT** duplicated.
- **File**: [`src/components/EntityNode.tsx`](./src/components/EntityNode.tsx) — `handleDuplicate` handler, `Copy` (Lucide) menu item between Edit and Delete Table.
- **Logic**: [`src/hooks/useERDSession.ts`](./src/hooks/useERDSession.ts) `duplicateEntity(sourceId)`:
  1. Find source node by id
  2. Generate new entity id (random 9-char) + use existing `getUniqueName(baseName, nodes)` for unique name with `_1`, `_2` suffix pattern
  3. Deep-clone columns with **NEW** column ids (so duplicate is fully independent — no shared state with source)
  4. Reset `_is_fk: false` on all cloned columns (new entity has no outgoing edges)
  5. Position offset from source: `+60px` x, `+120px` y (visible but not overlapping)
  6. Same color as source (preserves visual identity)
  7. `takeSnapshot` for undo support
  8. `setSelectedNodeId(newId)` so the new entity becomes selected
  9. Toast: `Duplicated as "{name}" — N columns copied. Relationships were not duplicated.`
- **Context wiring**: `duplicateEntity` exposed in [`WorkspaceContext.tsx`](./src/providers/WorkspaceContext.tsx) interface + threaded through [`WorkspaceProvider.tsx`](./src/providers/WorkspaceProvider.tsx) (3 places: destructure line 235, context value lines 927/1007).
- **Read-only mode**: `isReadOnly` (public view or diff mode) hides the dropdown — Duplicate unavailable in those modes.
- **Auto-save**: `setNodes` triggers the auto-save effect automatically (no manual `saveDiagram` call needed).

## Removed Features

- **Replace Selected** — removed entirely (context: `selectionRange`, `setSelectionRange`, `replaceSelectedText`, `registerReplaceSelected`; UI: Scissors button in AIChatPanel; handler in TiptapEditor/NotesView). The `insertContentAt` + `marked.parse` combo failed because `marked.parse` wraps in `<p>` (block) which can't be inserted inline — schema rejects nested paragraphs.
- **`applyColorScheme`** — removed from `flowchartActions.ts`. The function mapping label → hex color was never wired to any action and was deemed not in line with best practice (colors should not be forced per label by AI).

## Notable Conventions

> **IMPORTANT**: All AGENTS.md content must be written in **English only**. No other languages allowed.

### Desktop Keyboard Shortcut: Settings (CMD+, / CTRL+,)

- Listener registered in [`src/routes/AppLayout.tsx`](./src/routes/AppLayout.tsx) via `useEffect`
- **Tauri-only**: returns early if `!window.__TAURI__ && !window.__TAURI_INTERNALS__` — never fires on web
- **Platform-aware**: `navigator.platform.includes('mac')` → `metaKey`; else `ctrlKey`
- **Key**: `,` (comma). `preventDefault()` to avoid browser quirks
- **Input guard**: skips when `e.target` is `INPUT`/`TEXTAREA`/`contentEditable` — won't fire while typing in any field
- Calls `setIsSettingsOpen(true)` from `WorkspaceContext` (not directly opening dialog) — preserves active tab, lets the dialog open with whatever tab was last selected

### Account Update — Mode-Aware (Desktop / Web Pure PG / Web Supabase)

Three modes detected via `/api/auth-config` (read-only public endpoint):

| Mode | `supabaseAuth` | `isDesktop` | `isLocalPostgres` | `supportsPasswordUpdate` | Behavior |
|------|----------------|-------------|-------------------|--------------------------|----------|
| **Desktop (Tauri)** | `false` | `true` | `false` | `false` | Edit name + email, **no password** (fixed at install) |
| **Web Pure PG** | `false` | `false` | `true` | `true` | Edit name + email + password (verified by current password) |
| **Web Supabase** | `true` | `false` | `false` | `false` | **Read-only display** (blue info banner explains) |

**Files**:
- [`src/components/ai/AccountTab.tsx`](./src/components/ai/AccountTab.tsx) — form UI, fetches `/api/auth-config` once on mount, manages local form state
- [`server/routes/auth.ts`](./server/routes/auth.ts): `PUT /api/account` — `authenticate` + `validate(updateAccountSchema)`, `useLocalAuth()` guard
- [`server/lib/validation.ts`](./server/lib/validation.ts): `updateAccountSchema` — at least one of name/email/newPassword required
- [`server/routes/auth.ts`](./server/routes/auth.ts): extended `GET /api/auth-config` with `isDesktop`, `isLocalPostgres`, `supportsPasswordUpdate`

**Server logic**:
- `useLocalAuth()` false → 403 "managed by your auth provider"
- `newPassword` provided + `!isLocalPostgres()` → 400 "not available in desktop mode"
- Email/password change → `currentPassword` required, `verifyPassword()` check
- Email change → uniqueness check (excluding current user)
- On success → `prisma.user.update({ where: { id: userId }, data })`
- Frontend calls `checkAuth()` after success to sync `user_metadata` with updated email/name

**`/me` reads from User table, not Session**:
- For local auth, `GET /api/me` originally returned `session.email` / `session.name` (set at login). After account update, `/me` returned stale session data even though `User` table was correctly updated.
- Fix: in [`server/routes/auth.ts`](./server/routes/auth.ts) `/me` handler, after `getSession(token)` succeeds, do `prisma.user.findFirst({ where: { id: session.userId }, select: { id, email, name } })` and return those values. Session table is now used only for token verification + ownership, not for profile data.

**User name field convention across auth modes**:
- **Supabase Auth** returns `user.user_metadata.full_name` and `user.user_metadata.avatar_url` (Supabase's own convention).
- **Local auth** (desktop SQLite + web pure PG) returns `user.user_metadata.name` (our convention, set at login from `email.split('@')[0]` and updated via account settings).
- **Components reading user display name** MUST check both fields: `user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0] || "User"`. See [`src/components/ai/AccountTab.tsx`](./src/components/ai/AccountTab.tsx) and [`src/components/nav-user.tsx`](./src/components/nav-user.tsx) for the canonical pattern.
- A previous bug: `nav-user.tsx` only checked `full_name`, so local-auth users always saw their email prefix in the sidebar (e.g., "erfan" instead of "John Doe") — even after updating their name through AccountTab. Always check both fields.

**`useAuth` is now a Context-based hook (not a regular hook)**:
- The original `useAuth` was a regular hook — each call created its own `useState` for `user`, `isAuthenticated`, `isGuest`. This meant `AccountTab`'s `setUser` did not affect `WorkspaceProvider`'s `user` state, so the sidebar/nav-user wouldn't update after account changes without a page reload.
- **Fix** ([`src/hooks/useAuth.tsx`](./src/hooks/useAuth.tsx)): now exports `AuthProvider` (wraps the entire app in [`main.tsx`](./src/main.tsx)) and `useAuth()` consumes a shared `AuthContext`. All `useAuth()` calls share the same state.
- **`setUser` is exposed**: callers can update the user state directly with response data, avoiding extra `/api/me` round-trips. Used by `AccountTab` to immediately sync the sidebar after `PUT /api/account` returns.
- File renamed `.ts` → `.tsx` because `AuthProvider` returns JSX. All existing imports (`'./hooks/useAuth'`, `'@/hooks/useAuth'`) work without modification — TypeScript resolves `.tsx` automatically.

**Client UI**:
- Mode banners: blue (Supabase read-only), amber (desktop no password), green (pure PG full)
- Save button disabled when no changes or `isSaving`
- Show/Hide password toggle (Eye/EyeOff) — disabled in desktop mode
- `hasChanges` derived: name OR email OR newPassword differ from `user.*`
- Toast: success on save, error with server message on failure

### Tauri Titlebar (Native, with `theme: "Dark"`)

- **Decision**: Use native Tauri titlebar (`decorations: true`) + `theme: "Dark"` on macOS to get a dark gray native titlebar matching the app's dark theme.
- **Config** ([`src-tauri/tauri.conf.json`](./src-tauri/tauri.conf.json)): `"decorations": true, "theme": "Dark"`. Do NOT add `transparent: true` or `titleBarStyle: "Transparent"` — they break vibrancy layering (body has opaque `bg-background`, so NSVisualEffectView would be hidden).
- **No `MacOSTitleBar` component**: `src/components/MacOSTitleBar.tsx` was deleted. Custom titlebar (with `app-region: drag/no-drag` + WebKit buttons) had bugs: Tauri 2 ignores `data-tauri-drag-region="false"` value (checks presence only), `app-region: no-drag` doesn't reliably override parent drag for `mousedown`, `WKWebView.allowsBackForwardNavigationGestures` caused 3-finger trackpad swipe lag.
- **No `window-vibrancy` crate**: Removed from `Cargo.toml`. macOS NSVisualEffectView requires transparent body, but `body { @apply overflow-hidden bg-background }` is opaque — the blur would be invisible. Avoided complexity in favor of stable native titlebar.
- **Body rounded corners** ([`src/index.css`](./src/index.css)): `body[data-tauri] { border-radius: 12px; overflow: hidden }` + `body[data-tauri] #root { border-radius: 12px; overflow: hidden }` — gives the app a macOS-style rounded window.
- **No `isTauri` runtime check in `AppLayout`**: with native titlebar, no JS-side customization is needed; the spacer that previously added `app-region: drag` for the titlebar is gone.

### Refactoring & Modularity

- **Split on sight**: when a function/component takes on >1 responsibility, has a boolean parameter that changes behavior, or exceeds ~400 lines — split/refactor immediately. Do not postpone.
- **Max ~400 lines per file**: if exceeded, extract logic into a separate file/module with a clear name.
- **One responsibility per function/component**: avoid boolean `isX` parameters that alter internal flow. Use separate functions or strategy pattern.
- **Extract logic from components**: business/heavy computation logic must not live inside React components. Extract to `src/lib/` or `src/hooks/`.
- **Consistent naming**: extracted files must follow existing patterns. E.g. extract from `AIChatPanel.tsx` → `src/components/ai/ChatMessages.tsx`.
- **No god objects**: Context/Provider must not hold all state. Separate by domain.

- `onChange` handler in `NotesEditor` defined **inline** (no `useCallback`), causing TiptapEditor's `handleUpdate` effect to re-register every render. This is intentional but fragile.
- `handleNoteChange` stable via `useCallback` in `useNoteChangeHandler`
- `registerContentHandler(handler, strategies?)` — second param is supported `('replace' | 'append')[]`, defaults to `['replace', 'append']`
- `contentHandlerStrategies` exposed via `useAIAction()` — AIChatPanel checks this to show/hide Replace vs Append buttons
- Strategy type: `'replace' | 'append'`
- `selectionText` is single source of truth — passed as argument to `sendMessage()` (not closed over)
- `cleanIdentifier()` (local to `erdActions.ts`): strips backticks/quotes/brackets from SQL identifiers, e.g. `` `users` `` → `users`
- React.memo on NotesView
- **Auto-update AGENTS.md**: after completing any feature/improvement/fix, proactively update this file with relevant new patterns, components, and mechanisms — no need to wait for user to ask

### ERD Edge Handle Persistence

- `useERDSession.ts` now preserves user-picked ERD edge handles during node drags and rerenders.
- The old behavior that recomputed `sourceHandle`/`targetHandle` from node `x` positions was removed because it snapped edges back to the default side after reconnecting.
- Current rule: keep explicit handles if they exist, and only fill in missing handles when an edge has no handle IDs yet.
- Semantic direction still matters: if the source column is PK and the target column is not, the edge is flipped so the arrow continues to point toward the PK side.

### ERD Edge Deduplication

- One relation must map to one edge.
- `useERDSession.ts` now dedupes edges with a canonical relation key built from both endpoints: `source node + source column` and `target node + target column`, sorted before comparison.
- `onConnect` blocks inserting a new edge when the same relation already exists and shows a short info toast instead of creating a duplicate line.
- **Dual-check** (id + name): the duplicate check uses BOTH column ID (extracted from `sourceHandle`) AND column NAME (looked up from `sourceNode.data.columns`). The name fallback is critical — it makes the check robust against stale IDs and ensures columns with the same name across different tables don't cause false positives. Symmetric match (A→B same as B→A) is honored for both ID and name keys.
- The central edge reconciliation effect also dedupes, so duplicates introduced through reconnect/import/restore paths are removed automatically.
- **Bug fix (dedupeEdgesByRelation)**: the old implementation stored edges with null relation keys under a synthetic key (`__raw__:${edge.id}`). On deduplication, it returned `Array.from(seen.values())` which dropped ALL null-key edges (not just duplicates). Fixed: null-key edges are collected in a separate array and always kept; deduplication only removes duplicate valid-key edges. The dedupe logic also now guards against case where new edge has valid key but existing null-key edge should be detected as dupe — all edges with valid keys go through the same `seenKeys` Set check.
- **`onReconnect` validation**: the ReactFlow `onReconnect` handler in `ERDView.tsx` now applies the same duplicate check (ID key + name key, symmetric) and FK rule (1 FK = max 1 PK) as `onConnect`. Previously `onReconnect` only checked type mismatch and bypassed all duplicate/FK validation, allowing users to reconnect an edge to an already-occupied column slot. The helper functions (`extractColumnIdFromHandle`, `getRelationKey`, `dedupeEdgesByRelation`) are exposed from `useERDSession` and threaded through `WorkspaceProvider` → `DiagramEditorRoute` → `ERDView` for reuse.

### ERD Edge Strict FK Rule (1 FK = max 1 PK)

- **Polymorphic associations are NOT allowed**: one FK column can only point to one PK.
- **Multiple FKs in 1 table → different tables are allowed**: each FK column is a separate slot, so `addresses.user_id` → `users.id` and `addresses.employee_id` → `employees.id` both work.
- `onConnect` enforces two checks ([`src/hooks/useERDSession.ts`](./src/hooks/useERDSession.ts)):
  1. **Exact duplicate** (same source col + same target col): blocked with `'Relation already exists'` toast. Uses name-based key as a fallback to be robust against stale column IDs.
  2. **1 FK → 2 PKs** (same source col, different target table): blocked with `'FK already related'` error toast naming the conflicting table. Source identity uses `sourceNode.data.name + ':' + sourceColumnName` (lowercased) — much more reliable than column ID lookup.
- AI/SQL import path enforces the same rule in [`src/components/ai/actions/erdActions.ts`](./src/components/ai/actions/erdActions.ts) `applyToErdContent` second pass — tracks `usedSourceColumns` set and skips any FK where the source column is already wired.

### ERD Handle Hover Visibility

- `EntityNode.tsx` handle dots are hidden by default and only become visible on hover/focus.
- Do not keep FK handles semi-visible at rest; that leaves a faint dot behind after the cursor leaves the row.
- The handle should rely on `opacity-0` plus hover/focus classes, not a permanent opacity override.

### ERD Edge Side Reposition

- `useERDSession.ts` exposes `handleEdgeFlip(edgeId)` to move one selected ERD edge to the opposite side without affecting other edges.
- The flip toggles the stored `sourceHandle`/`targetHandle` suffixes only, so the logical relation remains the same while the rendered side changes.
- `RelationshipPropertiesPanel.tsx` now includes a `Move Edge Side` button for the selected edge.

### ERD Edge Handle Suffix Self-Heal

- **Critical bug fix**: when user drags from PK to FK, `resolveEdgeHandles` flips the edge (source ↔ target) to keep arrows pointing at the PK side. The OLD implementation just copied `edge.targetHandle` → new `sourceHandle` and vice versa, leaving mismatched suffixes (e.g. `col-X-target` on a source side, `col-Y-source` on a target side). React Flow silently fails to render such edges → data IS saved but UI shows nothing → retry triggers "Relation already exists" because the edge is in local state.
- **Fix** ([`src/hooks/useERDSession.ts`](./src/hooks/useERDSession.ts) `resolveEdgeHandles`):
  1. After the flip, recompute `sourceHandle`/`targetHandle` suffixes from the (new) source/target X positions (`-source`/`-source-l` for source, `-target`/`-target-r` for target).
  2. Self-heal existing broken edges: detect when `sourceHandle` ends with a TARGET suffix (`-target`/`-target-r`) OR `targetHandle` ends with a SOURCE suffix (`-source`/`-source-l`) — these are IMPOSSIBLE for their side and indicate a broken edge from older code. Rewrite the suffix via `replace(/-(source|target)(-(l|r))?$/, expectedSuffix)` while keeping the column ID intact.
  3. **Preserve user choice**: do NOT overwrite a valid side-alternative suffix. The source side allows `-source` (right) OR `-source-l` (left), and the target side allows `-target` (left) OR `-target-r` (right). When the user reconnects an edge endpoint to a different side via `onReconnect`, that selection is preserved across renders.

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

## Prisma 7 Migration (Adapter Pattern)

Upgraded `@prisma/client` + `prisma` CLI to **v7.8.0**. v7 has breaking changes — `datasource.url` is removed, driver adapters are mandatory.

### Key Changes

- **`prisma.config.ts`** (new, [`prisma.config.ts`](./prisma.config.ts)): single config with env-based schema switching via `DB_VARIANT` (`supabase` / `pg` / `sqlite`). Uses `defineConfig` + `env("DATABASE_URL")` from `prisma/config`. Replaces `--schema=...` CLI flag.
- **`datasource.url` removed** from all 3 schema files ([`prisma/schema.prisma`](./prisma/schema.prisma), [`prisma/schema.pg.prisma`](./prisma/schema.pg.prisma), [`prisma/schema.sqlite.prisma`](./prisma/schema.sqlite.prisma)) — only `provider` + `schemas`/table-mapping remain in datasource block.
- **Adapter pattern** mandatory in v7. New `server/lib/prisma.ts`:
  - PostgreSQL: `new PrismaPg({ connectionString })` from `@prisma/adapter-pg`
  - SQLite: `new PrismaBetterSqlite3({ url })` from `@prisma/adapter-better-sqlite3`
  - Adapter is selected at runtime by detecting `file:` prefix in `DATABASE_URL`
- **`previewFeatures = ["driverAdapters"]`** removed (no longer needed — driver adapters are the default in v7).
- **Package.json scripts** now use `DB_VARIANT=...` env var instead of `--schema=...` flag. Example: `cross-env DB_VARIANT=supabase prisma generate` replaces `prisma generate --schema=prisma/schema.prisma`.

### New client constructor pattern

```ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

const adapter = url.startsWith("file:") || url.endsWith(".db")
  ? new PrismaBetterSqlite3({ url })
  : new PrismaPg({ connectionString: urlWithPoolParams });

const prisma = new PrismaClient({ adapter, log: ["warn", "error"] });
```

- `datasources: { db: { url } }` and `datasourceUrl: ...` are **removed in v7** — adapter is the only way.
- `new PrismaClient()` (no args) **throws** in v7.

### BigInt/number type compatibility

`server/lib/startup-migration.ts` `backfillUids()` now uses `type PrismaRecord = { id: number | bigint | string }` and casts `id as never` for `where: { id }` clauses. v7's stricter type checking rejects the old `as number` cast because Supabase schema has `bigint` IDs while SQLite/PG-local have `number` IDs.

### Known v7 type quirks

- **`prisma.session` not found in Supabase client** ([`server/lib/desktop-auth.ts`](./server/lib/desktop-auth.ts)) — pre-existing lint error (also fails in v6). Desktop-only code uses `prisma.session` which exists in the SQLite-generated client but not the Supabase-generated client. Fix would require renaming the `Session` model. Left as-is to keep migration scope tight; only the dev runtime path matters.

### Prisma Client Cache Stale After Schema Switch

- **Symptom A (most common)**: switching from `npm run dev:api` (Supabase) to `npm run dev:pg:local` (local PG), the first Prisma query fails with:
  ```
  PrismaClientKnownRequestError: The table `auth.users` does not exist in the current database.
  Invalid `prisma.user.findFirst()` invocation
  ```
  Login page on web local mode returns HTTP 500. The 500 is the catch-all in [`server/routes/auth.ts`](./server/routes/auth.ts) wrapping a `P2021` Prisma error. The actual error lives in `logs/server.log` (pino destination).
- **Symptom B**: switching to desktop Tauri mode, server crashes on startup with `PrismaClientInitializationError: The Driver Adapter ... is not compatible with the provider ... specified in the Prisma schema.`
- **Cause**: Prisma 7's incremental generator keeps the old engine binary in `node_modules/.prisma/client/` when switching between schemas. The log says "Generated Prisma Client" but the actual `index.js` / `schema.prisma` still references the old schema (Supabase's `auth.users` table when the user expects local PG's `public.users`).
- **Fix** ([`package.json`](./package.json)): every dev script that regenerates the Prisma client now does `rm -rf node_modules/.prisma/client` first:
  - `dev:desktop`: `rm -rf node_modules/.prisma/client && npm run db:generate:sqlite && ...`
  - `dev:pg:local`: `rm -rf node_modules/.prisma/client && npm run db:generate:pg:local && ...`
  The `rm -rf` clears the stale engine binary before regeneration. Without it, the new generator sometimes produces a no-op because the old engine is still there.
- **Manual recovery if symptoms appear**: `rm -rf node_modules/.prisma/client && npm run db:generate:pg:local` (or whichever variant is needed) + restart the dev server. Also restart VS Code TS server if editor shows stale `prisma.session` errors.

### Deps added

- `@prisma/adapter-pg@7.8.0` (PostgreSQL driver adapter)
- `@prisma/adapter-better-sqlite3@7.8.0` (SQLite driver adapter)
- Peer deps `pg` and `better-sqlite3` auto-installed.

## Prisma Migration Security Guardrails

- **Project ownership must be verified before writing `project_id`**: use `resolveOwnedProjectId()` from [`server/lib/security.ts`](./server/lib/security.ts) so user-owned documents cannot be attached to another user's project.
- **Global AI tables are admin-only for writes**: `ai_providers`, `ai_models`, and default/system prompt toggles are restricted through `requireAdmin()` in [`server/lib/security.ts`](./server/lib/security.ts). Regular users may manage only their own `user_ai_configs` and custom prompts.
- **BigInt JSON serialization stays lossless**: Prisma `BIGINT` values are serialized as strings in [`server/index.ts`](./server/index.ts) to avoid rounding IDs beyond JavaScript safe integer range. Frontend code should treat IDs as opaque strings where possible.

## Desktop Login Bootstrap

- **Desktop Tauri auto-login (transparent, no credentials)**: on fresh install or after session expiry, `GET /api/me` in [`server/routes/auth.ts`](./server/routes/auth.ts) detects `useLocalAuth()` and auto-creates the local `admin@local.dev` user + session if none exists — zero manual login. The old two-step flow (`checkAuth` → fail → `POST /api/desktop-login`) is replaced by a single `/api/me` call that always succeeds in desktop mode.

- **Server retry in `useAuth.checkAuth`** ([`src/hooks/useAuth.tsx`](./src/hooks/useAuth.tsx)): in Tauri mode the Node.js server starts asynchronously from Rust's `Command::new("node")`. `checkAuth` retries **indefinitely** with exponential backoff (`1.5s → 2.25s → 3.4s → 5s → 7.5s → 10s` capped) until the server responds. Web mode keeps the old 3-retry limit.

- **Login.tsx polling fallback** ([`src/components/Login.tsx`](./src/components/Login.tsx)): the Tauri auto-login `useEffect` polls `/api/me` directly as a heartbeat. Once the server is up and `/api/me` returns `authenticated: true`, it calls `onLogin(data.user)` synchronously — the spinner transitions directly to the app without the user ever seeing the form.

- **`/api/desktop-login` endpoint removed** — the `/api/me` handler now contains the `ensureDesktopUser` helper that creates user + session inline. No separate POST or frontend call needed.

### Desktop Window Persistence

- `useTauriWindowPersistence()` hook in [`src/hooks/useTauriWindowPersistence.ts`](./src/hooks/useTauriWindowPersistence.ts) saves/restores window size (`width`, `height`) and position (`x`, `y`) to `localStorage` under key `tauri_window_state`.
- Wired in `AppLayout.tsx` — runs only when `window.__TAURI__` is detected.
- Uses dynamic `import('@tauri-apps/api/window')` to avoid breaking web builds.
- Restores on mount, saves on `onResized` and `onMoved` events.

### Desktop AI Seed Data (Startup)

- `seedAIProviders()` in [`server/run.ts`](./server/run.ts) runs on every server startup.
- Checks `aiProvider.count()` first — if providers already exist, skips seeding.
- Creates 3 providers (OpenAI, Google Gemini, OpenAI Compatible), their models, and the "Simple & Direct" default system prompt.
- Mirrors `prisma/seed.sqlite.ts` but runs inline in the server startup path (no CLI seed needed).
- Failures are non-fatal (logged as warning).

### Desktop Auto-Login (`/api/me`)

**`ensureDesktopUser()`** in [`server/routes/auth.ts`](./server/routes/auth.ts):199 — creates `admin@local.dev` user + session if none exist, returns token + user. Called by `/api/me` when no valid session exists in desktop mode.

**Flow**:
1. App loads → `checkAuth()` → `GET /api/me`
2. Server: no valid token → `ensureDesktopUser()` creates/finds `admin@local.dev` → creates session → returns `{ authenticated: true, token, user }`
3. Frontend: `useAuth.tsx` stores `data.token` via `setAuthToken()` → app transitions to dashboard
4. No login form ever shown in Tauri mode

**Login.tsx desktop mode**: [`src/components/Login.tsx`](./src/components/Login.tsx) — if Tauri, renders a minimal spinner + pings `/api/me` until auto-login succeeds (pure fallback; should never mount in normal flow because `checkAuth()` resolves before `isAuthenticated` transitions from `null`).
- Old polling logic (pre-fill desktop credentials, server-ready detection) removed.
- `onLogin` prop signature: `(userData?: any) => void` — `/api/me` response passed directly.
- Web mode (non-Tauri) preserves the full login form unchanged.

**Server**: cookie is set with `sameSite: "lax"`, `httpOnly: !isDesktopMode()` (not httpOnly on desktop so Tauri WebView cross-origin cookie works). Token also returned in body for `Authorization: Bearer` header flow.

### Stale Table List After Delete (Pagination Refresh)
After a Move-to-Trash, the table list shows stale data (missing/empty slots) because `delete*` functions only mutate local state — they don't re-fetch the current page from the server. The previous fix (`onAfterDelete` → `handleViewChange`) only navigates to `/table/<view>`, which is a no-op when already on page 1.

**Fix**: `tableRefreshKey` — a counter in `WorkspaceContext` that increments after delete, triggering `useTableViewPagination` effects to re-fetch:
1. `onAfterDelete` in `AppLayout.tsx` calls `triggerTableRefresh()` after `handleViewChange`
2. `triggerTableRefresh` increments `tableRefreshKey` in `WorkspaceProvider`
3. `useTableViewPagination` has `tableRefreshKey` in all 4 `useEffect` dependency arrays — whenever it changes, the current page is re-fetched from the server
4. This ensures the correct data fills the gap left by the deletion

**Loading spinner optimization**: Default fetch remains `{ silent: true }` (no loading spinner for passive changes: search debounce, auth change, project list change, etc.). User-initiated actions (delete, page change, workspace filter) set `tableLoadingState='loading'` in context, causing `useTableViewPagination` to call fetch without `silent` — table shows spinner, after fetch completes `tableLoadingState` is reset to `'idle'`.
- `delete`: via `onAfterDelete` in `AppLayout.tsx` → `setTableLoadingState('loading')` + `triggerTableRefresh()`
- `page change`: via `handlePageChange` in `TableRoute.tsx` → `setTableLoadingState('loading')` + `setTableSearchParams()`
- `workspace filter`: via `handleWorkspaceClick` in `TableRoute.tsx` → `setTableLoadingState('loading')` + `setTableSearchParams()`

**Files involved**:
- [`src/providers/WorkspaceContext.tsx`](./src/providers/WorkspaceContext.tsx): added `triggerTableRefresh: () => void`, `tableLoadingState`, `setTableLoadingState` to interface; added `isDiagramsLoading`, `isNotesLoading`, `isDrawingsLoading`, `isFlowchartsLoading` to interface
- [`src/providers/WorkspaceProvider.tsx`](./src/providers/WorkspaceProvider.tsx): added `tableRefreshKey` state + `triggerTableRefresh` callback; added `tableLoadingState` state + `setTableLoadingState`; passed to context value and `useTableViewPagination`; exposed per-feature loading states in context value
- [`src/hooks/useTableViewPagination.ts`](./src/hooks/useTableViewPagination.ts): uses `tableLoadingState` to decide silent vs non-silent fetch; resets to `'idle'` after fetch completes
- [`src/routes/AppLayout.tsx`](./src/routes/AppLayout.tsx): added `setTableLoadingState('loading')` call in `onAfterDelete`
- [`src/routes/TableRoute.tsx`](./src/routes/TableRoute.tsx): added `setTableLoadingState('loading')` on page/workspace change; passes loading state as `isLoading` prop

## AI Prompt Integration & Technical Formatting Rules

- **Client-Side Verification Guard**: In `useAIChat.ts`, a persistent `TECHNICAL CAPABILITIES & INTEGRATION RULES` system instruction is dynamically appended to `apiMessages` on send. This guarantees that regardless of the user's active system prompt in the database, the AI is always instructed on the correct syntax required by the frontend parsers.
- **Guest Mode Fallback**: In Guest mode (where database access is unavailable), the AI Chat assistant falls back to a locally-defined default system prompt (`Simple & Direct` content) to prevent empty instructions.
- **Database Schema (ERD)**: When asked to create database models, ERD, or SQL, the AI is instructed to output clean, standard SQL DDL statements (like `CREATE TABLE`, `ALTER TABLE` for foreign keys) enclosed in a ````sql` block. Plain text or HTML tables are explicitly prohibited.
- **Flowchart Canvas**: When asked to generate a flowchart, the AI is instructed to output a JSON code block with `nodes` and `edges` fields matching the flowchart layout engine parameters, ensuring compatibility with the visual canvas.
- **Notes Rich Text**: AI is instructed to preserve and output rich markdown text.
- **Workspace Integration & mentions**: Prompts outline the linked nature of ERD schemas, flowcharts, and notes. If a user references sibling files (via `@FileName`), the AI receives their content in context and cross-references them to generate consistent designs and business logic.
- **Seed Prompts updated**: The default SQL seed (`seed_ai_system_prompts.sql`) has been rewritten to contain these English-based feature integration instructions.

## Session List Search & Pagination

- **Session list** in `AIChatPanel.tsx` has search input (filters by title, case-insensitive) and pagination (20 per page).
- Pagination controls: `<` `page/total` `>` chevron buttons at bottom of list.
- Search and pagination reset to page 1 when search query changes.
- **One New Chat button**: 
  - If `sessions.length === 0`: centered default (white) button in `ChatMessages` empty state — prominent CTA for first session.
  - If `sessions.length > 0`: outline (dashed) button at top of session list — streamlined quick-add. The centered button in `ChatMessages` is replaced with "Select a conversation to continue" text.
  - Logic: `hasSessions` boolean controls which button renders. `hasSessions` passed as prop from `AIChatPanel` → `ChatMessages`.

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
- AI Chat functional in Guest Mode — sessions are in-memory, no Supabase persistence
- **Guest AI proxy flow** ([`server/routes/ai.ts`](./server/routes/ai.ts):33): when `apiKey` is missing from the proxy request, the server uses its service-role Supabase client to look up the first enabled `user_ai_config`. This allows Guest mode users to chat with AI without exposing the API key or querying Supabase from the client. The server resolves `api_key`, `base_url` (from `ai_providers`), and `model_identifier` (from `ai_models`).
- **`useAIChat.ts` Guest guards** ([`src/hooks/useAIChat.ts`](./src/hooks/useAIChat.ts)): all Supabase-dependent functions check both `isGuestRef.current` AND `sessionStorage.getItem('auth_mode') === 'guest'` — the `sessionStorage` check is synchronous and catches Guest mode before React state updates propagate (fixes race condition where `useAuth` initializes `isGuest=false` before `checkAuth` resolves).
- **`isGuestCheck()` pattern for all data hooks**: [`useDiagrams.ts`](./src/hooks/useDiagrams.ts), [`useERDSession.ts`](./src/hooks/useERDSession.ts), [`useAIChat.ts`](./src/hooks/useAIChat.ts), [`useNotes.ts`](./src/hooks/useNotes.ts), [`useDrawings.ts`](./src/hooks/useDrawings.ts), [`useProjects.ts`](./src/hooks/useProjects.ts), [`useTrash.ts`](./src/hooks/useTrash.ts), and [`useSyncService.ts`](./src/hooks/useSyncService.ts) all use `isGuestRef` + `useEffect` sync + `isGuestCheck()` helper instead of raw `isGuest` closure. Raw `if (isGuest)` closures are stale during initial render (before `checkAuth` propagates). `isGuestCheck()` reads from ref (always current) AND falls back to `sessionStorage.getItem('auth_mode') === 'guest'` (synchronous truth). The `isGuest` param is also removed from `useCallback` dep arrays since the ref breaks the dependency chain.
- Hooks fixed for guest loading (all follow same pattern — `setIsLoading(false)` before guest return):
  - `useNotes.ts:76`
  - `useDiagrams.ts:76`
  - `useDrawings.ts:76`
  - `useFlowcharts.ts:74`
  - `useProjects.ts:65`
  - `useTrash.ts:44`
  - `useAISettings.ts:28-29`
- **`saveDiagram` Guest resource upsert** ([`src/hooks/useDiagrams.ts`](./src/hooks/useDiagrams.ts):362-382): when `localPersistence.getResource` + uid fallback both fail in Guest mode, `saveDiagram` now creates a new resource entry from scratch instead of silently skipping. Prevents data loss when `activeDiagramId` is a UUID that doesn't match the IndexedDB keyPath (which uses `id`, not `uid`).
- Composite `isLoading` in `WorkspaceProvider.tsx:841` = `isDiagramsLoading || isNotesLoading || isDrawingsLoading || isFlowchartsLoading || isProjectsLoading`

### Guest Data Export/Import

Allows Guest Mode users to export their IndexedDB data as `.json` and authenticated users to import it into their database.

**Export (Guest Mode UI)**:
- File: [`src/lib/guestExport.ts`](./src/lib/guestExport.ts) — `exportGuestData()` reads ALL resources from IndexedDB via `localPersistence.getAllResources()` for types: `notes`, `diagram`, `flowchart`, `drawing`, `project`, `ai_chat_session`.
- AI chat messages are collected from the session's embedded `messages` array.
- Output: downloadable JSON file `erd-guest-backup-<date>.json` with schema:
  ```json
  { "version": "1.0", "exported_at": "...", "application": "ERD Builder Pro",
    "data": { projects, notes, diagrams, flowcharts, drawings, ai_chat_sessions }
  }
  ```
- UI: [`AccountTab.tsx`](./src/components/ai/AccountTab.tsx) — Guest Mode view shows an "Export My Data" card with `Download` icon + button. The export reads all IndexedDB data and triggers a browser download.

**Import (Server)**:
- Endpoint: `POST /api/guest/import` at [`server/routes/guest-import.ts`](./server/routes/guest-import.ts) — `authenticate` middleware, additive-only import.
- **NDJSON streaming response**: server writes progress lines (`\n`-delimited JSON) as it processes batches. Response `Content-Type: application/x-ndjson` with `X-Accel-Buffering: no` (disable nginx buffering).
- **Progress protocol**: each line is a JSON object:
  - `{"type":"progress","current":50,"total":200,"phase":"Importing columns…"}`
  - `{"type":"complete","success":true,"summary":{...}}`
  - `{"type":"error","error":"...","partial_summary":{...}}`
- **Batched Prisma operations**: instead of sequential `await prisma.*.create()` per row (10K+ round-trips for large exports), each phase uses `prisma.$transaction([...])` in `BATCH_SIZE=50` chunks. This yields ~100x speedup for large ERDs.
- **Work unit counting**: `countWorkUnits()` precomputes total items (projects + notes + diagrams + sum of entities/columns/relationships + flowcharts + drawings + AI sessions + messages) for accurate determinate progress.
- **Flow**:
  1. **Projects**: matched by name (case-insensitive per user) — existing names skipped, new ones created. Returns `nameToDbId` and `guestIdToName` maps.
  2. **Notes**: batch-checked by `uid`, batch-created via `$transaction`.
  3. **Diagrams (ERD)**: per diagram:
     - Create diagram record → batch-create entities (50/batch) → batch-create columns (50/batch) → batch-create relationships (50/batch)
     - Entity/column/relationship IDs remapped with fresh `crypto.randomUUID()`
     - Handle strings rewritten from old→new column IDs
  4. **Flowcharts/Drawings**: batch-checked by `uid`, batch-created.
  5. **AI Chat**: per session — create session → batch-create messages (50/batch).
- All new records get fresh UUIDs (no conflict with existing DB IDs). `skipped_existing` counter tracks dedup.
- **Body limit**: `express.json({ limit: "50mb" })` (increased from 5MB for large ERD exports). `content-length` header checked before JSON parse — returns 413 if exceeds 50MB cap.
- Progress sent after each batch so client stays responsive.

**Import UI (Authenticated Users)**:
- File: [`src/components/ai/GuestDataManagement.tsx`](./src/components/ai/GuestDataManagement.tsx) — file upload with **two-step flow**: preview → submit → import.
- **Step 1 — Preview**: after selecting a `.json` file, `extractPreviewSummary()` counts all items per type client-side (projects, notes, ERD tables/columns/relationships, flowcharts, drawings, AI sessions/messages). A `'preview'` state renders the same `SummaryGrid` cards as the post-import view, showing exactly what will be imported.
- **Step 2 — Submit**: a **Submit** button triggers the actual import. `payloadRef` holds the parsed JSON across state transitions (no re-parsing).
- **Progress bar**: reads NDJSON stream via `res.body.getReader()` (Streams API). Parses each line as JSON, updates `progress` state (`current`, `total`, `phase`). Renders a determinate progress bar with percentage, phase label (e.g., "Importing ERD columns (240 done)…"), and item counter.
- **Work unit preview**: `countWorkUnits()` mirrors server-side counting — runs locally on the parsed JSON so the progress bar shows the correct total immediately (not 0/0).
- **Cancel**: available at both preview stage (returns to idle) and during import (`AbortController`).
- **Large file warning**: toast warns if file exceeds 30MB (still processed, just a heads-up).
- **Dialog**: [`SettingsModal.tsx`](./src/components/modals/SettingsModal.tsx) — "Guest Data Import" tab in the "More" nav group (hidden for guests). Shows import area + result summary.
- Validation: checks `.json` extension, parses structure, confirms `data` field exists.
- On success: grid of summary cards showing imported counts per type. After 2.5s, the app **auto-reloads** (`window.location.reload()`) so all data hooks re-fetch fresh data from the database — seamless like a browser tab refresh. A "Reload App Now" button is also available for immediate reload. The timer is cleared if the user clicks "Import Another File".

**Key design**: ADDITIVE only — never overwrites existing data. Items are deduplicated by `uid` (falls back to name-based matching for projects). Project hierarchy is preserved via name-matching. ERD entities/columns/relationships are reconstructed from the guest diagram's flat arrays with batched transactions for performance.

**Bug Fixes (2026-06-10)**:
- **`resolveProjectId` always returned `null`**: The function ignored `rawProjectId` entirely. For diagrams, flowcharts, drawings, and AI sessions, `projectsRel` was passed as `null` → all imported items lost their project association and became uncategorized. **Fix** ([`server/routes/guest-import.ts`](./server/routes/guest-import.ts)):
  1. `importProjects` now also returns `guestIdToName: Map<string, string>` — maps guest project uid/id → project name (lowercase)
  2. `resolveProjectId` now accepts `guestIdToName` and resolves `rawProjectId` by: guest project ID → project name → real DB project ID (from `nameToDbId`)
  3. All import functions (`importNotes`, `importDiagrams`, `importFlowcharts`, `importDrawings`, `importAiChatSessions`) pass `guestIdToName` through
- **Entity/Column/Relationship ID collisions**: The import reused guest's IDs directly for Prisma `@id` fields. If any entity/column/relationship ID already existed in the target DB → duplicate key error → import crash. **Fix**: All entities, columns, and relationships now get fresh `uuid()` IDs. Entity ID remapping (`entityIdMap`) and column ID remapping (`columnIdMap`) maintain referential integrity for relationships. Relationship handles are also rewritten to use new column IDs.
- **Error message leak**: `catch` block returned `details: err.message` — removed, replaced with generic error message.

**Performance Fixes (2026-07)**:
- **Sequential DB queries → batched `$transaction`**: The old code used `await prisma.*.create()` for every single entity, column, and relationship row. For a 50-table ERD with 20 columns each = 1,050 individual DB round-trips, taking minutes. **Fix**: all creates are grouped into `BATCH_SIZE=50` chunks wrapped in `prisma.$transaction([...])` — ~100x faster.
- **No progress → NDJSON streaming**: The old endpoint returned a single JSON response at the end — client showed only a spinner with no feedback. **Fix**: server writes progress lines as NDJSON as each batch completes. Client reads the stream via `ReadableStream` reader and renders a determinate progress bar with phase label and item counter.
- **5MB body limit → 50MB**: Large guest exports (50+ diagrams with hundreds of entities) could exceed the 5MB `express.json` limit, failing before reaching the route handler. **Fix**: increased to 50MB. Also added `content-length` pre-check with 413 response for payloads exceeding the cap.

**Bug Fixes (2026-06-10b)**:
- **Guest export empty diagrams & drawings**: `guestExport.ts` queried IndexedDB with `type: 'diagram'` and `type: 'drawing'`, but the hooks save resources with `type: 'erd'` and `type: 'drawings'` respectively — type mismatch caused empty arrays in the export JSON. **Fix** ([`src/lib/guestExport.ts`](./src/lib/guestExport.ts)): changed `collectResources` calls and `GUEST_TYPES` constant to use `'erd'` and `'drawings'` — matching the actual IndexedDB `type` values used by `useDiagrams.ts` (`type: 'erd'`) and `useDrawings.ts` (`type: 'drawings'`).

## AI Settings API Migration (Server-Only Supabase)

- **Problem**: `useAISettings.ts` called Supabase directly from the frontend (`supabase.from('ai_providers').select(...)`) requiring `VITE_SUPABASE_URL` env var. In Vercel preview where only `SUPABASE_URL` (server) was set, AI settings failed with `TypeError: Load failed`.
- **Fix**: Moved all AI Settings CRUD (providers, configs, models, prompts, initialize) to server API at `/api/ai/settings/*`.
- **Server file**: [`server/routes/ai-settings.ts`](./server/routes/ai-settings.ts) — Express router with `authenticate` middleware, mounted at `app.use("/api/ai/settings", aiSettingsRouter)` in [`server/index.ts`](./server/index.ts).
- **Client file**: [`src/hooks/useAISettings.ts`](./src/hooks/useAISettings.ts) — rewritten to use `apiFetch` for all calls instead of direct `supabase` client. No `VITE_SUPABASE_URL` dependency.
- **Route list**: `GET/POST /configs`, `GET/POST /models`, `PUT/DELETE /models/:id`, `GET /configs`, `GET /prompts/default`, `DELETE /prompts/:id`, `PUT /prompts/:id/toggle-default`, `POST /initialize`, `PUT /providers/:id`, `GET /providers`.
- **No conflict**: Express router for `/api/ai` (proxy, `/api/ai/proxy`) and `/api/ai/settings` (settings) are separate mount points — no path overlap.
- **Targeted fetch optimization**: `fetchModelsData()` and `fetchPromptsData()` replace `fetchData()` calls in model/prompt handlers — avoids re-fetching providers/configs on every CRUD operation.

## AI Chat API Migration (Server-Only Supabase)

- **Problem**: `useAIChat.ts` and its sub-modules (`resolveAiConfig.ts`, `syncSessionProjectId.ts`, `buildSystemMessages.ts`) called Supabase directly from the frontend for AI chat CRUD (sessions, messages, config, prompts). This required `VITE_SUPABASE_URL` env var which was unavailable in Vercel preview.
- **Fix**: Moved all AI Chat persistence to server API at `/api/ai/chat/*`.
- **Server file**: [`server/routes/ai-chat.ts`](./server/routes/ai-chat.ts) — Express router with `authenticate` middleware, mounted at `app.use("/api/ai/chat", aiChatRouter)`.
- **Endpoints**: `GET/POST /sessions`, `GET/DELETE /sessions/:uid`, `PUT /sessions/:id`, `GET /sessions/:id/messages`, `POST /messages`, `GET /config`, `GET /prompts/default`.
- **Client files**: All 4 migrated files now use `apiFetch` instead of `supabase`:
  - [`src/hooks/useAIChat.ts`](./src/hooks/useAIChat.ts) — sessions + messages CRUD
  - [`src/hooks/aiChat/resolveAiConfig.ts`](./src/hooks/aiChat/resolveAiConfig.ts) — AI config resolution
  - [`src/hooks/aiChat/syncSessionProjectId.ts`](./src/hooks/aiChat/syncSessionProjectId.ts) — project ID sync
  - [`src/hooks/aiChat/buildSystemMessages.ts`](./src/hooks/aiChat/buildSystemMessages.ts) — default prompt fetch
- **Most database calls migrated** — AI Chat CRUD, AI Settings, and core app operations go through `apiFetch` → Express server → server supabase client (`SUPABASE_URL` env).
- **Frontend Supabase fully migrated to `apiFetch`** — `src/lib/supabase.ts` deleted. All frontend Supabase calls (entity context, AIChatPanel mentions, realtime sync) now go through `apiFetch` → Express server → Prisma → database. No `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` required in the frontend.
  - [`src/hooks/aiEntityContext/siblings.ts`](./src/hooks/aiEntityContext/siblings.ts), `diagram.ts`, `note.ts`, `flowchart.ts`, `drawing.ts` — use `apiFetch('/api/projects/:id/siblings')` or `apiFetch('/api/diagrams/:uid')` etc.
  - [`src/components/ai/AIChatPanel.tsx`](./src/components/ai/AIChatPanel.tsx) — mention resolution uses `apiFetch('/api/notes/:uid')` and `apiFetch('/api/diagrams/:uid')`
  - [`src/hooks/useRealtimeSync.ts`](./src/hooks/useRealtimeSync.ts) — stubbed to no-op (Supabase Broadcast removed; auto-save handles persistence)
  - **Key insight**: desktop (Tauri) build will have zero Supabase frontend dependency
- **Guest mode safety**: AI Chat uses `isGuestCheck()` guards at the top of every function — all online API calls are skipped in guest mode, using IndexedDB (`localPersistence`) instead. AI Settings is never accessible in guest mode (Settings menu hidden in `NavUser`), plus `fetchData`/`fetchModelsData`/`fetchPromptsData` all have `if (isGuest) return` guards.

## Server Auth (Supabase Auth — No Custom JWT)

- **Auth middleware** (`server/lib/middleware.ts:6`): uses `supabase.auth.getUser(token)` — verifies JWT directly against Supabase Auth endpoint. No custom JWT verification needed.
- **`JWT_SECRET` removed** — was previously exported from `server/lib/config.ts` but never used by auth middleware. Supabase manages its own JWT signing keys.
- **Login flow**: `POST /api/login` → `supabase.auth.signInWithPassword({ email, password })` → returns session JWT → set as `Set-Cookie: token=...` → subsequent requests carry cookie → middleware calls `supabase.auth.getUser(token)` to identify user.
- **Reason Supabase Auth works**: The `SUPABASE_SERVICE_ROLE_KEY` server-side Supabase client can call `supabase.auth.getUser(token)` to verify any valid Supabase JWT. No local secret needed.
- **Edge auth helper**: [`server/lib/edge-auth.ts`](./server/lib/edge-auth.ts) now mirrors the same Supabase-token verification path and no longer relies on a custom signed JWT secret.

## Login Fix Pattern (Second Round-Trip Bug)

- **Bug**: After successful `POST /api/login`, `App.tsx` called `checkAuth()` (async `GET /api/me`) instead of `handleLogin()` (synchronous). This caused the login page to stay visible because:
  1. `POST /api/login` sets `Set-Cookie: token=...` and returns user data
  2. `onLogin()` calls `checkAuth()` — a **second HTTP round-trip** to verify the session
  3. During the async call, `isAuthenticated` stays `false` → login page still renders
  4. If `GET /api/me` fails (e.g., cookie `Secure` flag blocks HTTP localhost), user is stuck
- **Fix** ([`src/App.tsx`](./src/App.tsx)): Destructure `handleLogin` from `useAuth` (was unused), wire `onLogin={(userData) => handleLogin(userData)}` — synchronous state update, no second API call.
- **Login.tsx** ([`src/components/Login.tsx`](./src/components/Login.tsx)): `onLogin` prop changed from `() => void` to `(userData?: any) => void`; reads user data from `POST /api/login` response body and passes it through.
- **Cookie Secure flag** ([`server/routes/auth.ts`](./server/routes/auth.ts)): Changed from `secure: isProd` to `secure: isProd && req.protocol === 'https'` — prevents cookie rejection on HTTP localhost in production mode (`npm run start`).
- **Key pattern**: Never rely on a second API round-trip (`checkAuth()`) to confirm login success. The first call already succeeded; use synchronous state transition.

## ERD Architecture

### Data Structures
- **Entity**: `{ id, name, x, y, color, columns: Column[] }` — node data stored in React Flow `Node<Entity>`
- **Column**: `{ id, name, type, is_pk, is_nullable, enum_values?, sort_order?, _is_fk? }`
- **Relationship**: `{ id, source_entity_id, target_entity_id, source_column_id?, target_column_id?, source_handle?, target_handle?, type, label? }` — stored as React Flow `Edge` with `type: 'smoothstep'`

### Key Hooks
- **`useERDSession`** ([`src/hooks/useERDSession.ts`](./src/hooks/useERDSession.ts)): State management using `useNodesState<Node<Entity>>` and `useEdgesState<Edge>` from XYFlow. Exposes: `addEntity()`, `updateEntity(entity)`, `deleteEntity(id)`, `handleEdgeUpdate()`, `deleteEdge()`, `onConnect`, `undo/redo`, `takeSnapshot`
- **`useDiagrams`** ([`src/hooks/useDiagrams.ts`](./src/hooks/useDiagrams.ts)): Diagram metadata CRUD (list, create, rename, delete), persist entities/columns as JSON to DB

### ERD Keyboard Shortcuts

- **Table deletion**: ReactFlow built-in Backspace/Delete shortcuts are **disabled** via `deleteKeyCode={null}` prop in `ERDView.tsx`
- **Reason**: Prevents accidental table deletion when typing in dropdowns (e.g., SearchableTypeSelect column type search) or modal inputs
- **Delete table**: Users MUST use explicit dropdown menu action "Delete Table" in EntityNode — requires confirmation dialog
- **Undo/Redo**: Ctrl/Cmd+Z (undo), Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y (redo) — registered in `useERDSession.ts`

### ERD Edge Reconnection

- **`defaultEdgeOptions.reconnectable: true`** in `ERDView.tsx:361` enables edge endpoint dragging
- **`onReconnect` handler** (`ERDView.tsx:513`): validates type match, calls `takeSnapshot` for undo, then uses a single **atomic `reconnectEdge(oldEdge, connection, eds)`** from `@xyflow/system`. This preserves all old edge properties (reconnectable, markerEnd, type, animated) while updating source/target/handles. Uses `shouldReplaceId: true` (default) to generate a fresh edge ID from the connection.
- **Bug fixed**: previously `onReconnect` called `setEdges(filter)` then `onConnect(connection)`. The `onConnect` closure had stale `edges` (still including old edge), so `addEdge` returned edges with old edge re-included. The second `setEdges` from `onConnect` overwrote the filter — causing the edge to snap back to original position.
- **4 handles per column**: each column has `col-{id}-target` (left), `col-{id}-source-l` (left), `col-{id}-source` (right), `col-{id}-target-r` (right). When reconnecting to the opposite side, the new handle ID is automatically used.
- **Handle visibility for FK columns** (`EntityNode.tsx`): FK columns (`_is_fk = true`) have handles always semi-visible (`!opacity-60`) instead of `opacity-0` — users can see where connections exist without hovering. Size increased to `!w-2 !h-2` (8px) from 6px. Non-FK columns remain hidden until hover.
- **Files**: [`src/components/views/ERDView.tsx`](./src/components/views/ERDView.tsx):513-529, [`src/components/EntityNode.tsx`](./src/components/EntityNode.tsx):55-84

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
7. AI prompt instructs AI to append a user-facing message after the JSON code block, e.g. "Click the **Append** button to apply changes to the admins table."

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

#### Preview Modal ([`src/components/flowchart/FlowchartPreviewModal.tsx`](./src/components/flowchart/FlowchartPreviewModal.tsx))
- GitHub-style diff view (same design as `FlowchartFromJsonDialog`) showing proposed changes before applying
- Accepts optional `existingNodes`/`existingEdges` props — when provided, computes a diff comparing AI-generated symbols against current canvas
- Diff compares nodes by label: new nodes show `+` (green), modified show `~` (amber), removed show `-` (red)
- Edge diff compares by `sourceLabel→targetLabel` pairs
- New symbols always shown as cards (label, shape, color) above the diff section
- `confirmLabel` optional prop (default `"Confirm Append"`) — FlowchartView passes `"Confirm Insert"` for Insert Between mode
- `canvasGroups` prop shows Replace Group selector (same as before)

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
Multiple fixes prevent cascading re-renders on every drag frame:

1. **Position changes are NOT blocked during drag** (matched ERDView pattern): `handleNodesChange` (line 718) only filters `type: 'select'` changes. Previously position changes were buffered in `pendingNodeChangesRef` during drag, which caused React Flow to detect a mismatch between its internal state and the external `nodes` prop, triggering extra reconciliation on every frame. Now position changes flow through normally to `useNodesState` — only the dragged node gets a new object reference from `useNodesState`, while `memoizedNodes` identity preservation (`!!n.selected === selected ? n : { ...n, selected }`) keeps all other nodes stable.
2. **`setActionContextData` debounced at 500ms during drag** (line 738): the `useEffect` that syncs nodes/edges to AIActionContext returns early when `isDraggingRef.current` is true, and is additionally debounced at 500ms. This prevents high-frequency updates: during active dragging, the cleanup timer cancels the state update, completely preventing spammed updates to the `AIActionProvider` and the subscribing `AIChatPanel` (which otherwise suffers from heavy syntax highlighting and markdown parsing re-renders on every frame).
3. **`useEdgesState` edges reference is stable during drag** — edges don't change when nodes move, so `memoizedEdges` doesn't recompute mid-drag. The only drag-triggered re-render comes from `nodes` changes, which only recreate the dragged node's object.
4. **`memoizedEdges` preserves references** (line 949): non-active edges (not hovered/selected) return the original edge reference — only edges that are actively hovered or selected get new objects with white stroke/width overrides. React Flow skips reconciliation for unchanged edges.
5. **`selectedGroupNodeIds` stable empty set**: uses `emptySetRef` (`useRef(new Set<string>())`) instead of `new Set<string>()` when `!selectedGroup` — prevents creating a new Set reference on every render, which used to force `memoizedNodes` useMemo to recompute on every non-drag re-render (AIActionContext sync, saveFlowchart state update), cascading into unnecessary React Flow reconciliation of all nodes.
- `isEditingEdgeRef` skips auto-save while ConnectorPropertiesModal is open — prevents auto-save cascade on every keystroke when editing edge labels. On modal close, a flush save fires automatically to persist pending changes.
- `isEditingNodeRef` skips auto-save while SymbolPropertiesModal is open — same pattern as edge editing to prevent dialog close on keystroke
- Init effect (`useEffect` dep `[activeFlowchartId, activeFlowchart.data]`) **only clears `selectedNodeId`/`selectedEdgeId` when flowchart ID changes`, not on every data sync — prevents auto-save cycle from closing modal dialogs.
- Init effect **skips loading default `initialNodes`/`initialEdges` when `pending_create_flowchart_json` or `pending_update_flowchart_json` exists in localStorage** — prevents brief flash of dummy flowchart before AI content replaces it (`FlowchartView.tsx:321`).
- **`pendingContentAppliedRef` — Guest mode Create Flowchart content not appearing fix** ([`FlowchartView.tsx`](./src/components/views/FlowchartView.tsx)): ref set to `true` by pending effect after applying AI content. Init effect guards `setNodes`/`setEdges` with `if (!pendingContentAppliedRef.current)` to prevent overwriting canvas when `activeFlowchart.data` transitions from `undefined` → `''` (after `selectFlowchart` resolves in Guest mode). Ref reset to `false` in init effect's `flowchartChanged` block when navigating to a different flowchart.
- **`saveFlowchart` Guest mode React state sync** ([`useFlowcharts.ts`](./src/hooks/useFlowcharts.ts):277-283): after saving to IndexedDB, calls `setFlowcharts` to update `activeFlowchart.data` immediately — without this, the workspace context never reflects the saved data until auto-save fires or page reloads.
- `handleEdgesChange` + `handleNodesChange` both filter out `type: 'select'` — selection changes never trigger auto-save or content-modified flag
- `useFlowchartChangeHandler` debounces save at 1.5s, updates `activeFlowchart.data` in workspace state

#### Content Handler Routing
- FlowchartView registers content handler with `['append', 'replace']` strategies
- Action ID routing: `flowchart-import` → `applyReplaceAll`, `flowchart-insert` → `applyInsertBetween`, generic → `previewFlowchartContent` + modal
- `pendingPreview` in FlowchartView stores parsed preview result; modal shows GitHub-style diff comparing AI content against current canvas (no ReactFlow); main canvas state unaffected
- `existingNodes`/`existingEdges` props on `FlowchartPreviewModal` enable diff computation — passed from `nodes`/`edges` state in FlowchartView
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
- **Auto layout spacing tuning**: `src/lib/autoLayoutERD.ts` now uses a much smaller width estimate per column (`BASE_TABLE_WIDTH = 220`, `COL_TO_WIDTH_ESTIMATE = 6`) and clamps horizontal spacing with `MIN_HORIZONTAL_SPACING = 280` plus a smaller padding. Vertical layer spacing is also reduced (`+72`) so ERD tables sit closer together overall while still avoiding overlap for wider tables.
- **Flowchart auto layout**: `src/lib/autoLayoutFlowchart.ts` — BFS from Start nodes, diamond decision branch offset (`BRANCH_OFFSET = 280`), convergence centering for multi-source nodes. Used by `FlowchartView` toolbar "Auto Layout" button.

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
- **Symbol-aware manual Auto Layout**: [`src/lib/autoLayoutFlowchart.ts`](./src/lib/autoLayoutFlowchart.ts) now returns `{ nodes, edges }` instead of nodes only. It assigns diamond decision branches with semantic `Yes`/`No` side placement, spreads other branches by shape-aware column offsets, and recalculates `sourceHandle`/`targetHandle` so branch arrows do not flip sides after layout.

### Flowchart AI Content Safety Guards

- **`MAX_AI_NODES = 60`**, **`MAX_AI_EDGES = 120`**, **`MAX_AI_TEXT_BYTES = 512_000`** in `flowchartActions.ts` — hard limits that prevent parsing/rendering huge AI responses
- `parseJSON()` returns `null` if `text.length > MAX_AI_TEXT_BYTES`
- `parseNodesAndEdges()` returns `null` if `parsed.nodes.length > MAX_AI_NODES` or `parsed.edges.length > MAX_AI_EDGES`
- Content handler in `FlowchartView` wraps the entire callback in `try/catch` with `toast.error` fallback — prevents unhandled errors from crashing the page
- If parsing fails (nodes empty, exceeded limits, or malformed JSON), a toast warns the user the data couldn't be parsed

### Flowchart Canvas (`FlowchartNode.tsx`)

- `isHovered` local state is scoped per-node — only the hovered node re-renders, not the entire canvas
- `shapeBackground` memoized on `[data.color, data.shape, selected]` — SVG paths recompute only on actual property changes
- **Handle visibility**: `handleClasses` = `opacity-0 group-hover:opacity-100` — handles only appear when cursor hovers over the node. Parent div has `group` class.

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

- All symbols (including Start/End) can be freely deleted — `deleteNode` no longer has Start/End guards
- **Start nodes** have a "Group Title" input field in properties modal — stored as `section` in `FlowchartNodeData`
- **Start label detection**: `isStartNode`/`isStartLabel` uses `.includes('start')` (case-insensitive) — not exact match. Labels like "Start Login", "Start Process", "restart" trigger Group Title form.
- **Group title uniqueness**: validated on write via `updateNodeData` with toast error on duplicate.
- **Delete Group**: `deleteGroup` in FlowchartView — deletes all nodes that have the same `section` (group). The "Delete Group" button appears in `SymbolPropertiesModal` for Start nodes that have a Group Title.
- **`groupId`**: each Start node has a unique key (e.g. `grp_quickstart`) — auto-generated when node is created, appears in AI context as `[id:grp_xxx]`. AI can reference via `sourceGroupId`/`targetGroupId` in JSON response.
- **AI grouping**: `flowchartSymbolDetail()` groups symbols by section using BFS from each Start node. Each group rendered under `=== {section} [id:grp_xxx] ===` header. Supports overlapping groups (user can have multiple Start nodes sharing the same End).
- **Insert Between resolution order**: `sourceGroupId` → `sourceIndex` → `sourceLabel` (highest priority to lowest).
- **Move Group** (FlowchartView toolbar): `<Select>` dropdown listing all groups (from `canvasGroups`). Select a group → BFS selects all member nodes via `selected: true` → dashed indigo bounding box appears around the group. Drag one member node → all group members move together (ReactFlow multi-drag native). Click pane → group deselected. Bounding box SVG is rendered outside ReactFlow with viewport transform (`onMove` tracker) so the rect position stays consistent with flow coordinates during pan/zoom. File: [`src/components/views/FlowchartView.tsx`](./src/components/views/FlowchartView.tsx)

## Flowchart SVG Export

- [`src/lib/generateFlowchartSVG.ts`](./src/lib/generateFlowchartSVG.ts): utility that generates SVG strings from nodes + edges, including shapes, labels, connections, and arrow markers. Supports all shapes (oval, diamond, parallelogram, database, document, cloud, circle, rectangle). `downloadSVG(svgString, filename)` triggers download.
- **Export flow**: FlowchartView registers a `FlowchartExportHandler` to `WorkspaceContext` via `setFlowchartExportHandler` on mount. Handler contains `exportAll()`, `exportGroup(group)`, and `groups[]`.
- **Preview modal** ([`src/components/flowchart/FlowchartExportModal.tsx`](./src/components/flowchart/FlowchartExportModal.tsx)): before exporting, FlowchartView opens `FlowchartExportModal` which renders native ReactFlow (uses `FlowchartNode` component) — not native SVG style. Users can preview and click "Download SVG" to trigger export.
- **Export All Canvas**: all nodes + edges are rendered in a ReactFlow modal, then exported as a full SVG with dark background (`#0f0f14`), arrow markers, handle dots, and section badges.
- **Export Group**: BFS from the group's Start node → collect all connected nodes/edges → filter only nodes in the group → render in modal → export as SVG.
- **NavActionsMenu** ([`src/components/NavActionsMenu.tsx`](./src/components/NavActionsMenu.tsx)): for `documentType === 'flowchart'`, renders Export submenu → SVG Format → "All Canvas" + one item per group. Reads handler from `useWorkspace().flowchartExportHandler`.
- **FlowchartExportHandler** defined in `WorkspaceContext.tsx`: `{ exportAll: () => void; exportGroup: (group: string) => void; groups: string[] }`.



**Special instructions for Edit Columns prompt**:
- When multiple tables selected, prompt shows ALL selected tables with column structures
- Instructs AI to respond with JSON + a user-facing message after the code block (e.g., "Click the **Append** button to apply changes to the admins table.")
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

- **`src/lib/api.ts`**: Centralized API helper with `API_BASE_URL` and `apiFetch()` wrapper
  ```ts
  function isTauri(): boolean {
    return typeof window !== 'undefined' &&
      !!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);
  }
  export const API_BASE_URL: string = import.meta.env.VITE_API_URL ||
    (import.meta.env.DEV && !isTauri() ? '' : 'http://localhost:3000');
  ```
  - **Browser dev**: `API_BASE_URL = ''` → requests go through Vite proxy (`/api` → `localhost:3000`)
  - **Tauri dev / production**: `API_BASE_URL = 'http://localhost:3000'` → direct absolute URL (avoids CORS cross-origin from `tauri://localhost`)
  - **Override**: set `VITE_API_URL=https://api.server.com` in `.env`
- All `fetch('/api/...')` calls replaced with `apiFetch('/api/...')` — when repos split, set `VITE_API_URL=https://api.server.com` and all calls redirect
- **Global 401 interceptor** (`main.tsx:12`): patched to detect API calls by checking `API_BASE_URL` prefix in addition to relative `/api/` paths
- **Vite proxy** (`vite.config.ts:20`): `/api` proxied to `VITE_API_URL || http://localhost:3000` for standalone dev
- **No `Content-Type` auto-setting** — upload calls (FormData) work without override

## Database Mode Detection

Three database modes, chosen by `DATABASE_URL`:

| Mode | Detection | Auth | ID type | Schema |
|------|-----------|------|---------|--------|
| **Desktop/SQLite** | `file:` or `.db` in URL | Local (desktop-auth.ts) | `Int` | `schema.sqlite.prisma` |
| **Local PostgreSQL** | `postgresql://` URL + no `SUPABASE_URL` | Local (same as desktop) | `Int` | `schema.pg.prisma` |
| **Supabase PostgreSQL** | `postgresql://` URL + `SUPABASE_URL` set | Supabase Auth (JWT) | `BigInt` | `schema.prisma` |

### Detection helpers ([`server/lib/config.ts`](./server/lib/config.ts)):
- `isDesktopMode()` — SQLite URL patterns
- `isLocalPostgres()` — PostgreSQL URL without `SUPABASE_URL`
- `useLocalAuth()` — `isDesktopMode() || isLocalPostgres()` — used in auth routes

### Key server files handling local PostgreSQL:
- [`server/lib/middleware.ts`](./server/lib/middleware.ts): `authenticate` + `checkSupabase` skip Supabase when `useLocalAuth()` is true
- [`server/routes/auth.ts`](./server/routes/auth.ts): all `isDesktopMode()` → `useLocalAuth()` so local PostgreSQL uses the same email/password auth path
- [`server/lib/prisma.ts`](./server/lib/prisma.ts): skips `connection_limit`/`pgbouncer` pooler params for local PostgreSQL
- [`server/lib/utils.ts`](./server/lib/utils.ts): `toProjectId()` returns `Number()` for both SQLite and local PostgreSQL, `BigInt()` only for Supabase PostgreSQL
- [`server/lib/security.ts`](./server/lib/security.ts): `isAdminUser()` uses `useLocalAuth()` — local PostgreSQL user is always admin (same as desktop)
- [`server/lib/desktop-auth.ts`](./server/lib/desktop-auth.ts): rewritten to use Prisma `session` model instead of raw SQL — works on both SQLite and PostgreSQL (no `?`/`$1` placeholder mismatch)

### Schema for local PostgreSQL ([`prisma/schema.pg.prisma`](./prisma/schema.pg.prisma)):
- Based on `schema.sqlite.prisma` — local User model with `email`/`password`/`name`
- `provider = "postgresql"` with no `schemas` line (uses `public` schema only)
- Int IDs (same as SQLite) — simpler than Supabase's BigInt
- No Supabase auth tables (identities, sessions, mfa_factors, etc.)
- Includes `Session` model (auth sessions table) — also added to `schema.sqlite.prisma`
- Generate: `npm run db:generate:pg:local`
- Migrate/push: `npm run db:push:pg:local`
- Seed: `npm run db:seed:pg:local`
- Run: `npm run dev:pg:local`

### .env setup for local PostgreSQL:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/erd_builder_pro"
# No SUPABASE_URL — triggers local auth mode
```

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

## Workspace Filtering (Sidebar)

Workspace/sidebar filtering menggunakan `project.uid` sebagai key identifier. Alur:

- Sidebar → `handleWorkspaceClick(project.uid)` → `handleViewChange(view, true, uid)` → navigasi ke `/table/{view}?workspace={uid}`
- `useTableViewPagination` membaca `selectedWorkspaceUid` dari URL params → lookup project by `uid` di `projects[]` → dapat `project.id` (numeric) → fetch API dengan `project_id=${id}`
- Server `POST /api/projects` di [`server/routes/projects.ts`](./server/routes/projects.ts) HARUS generate `uid: randomUUID()` agar workspace baru bisa difilter. Kalau `uid` null, proyek tidak akan muncul di lookup filter.
- Backfill data existing: `prisma.project.updateMany({ where: { uid: null }, data: { uid: crypto.randomUUID() } })`

## AGENTS.md File References Convention

- All `src/` file paths in AGENTS.md use relative `./` links with backtick formatting: `` [`src/path/file.ts`](./src/path/file.ts) ``
- Links open files locally when clicked in supporting terminals
- Relative sibling paths (without `src/` prefix, e.g. after a comma) are NOT linked

## useAIChat Refactoring (Split into Modules)

- [`src/hooks/useAIChat.ts`](./src/hooks/useAIChat.ts) was reduced from 892 lines to ~483 lines by extracting logic into dedicated modules under [`src/hooks/aiChat/`](./src/hooks/aiChat/):
  - [`buildSystemMessages.ts`](./src/hooks/aiChat/buildSystemMessages.ts): exports `fallbackSystemPrompt`, `buildTechnicalRules()`, `fetchUserSystemPrompt()` — all system prompt construction
  - [`resolveAiConfig.ts`](./src/hooks/aiChat/resolveAiConfig.ts): `resolveAiConfig(userId)` — fetches AI provider config (baseUrl, apiKey, model) from Supabase
  - [`callAiStream.ts`](./src/hooks/aiChat/callAiStream.ts): `callAiStream(...)` — server-side SSE proxy streaming
  - [`guestPersistence.ts`](./src/hooks/aiChat/guestPersistence.ts): `persistGuestMessages()`, `persistGuestTitle()` — IndexedDB persistence for Guest mode
  - [`syncSessionProjectId.ts`](./src/hooks/aiChat/syncSessionProjectId.ts): `syncSessionProjectId(...)` — syncs `project_id` when entity moves between projects
  - [`index.ts`](./src/hooks/aiChat/index.ts): barrel export
- `autoTitleSession` extracted into a `useCallback` to deduplicate Guest/Online title-setting logic
- `isGuestCheck()` helper replaces repeated `isGuestRef.current || sessionStorage.getItem(...)` boilerplate

## URL Sync Safety Net (Editor Routes)

- Each editor route has a `useEffect` safety net that syncs `id` from `useParams()` to context `active*Id`/`active*Uid`.
- **Problem**: Navigation hooks (`useNoteNavigation`, `useDiagramNavigation`, etc.) have URL sync effects, but there's a race condition — data fetch from `selectNote`/`selectDiagram` can complete BEFORE the initial data fetch. As a result, `isItemLoading` becomes `false` and `activeNote` is still `null`, triggering "not found" even though the file is still loading.
- **Fix Phase 1 (Safety Net)**: Each editor route:
  1. `processedUrlRef` (`useRef(false)`) — one-time flag per mount
  2. `useEffect` with dep `[id, activeId, isPublicView, handleSelect]`:
     - If `activeId` already matches `id` → set `processedUrlRef = true`, return
     - If `activeId` is still null → call `handleSelect(id)`, set `processedUrlRef = true`
  3. In the guard "select a ... to view" (`!activeId`): if `id` exists but `processedUrlRef` is still `false` → render loading spinner (not "select")
- **Duplicate guard**: `handleSelect` (from navigation hooks) has a 1.5s guard via `lastSelected*Ref`, so the safety net effect does not cause double-fetch if the URL sync effect has already run.
- **Fix Phase 2 (Fetch Wipe Prevention)**: Additional race condition — `selectNote` completes fetch first and adds the note to the array, then `fetchNotes(pageData)` completes and **replaces the entire array** (via `setNotes(page1Data)`), removing the active note from the array → `activeNote` becomes null, `isItemLoading` false → "not found". Fix in all 4 hooks:
  - Add ref for active ID in each hook: `activeNoteUidRef`, `activeDiagramIdRef`, `activeDrawingUidRef`, `activeFlowchartIdRef`
  - In `fetch*`, non-loadMore branch: `set*(prev => {...})` — if active ID is not in the new page data, preserve item from `prev`
  - Files:
    - [`src/hooks/useNotes.ts`](./src/hooks/useNotes.ts): `activeNoteUidRef` + conditional preserve in `setNotes`
    - [`src/hooks/useDiagrams.ts`](./src/hooks/useDiagrams.ts): `activeDiagramIdRef` + preserve in `setDiagrams`
    - [`src/hooks/useDrawings.ts`](./src/hooks/useDrawings.ts): `activeDrawingUidRef` + preserve in `setDrawings` (merge pattern)
    - [`src/hooks/useFlowcharts.ts`](./src/hooks/useFlowcharts.ts): `activeFlowchartIdRef` + preserve in `setFlowcharts` (merge pattern)
- **File pattern safety net**: [`src/routes/NoteEditorRoute.tsx`](./src/routes/NoteEditorRoute.tsx):17-30 (safety net effect), 32-42 (guard + loading fallback)

## Server-Side AI Proxy

- **`server/routes/ai.ts`**: `POST /api/ai/proxy` — proxy endpoint that forwards chat requests to OpenAI-compatible providers and streams SSE responses back to the client.
- **Why proxy**: API key is not directly exposed to third-parties in browser DevTools. The key is sent in the POST body from client to server, then the server forwards to the provider.
- **`res.on("close")` vs `req.on("close")`**: Use `res.on("close")` to detect client disconnect. `req.on("close")` fires prematurely when the POST body is finished reading by `express.json()`, which causes `AbortController.abort()` to be called before the fetch to the AI provider can connect.
- **30s timeout**: Safety timeout to prevent the provider fetch from hanging forever.
- **File**: [`server/routes/ai.ts`](./server/routes/ai.ts)

## AI Session UID Handling (SQLite vs PostgreSQL)

SQLite schema lacks `@default(uuid())` on `uid` columns → sessions created with `uid: null`. This causes frontend failures when code expects `session.uid` to always be a string.

### Server Fixes

- **`POST /sessions`** ([`server/routes/ai-chat.ts`](./server/routes/ai-chat.ts)): explicitly sets `uid: randomUUID()` on create so SQLite sessions always have a UUID.
- **`uidOrIdWhere(uid, userId)`** ([`server/lib/utils.ts`](./server/lib/utils.ts)): helper for all `:uid` routes — matches by `uid` OR `id` (numeric fallback for existing null-uid sessions). Applied to: GET/DELETE/PUT `/sessions/:uid`, GET `/sessions/:uid/messages`.
- **POST `/messages`** (`ai-chat.ts`): session lookup uses `OR [{ uid: sid }, { id: numericId }]` — handles both `session.uid` and `session.id` as `session_id` payload.
- **Backfill** ([`server/lib/startup-migration.ts`](./server/lib/startup-migration.ts)): `aiChatSession` added to `backfillUids()` — assigns UUID to existing null-uid sessions on server restart.

### Frontend Fixes

- All `session_id: currentSession.id` → `session_id: currentSession.uid ?? currentSession.id` in [`src/hooks/useAIChat.ts`](./src/hooks/useAIChat.ts) (5 occurrences).

## AI Proxy Status Code Safety

- **`server/routes/ai.ts`** returns **502 Bad Gateway** (not pass-through status) for upstream provider errors — prevents the global 401 interceptor in [`src/main.tsx`](./src/main.tsx) from dispatching `auth:unauthorized` and reloading/redirecting to `/`.
- The global interceptor (`main.tsx:28`) treats any 401 on `/api/*` as session expiry → `auth:unauthorized` event → `useAuth` clears auth state → `App.tsx` redirects to login. AI provider 401 must not leak through.

## AI Config API Key Mask Safety

- [`server/routes/ai-settings.ts`](./server/routes/ai-settings.ts) masks `apiKey` as `'***'` in GET/POST `/configs` responses.
- **Server-side guard**: `POST /configs` update/create branch ignores `api_key` if value is `'***'` — prevents accidentally overwriting the real key when user clicks Save without changing the field. Real key stays in DB.
- **Test Connection moved server-side**: `POST /api/ai/settings/configs/test` endpoint at `ai-settings.ts` — reads real API key from DB, calls provider, returns success/failure. Frontend `handleTestConnection` in [`src/hooks/useAIProviders.ts`](./src/hooks/useAIProviders.ts) sends only `{ provider_code, model_identifier }`, no key in request body. Eliminates `Bearer ***` bug.

## @Mentions as Clickable Links in Chat

- User messages in `ChatMessages.tsx` parse `@FileName` patterns via the same regex as `resolveMentions` (`/@([^\s\n]+)/g`)
- Matching mentions render as cyan-colored `<Link>` elements (underline on hover) that navigate to the referenced file
- Route lookup: note → `/notes/{uid}`, diagram → `/erd/{uid}`, flowchart → `/flowchart/{uid}`, drawing → `/drawing/{uid}`
- `mentionFiles` prop passed from `AIChatPanel` to `ChatMessages` (same data used for ChatInput dropdown)
- Unmatched `@text` (no file found) remains as plain text — unchanged
- Uses `renderMentionText(text)` function called inside the user message `<p>` element, replacing raw `{displayText}`

## Custom SQL DDL AST Parser & Lexer

- **Parser Architecture**: Replaced fragile regex matching in [`src/lib/sqlParser.ts`](./src/lib/sqlParser.ts) with a custom token-based **Lexer & Parser DDL**.
- **Lexer (`SqlLexer`)**:
  - Ignores SQL comments (`--`, `/* */`, `#`).
  - Tokenizer that distinguishes: `KEYWORD`, `IDENTIFIER` (cleans backticks, quotes, braces `[]`), `SYMBOL` (`(`, `)`, `,`, `;`, `.`), `NUMBER`, and `STRING`.
- **Parser (`SqlParser` / `parseSqlDdl`)**:
  - Parses `CREATE TABLE` and `ALTER TABLE` statements using a token stream.
  - Supports inline column constraints (`PRIMARY KEY`, `NOT NULL`, `NULL`, inline `REFERENCES`).
  - Supports table-level constraints (`PRIMARY KEY (...)` and `FOREIGN KEY (...) REFERENCES ...`).
  - Ignores SQL dialect noise such as `ENGINE=InnoDB`, `DEFAULT CHARSET`, custom collation, custom indexes (`INDEX`/`KEY`/`UNIQUE`).
  - Limits boundary check in `parseColumnConstraints` to stop at `;` (semicolon), so consecutive `ALTER TABLE` statements are parsed correctly without skipping lines.
- **Integration**:
  - [`src/components/ai/actions/erdActions.ts`](./src/components/ai/actions/erdActions.ts) imports `parseSqlDdl` to replace regex-based `parseAlterTableAddColumn` and manual relationship parsing.
- Visual diagram is 100% synchronized with PostgreSQL, MySQL, and SQLite dialects.

## Phase 2: Cross-Document Interoperability & AI Workspace Architect

- **Automated Document Creation**:
  - **"Create ERD"** and **"Create Flowchart"** buttons are added to AI chat message bubbles when the assistant generates SQL DDL or flowchart JSON.
  - Flow: Fetch relevant data → Store in `localStorage` (`pending_create_erd_ddl` or `pending_create_flowchart_json`) → Call document creation functions from context (`handleSidebarDiagramCreate` / `handleSidebarFlowchartCreate`) → Navigate the user to the new page.
  - **Project ID Inheritance (Workspace Integration)**: Passes `projectId` prop from the active document (obtained in `AppLayout` via entity context) to `AIChatPanel` → `<ChatMessages activeProjectId={projectId} />`. Clicking "Create ERD" / "Create Flowchart" triggers `handleSidebarDiagramCreate` / `handleSidebarFlowchartCreate` with this `projectId`, guaranteeing the new document is created with the same `project_id` for workspace/project integrity.
  - Mount hook: [`src/components/views/ERDView.tsx`](./src/components/views/ERDView.tsx) and [`src/components/views/FlowchartView.tsx`](./src/components/views/FlowchartView.tsx) detect `localStorage` items on mount, parse content, initialize the canvas, take history snapshots (for undo/redo), and automatically clear storage.
- **Rich Context Mentions**:
  - **Diagram Mentions**: Mentioning `@DiagramName` in chat triggers a dynamic database search to identify the full list of tables, column types, and primary keys to send as context prompt (previously only the diagram name was sent).
  - **Flowchart Mentions**: Mentioning `@FlowchartName` parses the ReactFlow JSON into structured descriptive summaries ("Steps" and "Connections") before sending to AI, saving token allocation and improving the model's understanding of the flow.

## Spacing & Spacing Fixes (Editor and PDF Export)

- **In-App Editor Spacing**:
  - **Bug**: In the Tiptap editor (wrapped with class `.tiptap-editor-lined`), gaps between headings (`h1` to `h6`) and surrounding paragraphs/content are too tight/stacked. This is because the selector `.tiptap-editor-lined .ProseMirror>*` forces `margin-top: 0 !important` and `margin-bottom: 0 !important`.
  - **Fix**: Changed global reset in [`src/index.css`](./src/index.css) using `:not(h1):not(h2):not(h3):not(h4):not(h5):not(h6)` to exclude headings from the zero-margin reset. Defined proportional and spacious margin-top/bottom for `h1` to `h6` for optimal breathing room, and added a `:first-child` selector specifically on headings to reset `margin-top` to `0.5rem` when the heading is at the top of the document.
- **PDF Export Spacing**:
  - **Bug**: In Note-to-PDF export results, spacing between headings, paragraphs, and list items is too loose because default browser margins/paddings are not reset, plus manual gap additions are too large in `exportToPDF` (jsPDF direct object builder) and print styling (`printNote`).
  - **Fix**:
    1. **Direct PDF Export (`exportToPDF` in [`src/lib/exporters/note-exporter.ts`](./src/lib/exporters/note-exporter.ts))**:
       - Implemented static helper `NoteExporter.decodeHtml(html)` to resolve HTML entities (e.g. `&amp;` -> `&`) in Table of Contents outline and heading text.
       - Changed flat render loop to recursive DOM traversal engine (`renderNode`) for precise block element, list (`ul`/`ol`), list item (`li`), and blockquote rendering with dynamic indentation based on list depth level (`listDepth * 16`).
       - Tightened vertical spacing by reducing paragraph `margin-bottom` from `12pt` to `5pt` and heading `margin-bottom` from `20pt` to `5pt`.
    2. **High-Quality Print PDF (`printNote` in [`src/lib/exporters/note-exporter.ts`](./src/lib/exporters/note-exporter.ts))**:
       - Added CSS global reset (`* { margin: 0; padding: 0; box-sizing: border-box; }`) in `exportStyles` to prevent default browser margins from stacking.
       - Set more compact heading and paragraph margins (`margin-bottom: 10px` for `p`, `margin-top: 20px` / `margin-bottom: 8px` for `h2`).
       - Added `li p { margin-bottom: 0; }` rule so paragraphs inside list items do not duplicate bottom margin.

## Phase 3: Visual Schema Diffing & Merge Resolution (Git-style Database Design)
  - **Schema Diff Engine**: Utility [`src/lib/schema-diff.ts`](./src/lib/schema-diff.ts) compares old ERD schema against proposed new SQL DDL schema from AI. It marks nodes/tables with `diffState` (`'new' | 'modified' | 'deleted'`) and individual columns with the same flags.
  - **Visual Diff Highlights**: On the ERD canvas, new tables render with bright green borders (plus "NEW" badge and emerald glow), modified tables render with amber borders ("MOD" badge), and deleted tables render with faded red borders ("DEL" badge, low opacity). New columns prefixed with `+` in green, removed columns struck through in red.
  - **Conflict & Merge Resolution Panel**: Floating toolbar at the bottom of the canvas showing a change summary (e.g., "2 New, 1 Mod, 0 Del"). Users can open a **Checklist Panel** to review details and select which tables to approve for merging.
  - **Merge & Reversion Logic**: When **"Merge Selected"** is clicked:
    - Approved new/modified tables are merged (`diffState` markers cleared, columns marked for deletion are filtered out before saving).
    - Rejected modified/deleted tables are reverted to their original schema before AI touched them.
    - Relationships (arrow connectors/edges) are dynamically rebuilt to connect only selected/approved tables.

## AI Prompt — SQL DDL Output Instruction

- `buildDiagramContext()` in [`src/hooks/aiEntityContext/diagram.ts`](./src/hooks/aiEntityContext/diagram.ts):76 now places the **SQL DDL format instruction at the TOP** of the context (was at bottom, after table data).
- Instruction is **directive, not conditional**: "When you respond about database schemas... you MUST output valid SQL DDL statements inside a ```sql code block." (Was: "When the user asks for table suggestions or schema changes, ALWAYS include...")
- Covers **"create ERD from scratch"** scenario: rule #5 explicitly tells AI to generate complete SQL DDL when user asks to create an ERD from nothing
- Enforces ` ```sql ` code block wrapping: plain text/HTML tables will NOT be parsed
- Schema design rules (no duplicate columns, FK references) moved to a separate bottom section
- **Portable SQL types (default)**: AI instructed to use dialect-neutral, portable types by default — `BIGINT` for PKs (NOT `BIGSERIAL`/`SERIAL`/`AUTO_INCREMENT`), `INT`, `VARCHAR(n)`, `TEXT`, `BOOLEAN`, `TIMESTAMP`, `DECIMAL`, `UUID`. This ensures parsed ERD types match across export dialects.
- **Dialect override**: Rule #11 in `diagram.ts` allows dialect-specific syntax (PostgreSQL, MySQL, etc.) **if the user explicitly asks for it**. Both the ERD context prompt (`diagram.ts`) and the Technical Rules (`buildSystemMessages.ts`) enforce the same portable-by-default, dialect-on-request policy.
- **Files**: [`src/hooks/aiEntityContext/diagram.ts`](./src/hooks/aiEntityContext/diagram.ts), [`src/hooks/aiChat/buildSystemMessages.ts`](./src/hooks/aiChat/buildSystemMessages.ts)

## Content-Aware Action Buttons (AI Chat)

- **Problem**: When viewing Notes page and AI responds with SQL DDL, Replace/Append buttons still showed (for Notes content), while the Database button (Create/Update ERD) was also visible — confusing which button to use.
- **Fix (UI)**: [`src/components/ai/AssistantMessageActions.tsx`](./src/components/ai/AssistantMessageActions.tsx):32 — Notes view (`contentCheckType === 'none'`) now ALWAYS shows Replace/Append buttons, regardless of content type. Database/Flowchart buttons appear alongside when SQL/JSON is detected. A dedicated **Notes button** (amber FileText icon) is ALWAYS visible across ALL views — opens `NoteFromTextDialog` with Create New / Update Existing options. This lets users save ANY AI response as a Note from any feature view (Notes, ERD, Flowchart).
- **Fix (Prompt)**: [`src/hooks/useAIChat.ts`](./src/hooks/useAIChat.ts):550,571 — system instruction changed from "Advise the user to click the 'Append' (or 'Replace') button" to "Advise the user to click the Database button (or the Create/Update ERD button)" / "Advise the user to click the Flowchart button (Create/Update)". The `fallbackSystemPrompt` (line 507) similarly updated.
- **Fix (ERD context prompt)**: [`src/hooks/aiEntityContext/diagram.ts`](./src/hooks/aiEntityContext/diagram.ts):120 — rule #9 tells AI not to say "Append/Replace" for SQL content but to say "Database button" instead.
- **Result**: Action buttons are content-aware: Notes always shows Replace/Append (plus optional Database/Flowchart/Notes), ERD shows Append only for SQL, Flowchart shows Replace/Append only for JSON. The Notes button is always available cross-view.
- **NoteFromTextDialog** ([`src/components/ai/NoteFromTextDialog.tsx`](./src/components/ai/NoteFromTextDialog.tsx)): follows same pattern as `ErdFromSqlDialog`/`FlowchartFromJsonDialog` — Create New (creates a new Note with AI content) or Update Existing (navigates to selected Note). Uses `handleSidebarNoteCreate` (now returns `Promise<any>` with created note) and `handleNoteSelect` from workspace context.

## Stale URL on Guest → Online Login

- **Bug**: Guest user browsing `/notes/guest-uuid` → logout → Online login → URL still `/notes/guest-uuid` → URL safety net in `NoteEditorRoute` tries `handleNoteSelect('guest-uuid')` → note doesn't exist in Online mode → error
- **Fix**: [`src/App.tsx`](./src/App.tsx):38-46 — `useEffect` tracks `wasUnauthenticatedRef`. When `isAuthenticated` transitions from `false → true` (user logs in), calls `navigate('/')` to clear stale URL. Only triggers on explicit re-authentication, not on initial mount (`null → true`), so deep-links on page reload still work.

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
- **Guest mode Save indicator bug**: `triggerDebouncedSync` in [`src/hooks/useSyncService.ts`](./src/hooks/useSyncService.ts):152 unconditionally set `hasPendingSyncs = true` before calling `syncDrafts()`. In Guest mode, `syncDrafts` returned early (cloud sync inactive), but `hasPendingSyncs` stayed `true` permanently, causing the navbar save indicator to show a "Save" icon instead of the "Synced" checkmark. **Fix**: added `isGuestCheck()` guard at the top of `triggerDebouncedSync` to return immediately for Guest mode.
- **`isGuestCheck()` pattern** extended to `useSyncService.ts`: same `isGuestRef` + `sessionStorage` fallback pattern to ensure Guest mode detection is synchronous and immune to React stale closures.

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

## Cross-Feature Chat (Session Scoping by Project)

- **Sessions are scoped by project** — `entity_type`/`entity_uid` is set when the session is first created for origin tracking. Session listing uses only `project_id` filter — all sessions within a project are visible across all feature files (Notes, ERD, Flowchart). A session created from a Note in Project A appears in ERD and Flowchart views within Project A, but never in Project B.
- **Radio pills** in `ChatInput.tsx` display actions according to **the currently open feature file** (not the session's `entity_type`). Determined by the `entityType` prop (current view).
  - File: [`src/components/ai/AIChatPanel.tsx`](./src/components/ai/AIChatPanel.tsx):106 — `getActionsForView(currentViewType)` based on `entityType` (current file, not session origin)
  - File: [`src/components/ai/ChatInput.tsx`](./src/components/ai/ChatInput.tsx):198 — `showActions = !isStreaming && actions.length > 0` (no `isCrossEntity` filter — actions still show even if session originated from a different view)
- **Create ERD/Flowchart duplicate prevention**: every time user clicks Create ERD/Flowchart from chat, the created diagram UID is stored in a ref (`chatErdUidRef`) + localStorage (`chat_erd_uid`). Next click → updates existing diagram (navigate + pending DDL/JSON in localStorage), not create new.
  - File: [`src/components/ai/ChatMessages.tsx`](./src/components/ai/ChatMessages.tsx): `chatErdUidRef`, `chatFlowchartUidRef`
  - `handleSidebarDiagramCreate`/`handleSidebarFlowchartCreate` return created object (changed from `Promise<void>` to `Promise<any>` in [`src/hooks/useSidebarHandlers.ts`](./src/hooks/useSidebarHandlers.ts) and [`src/providers/WorkspaceContext.tsx`](./src/providers/WorkspaceContext.tsx))
- **Content-aware buttons**: each AI message can have multiple action buttons — buttons are shown ONLY if content type X is not handled by the active view:
  - `showReplaceAppend = !hasSQLContent && !hasFlowchartJSON` (Notes view: hide Replace/Append when AI outputs SQL/JSON)
  - `showSqlButton = hasSQLContent && contentCheckType !== 'erd'` (ERD view: hide Database button, but show in Notes/Flowchart)
  - `showFlowchartButton = hasFlowchartJSON && contentCheckType !== 'flowchart'` (Flowchart view: hide Flowchart button, but show in Notes/ERD)
  - File: [`src/components/ai/AssistantMessageActions.tsx`](./src/components/ai/AssistantMessageActions.tsx):41
- **`isCrossEntity` removed** — no longer needed since all sessions are cross-feature. Props `isCrossEntity`, `entityTypeMeta`, `handleSidebarFlowchartCreate`, `handleFlowchartSelect` removed from `AssistantMessageActions`. Prop `isCrossEntity` removed from `ChatInput`, `ChatMessages`, `AIChatPanel`.
- **ERD Dialog (inline in `ChatMessages.tsx`)**: dialog that appears when user clicks the Database button on an AI message containing SQL DDL:
  - **Radio-style cards** (`erdMode: 'create' | 'update' | null`): two selectable cards — "Create New" (indigo) and "Update Existing" (amber). Nothing executes immediately, all wait for Submit button.
  - **Submit button** in footer: disabled until mode is selected (and for update, until target file is selected). Has loading spinner (`erdModeConfirming`) during execution.
  - **Create New**: shows table cards (parsed SQL as per-table cards with columns, PK/FK badge) — no additional elements.
  - **Update Existing**: shows only Target ERD selector (base-ui `Select`) — **no table preview before file is selected**. Diff appears after user selects a file and existing data is loaded.
  - **Unified diff (GitHub-style)**: after user selects target file and existing data is fetched (`erdExistingData` via `apiFetch`), displayed per table:
    - Table header (sticky, `bg-[#0d1117]` solid — no ghosting)
    - `+` green bg/emerald text for new or modified columns
    - `-` red bg/red text for removed columns
    - ` ` no bg/gray text for unchanged
    - Modified columns shown as `- old` + `+ new` sequence
    - Type column colored separately (`text-gray-500`/muted) from column name
  - **Filter ERD**: only diagrams matching the session's `projectId` (or without project) appear in the file selector
  - **Two localStorage keys**: `pending_create_erd_ddl` (Create) and `pending_update_erd_ddl` (Update)
  - Dialog uses `size="2xl"` (max-w-2xl) for more spacious layout
  - State: `erdMode`, `erdSql`, `erdUpdateUid`, `erdExistingData`, `erdFetchingExisting`, `erdModeConfirming`
  - **ERD Auto-Naming**: `erdDefaultName` prop chain (`AIChatPanel` → `ChatMessages` → `ErdFromSqlDialog`) → `ERD - ${entityTitle || 'New ERD'}`. Uses source file title (e.g., "ERD - PRD Aplikasi Payroll Sederhana") instead of hardcoded "ERD from Chat".
  - File: [`src/components/ai/ErdFromSqlDialog.tsx`](./src/components/ai/ErdFromSqlDialog.tsx)

- **FlowchartFromJsonDialog (inline in `ChatMessages.tsx`)**: dialog that appears when user clicks the Flowchart button on an AI message containing flowchart JSON:
  - **Radio-style cards** (`flowchartMode: 'create' | 'update' | null`): two selectable cards — "Create New" (indigo) and "Update Existing" (amber). Nothing executes immediately, all wait for Submit button.
  - **Submit button** in footer: disabled until mode is selected (and for update, until target file is selected). Has loading spinner (`flowchartModeConfirming`) during execution.
  - **Create New**: shows list of symbols to be created (label, shape badge per symbol).
  - **Update Existing**: Target Flowchart selector (base-ui `Select`). After file is selected and existing data is loaded, diff preview appears per-node with ERD-style comparison:
    - **Nodes**: per symbol shows header (label) + `NEW` badge or `DEL` badge. Property changes: `- old` + `+ new` (modified), ` ` prefix (unchanged). Modified nodes shown as `- old` + `+ new` per property (shape, color).
    - **Edges**: `+` green for new edges, `-` red for removed edges, displayed in a separate "Connections" section.
  - **Filter Flowchart**: only flowcharts matching the session's `projectId` (or without project) appear in the file selector
  - **Two localStorage keys**: `pending_create_flowchart_json` (Create) and `pending_update_flowchart_json` (Update)
  - Dialog uses `size="2xl"` (max-w-2xl) for more spacious layout
  - State: `flowchartMode`, `flowchartJson`, `flowchartUpdateUid`, `flowchartExistingData`, `flowchartFetchingExisting`, `flowchartModeConfirming`
  - File: [`src/components/ai/FlowchartFromJsonDialog.tsx`](./src/components/ai/FlowchartFromJsonDialog.tsx)

### Schema Diff Engine

- **`computeSchemaDiff(currentNodes, currentEdges, proposedNodes, proposedEdges)`** ([`src/lib/schema-diff.ts`](./src/lib/schema-diff.ts)):
  - Match tables by **name** (lowercase) — not node ID, because `parseSQLToERD` generates random IDs per parse
  - Produces `DiffResult` with `nodes` (annotated), `edges`, `newCount`, `modifiedCount`, `deletedCount`
  - Each node is given `diffState`: `'new'` | `'modified'` | `'deleted'` | `undefined`
  - Each column is given `diffState`: `'new'` | `'deleted'` | `undefined`
  - Original node position is preserved (`origNode.position`) so the diff appears in a familiar layout
- **ERDView `startDiff`** ([`src/components/views/ERDView.tsx`](./src/components/views/ERDView.tsx):230): uses `computeSchemaDiff` to display a diff overlay on the main canvas (merge panel + approve/reject per table)

## NoteFromTextDialog (localStorage Bridge for AI Content)

- **`NoteFromTextDialog`** ([`src/components/ai/NoteFromTextDialog.tsx`](./src/components/ai/NoteFromTextDialog.tsx)): single dialog with side-by-side diff preview, replaces the two-dialog flow (dialog → DiffPreviewModal).
- **3 modes on Notes page** (auto-detected via `window.location.pathname`): Create New, Replace All, Append. **2 modes off-Notes**: Create New, Update Existing.
- **localStorage bridge** (matching ERD/Flowchart `pending_create_erd_ddl` pattern):
  - `pending_note_content: string` — AI markdown text
  - `pending_note_strategy: 'replace' | 'append'`
- **`NotesView`** ([`src/components/views/NotesView.tsx`](./src/components/views/NotesView.tsx):66-115) has a second `useEffect` that:
  1. On mount: checks localStorage after 300ms delay (allows note data to settle)
  2. Listens for custom `'apply-pending-note'` window event (for on-Notes page flow)
  3. When triggered: reads localStorage, parses markdown → HTML (`marked` + `DOMPurify`), applies strategy (replace vs append), calls `handleNoteChange` + `saveNote` — **no DiffPreviewModal**
- **Diff preview**: NoteFromTextDialog shows side-by-side Original vs AI Changes when on Notes page (Replace/Append) or Update Existing mode. Replaces the DiffPreviewModal that was previously opened by the content handler.
- **Prop chain**: `AppLayout` → `AIChatPanel` (new `activeNoteContent` prop) → `ChatMessages` → `NoteFromTextDialog`
- **Flow**:
  - **Off-Notes Create**: Store → `handleSidebarNoteCreate` (creates + navigates) → NotesView mount → 300ms → apply
  - **Off-Notes Update**: Store → `handleNoteSelect` (navigates) → NotesView mount → 300ms → apply
  - **On-Notes Replace/Append**: Store → `window.dispatchEvent(new CustomEvent('apply-pending-note'))` with 50ms delay → NotesView event listener → apply directly (no second dialog)
  - **Files**: [`src/components/ai/NoteFromTextDialog.tsx`](./src/components/ai/NoteFromTextDialog.tsx), [`src/components/ai/ChatMessages.tsx`](./src/components/ai/ChatMessages.tsx), [`src/components/views/NotesView.tsx`](./src/components/views/NotesView.tsx), [`src/components/ai/AIChatPanel.tsx`](./src/components/ai/AIChatPanel.tsx), [`src/routes/AppLayout.tsx`](./src/routes/AppLayout.tsx)
- **AssistantMessageActions**: Notes button (`FileText` icon) always visible across ALL views. Replace/Append buttons hidden on Notes view (`contentCheckType === 'none'` → `showApplyButtons` is false). User opens NoteFromTextDialog via Notes button.

## AI Rules (Per-View Configurable)

- **`server/routes/ai-rules.ts`**: `GET/PUT /api/ai/rules/:viewType` — validates `'erd'|'notes'|'flowchart'`, upserts per `(user_id, view_type)`.
- **`src/hooks/useAIRules.ts`**: fetch/save rules per view type, guest fallback via localStorage.
- **`src/components/ai/AIRulesTab.tsx`**: 3 sub-tabs (ERD, Notes, Flowchart) with textarea, save button, disable toggle.
- **`src/components/modals/SettingsModal.tsx`**: tab "AI Rules" (`ListChecks` icon) in Feature group, renders `<AIRulesTab />`.
- **`useAIChat.ts`**: injects view rules into system prompt with override instruction — "if user explicitly requests something contradicting a rule, follow user's direct instruction."
- **`AIChatPanel.tsx`**: maps `entityType` → `currentViewType` (`note→notes`, `diagram→erd`, `flowchart→flowchart`), passes to `useAIChat`.
- **DB table**: `user_ai_rules` (UUID PK, FK `auth.users`, `view_type` CHECK, unique per user+view) with RLS policy and `updated_at` trigger.
- **Files**: [`src/hooks/useAIRules.ts`](./src/hooks/useAIRules.ts), [`src/components/ai/AIRulesTab.tsx`](./src/components/ai/AIRulesTab.tsx), [`server/routes/ai-rules.ts`](./server/routes/ai-rules.ts)

## Spinner Style Standardization

- **UI Update**: Previously, some views used a large spinner (`w-10 h-10`) while others used a small spinner (`w-6 h-6`). This has been standardized across the entire application.
- **Implementation**: All loading states (including `<AppInitialization>`, editor routes, and views) now use the same uniform small spinner design: `className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin"`.

## Backup Download Toast (Cross-OS Desktop)

- [`src/components/views/BackupsView.tsx`](./src/components/views/BackupsView.tsx) `handleDownload` behavior differs by platform:
  - **Tauri desktop**: reveals the backup file in the OS file manager via `revealItemInDir()` from `@tauri-apps/plugin-opener`. Since the file is already on local disk (server wrote it directly to the user's configured folder), there's no need to stream it through the WebView. The absolute path is stored in `Backup.file_path` at creation time so this works even if the user later changed their backup folder setting.
  - **Web**: streams the file via `Content-Disposition: attachment` (the server reads the file and serves it as a download).
- **Button icon** also changes by platform: Tauri uses `ExternalLink` icon, web uses `Download`. Title attribute shows "Show in folder" vs "Download backup".
- Tauri detection: `!!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__)`.
- Toast on Tauri: `"Revealed in file manager."` with the full path as description (6000ms). On web: `"Backup \"X\" downloaded successfully."`.

## Tauri Opener Plugin (Reveal in File Manager)

- **Plugin setup** (4 places):
  1. **Rust crate** ([`src-tauri/Cargo.toml`](./src-tauri/Cargo.toml)): `tauri-plugin-opener = "2"`.
  2. **Plugin registration** ([`src-tauri/src/lib.rs`](./src-tauri/src/lib.rs)): `.plugin(tauri_plugin_opener::init())` in `tauri::Builder::default()` chain.
  3. **NPM package** ([`package.json`](./package.json)): `@tauri-apps/plugin-opener@^2.5.4`.
  4. **Capability** ([`src-tauri/capabilities/default.json`](./src-tauri/capabilities/default.json)): `"opener:default"` in `permissions` array.
- **Usage**:
  ```ts
  import { revealItemInDir } from '@tauri-apps/plugin-opener';
  await revealItemInDir('/absolute/path/to/file.sql.gz');
  // Opens Finder/Explorer/Files with the file selected
  ```
- **Path requirement**: must be an absolute path. Relative paths are not resolved — pass the stored absolute path from the DB.

## Backup Restore (Local Mode Only)

- **Use case**: User picks a previous backup from the Backups list and asks the server to overwrite the current database with the backup contents. Destructive — the current DB is replaced. **Local mode only** (desktop SQLite / local PostgreSQL); Supabase mode returns 400.
- **Files**:
  - Server restore logic: [`server/lib/local-backup.ts`](./server/lib/local-backup.ts) `restoreLocalBackup(absolutePath, userId)`.
  - API: [`server/routes/backups.ts`](./server/routes/backups.ts) `POST /api/backups/:id/restore`.
  - UI dialog: [`src/components/modals/RestoreBackupDialog.tsx`](./src/components/modals/RestoreBackupDialog.tsx).
  - Wired into: [`src/components/views/BackupsView.tsx`](./src/components/views/BackupsView.tsx) (Restore button + state).

### Safety net: pre-restore auto-backup

Before overwriting the DB, `restoreLocalBackup` always creates a `PreRestore_<timestamp>` backup of the **current** state. This is the rollback path — if the restore goes wrong or the user picks the wrong backup, they can restore the pre-restore backup to get back to where they were.

- The record is created in the DB with `status: 'pending'` BEFORE the file is written.
- After `createLocalBackup` returns, the record is updated to `status: 'completed'` + `file_path`/`file_size`.
- If the pre-restore backup itself fails, the whole restore aborts with an error — **never proceed to overwrite the DB if there's no rollback path**.
- The pre-restore record is also renamed to `PreRestore_<timestamp>` for clarity in the UI (default name is `Backup_<uuid>_<timestamp>`).

### SQLite restore mechanics

The `.sql.gz` backup is decompressed to a temp `.decompressed` file, then:

1. `prisma.$disconnect()` — must release the file lock on the live `data.db` before overwriting it.
2. Open the decompressed backup with `new Database(tempPath, { readonly: true })`.
3. Use `sourceDb.backup(liveDbPath)` to copy data FROM temp → live DB. better-sqlite3's `backup()` API is the recommended SQLite-native way — it handles WAL, locking, and incremental copy.
4. Close the source db, unlink the temp file.
5. Prisma lazy-reconnects on the next query (better-sqlite3 re-opens the file).

**Why `.decompressed` suffix and not `.db`**: if the restore is interrupted (process kill, OOM, etc.) the leftover file is clearly identifiable as incomplete — never mistaken for a valid backup.

### PostgreSQL restore mechanics

`execAsync(\`psql "${dbUrl}" -f "${tempDbPath}" --quiet\`)` — runs the SQL dump against the live database. `--quiet` suppresses the per-statement output.

**`pgUrlForCli()` strips Prisma query params** ([`server/lib/local-backup.ts`](./server/lib/local-backup.ts)): `DATABASE_URL` from Prisma's adapter includes `?schema=public`, but `pg_dump`/`psql` reject unknown query params with `invalid URI query parameter: "schema"`. Helper uses `URL` API to delete the `schema` param (and any other Prisma-specific ones) before passing to the CLIs. Used in both `backupPostgreSQL` and `restoreLocalBackup`.

### Re-login after restore

After a full DB replace, the session table is also restored. If the restored user table no longer contains the current user, the user is silently logged out. The dialog and success toast both warn about this; the toast has a `Reload` action that forces a page reload to re-fetch auth state.

### Restore confirmation dialog (`RestoreBackupDialog.tsx`)

- **Type-to-confirm** UX (GitHub pattern): user must type the exact backup name to enable the Restore button. Prevents accidental destructive clicks.
- **Auto-focus** the input when the dialog opens (50ms delay so the dialog mounts first).
- **Enter** in input triggers confirm (when name matches).
- **Loading state**: Confirm button shows spinner + "Restoring…", Cancel disabled, dialog not closable mid-restore.
- **Error handling**: on error, the dialog stays open so the user can retry or cancel. The caller (`performRestore` in `BackupsView`) throws — the dialog's `try/catch` keeps state intact, and the caller shows a separate error toast.
- **Safety callout**: green-bordered "safety backup will be created first" callout to reassure the user.
- **Backup info card**: shows the backup name + creation date so the user verifies they're restoring the right one.

### Backend response shape

`POST /api/backups/:id/restore` returns on success:
```json
{
  "success": true,
  "auto_backup_id": "uuid-of-pre-restore",
  "auto_backup_name": "PreRestore_2024-...",
  "message": "Database restored successfully. ..."
}
```

The `auto_backup_*` fields are surfaced in the success toast so the user can find the rollback backup by name in the list.

**Error response (destructive step failed AFTER safety backup was created)** — the route at [`server/routes/backups.ts`](./server/routes/backups.ts) catches the thrown error and forwards the pre-restore identity in the response body:
```json
{
  "error": "unexpected end of file. Your current data is preserved in pre-restore backup \"PreRestore_2024-...\".",
  "auto_backup_id": "uuid-of-pre-restore",
  "auto_backup_name": "PreRestore_2024-..."
}
```
The error message always includes the pre-restore name when the safety backup was created. The client reads `err.auto_backup_name` from the response and shows it in the error toast: *"Your current data is preserved in pre-restore backup X. Use it to roll back."*

### Restore failure coverage (decompress + replace in one try/catch)

The full destructive path in [`server/lib/local-backup.ts`](./server/lib/local-backup.ts) `restoreLocalBackup` is wrapped in a single try/catch so any failure (corrupt gzip file, bad SQL in pg_dump, locked DB file, missing prisma adapter, etc.) is attributed to the pre-restore safety backup. The wrapped error carries `autoBackupId` + `autoBackupName` properties that the route forwards to the client.

### Restore in-flight lock (UI)

[`src/components/views/BackupsView.tsx`](./src/components/views/BackupsView.tsx) tracks a `restoreInProgress: boolean` state that:
- Disables the restore button on **every row** while a restore is running (Lock icon + "Restore already in progress..." tooltip)
- Gates `openRestoreDialog` so a second click on a different row's restore button is a no-op while the first dialog is still up
- Cleared in the `finally` block of `performRestore` — regardless of success/failure

This prevents two restores from racing (which would create two pre-restore backups and the second destructive replace would clobber the first).

### Auto-refresh + badge label after restore

`BackupsView` calls `void fetchBackups()` in the `finally` of `performRestore` so the list shows the new pre-restore entry (or updated status) without a manual page refresh. The `Processing` status badge differentiates pre-restore entries: `name.startsWith('PreRestore_')` shows **"Creating safety backup"** instead of the generic **"Processing"** — so the user understands why a new entry appeared after clicking Restore.

### Bug Fix: Backup Status Becomes "Pending" After Restore

- **Bug**: After restoring a `Completed` backup, its status changed to `Pending` in the list.
- **Root cause**: The restore process replaces the entire database with the backup snapshot. In that snapshot, the backup record's `status` was still `pending` (initial state before the async backup process set it to `completed`). After `fetchBackups()` re-queried the restored database, the stale `pending` status was displayed.
- **Fix** ([`server/lib/local-backup.ts`](./server/lib/local-backup.ts) `restoreLocalBackup`): Added optional `originalBackupId` parameter. After the database is replaced and Prisma reconnects, the function runs `prisma.backup.update({ where: { id: originalBackupId }, data: { status: "completed" } })` to restore the correct status.
- **Wiring** ([`server/routes/backups.ts`](./server/routes/backups.ts)): The route handler now passes `id` (the backup being restored) as `originalBackupId` to `restoreLocalBackup`.
- **Graceful fallback**: If the backup record doesn't exist in the restored database (e.g. it was created after the backup snapshot), the update fails silently with a `logger.warn`.

## Absolute File Path Storage (Local Backups)

- `Backup.file_path` stores the **absolute filesystem path** of the gzipped backup (not relative). Set at backup creation time in [`server/lib/local-backup.ts`](./server/lib/local-backup.ts) `createLocalBackup()`.
- **Why absolute (not relative)**: enables `revealItemInDir()` to work correctly even after the user changes their backup folder setting. The file's location at creation time is "frozen" in the DB.
- `getBackupFilePath()` is now a passthrough (kept async for API stability) — it just returns the stored path directly.
- The download endpoint still uses this path to stream the file. For cloud mode (R2), `file_path` is the S3 key (unchanged).

## Custom Backup Folder (Per-User)

- **Schema**: `UserPreference` model added to all 3 Prisma schemas (Supabase, PG local, SQLite) and to [`supabase_schema.sql`](./supabase_schema.sql) (with RLS policies: SELECT/INSERT/UPDATE/DELETE scoped to `auth.uid() = user_id`). One-to-one with `User` (`userId @unique`). Stores `backupFolder String? @map("backup_folder")`. Auto-pushed to local SQLite via `npm run db:push:sqlite` (or `db:push:pg:local` for local PG). Supabase migrations need a manual run of `supabase_schema.sql`.
- **Local-only field**: `backupFolder` is only meaningful in local modes (desktop SQLite / local PG) where backups are written to a user-controlled local filesystem path. In **Supabase mode**, backups go through a GitHub Action → Cloudflare R2, so the field is ignored. The application:
  - API `GET /settings/folder` returns `supports_local_folder: false` + null paths in cloud mode → UI hides the entire "Storage location" panel.
  - API `PUT /settings/folder` returns 403 in cloud mode (defense in depth — UI already hides the panel).
  - Prisma schema comment `// Container for per-user settings. The backup_folder field is only used in local modes...` in `supabase_schema.sql:295-298` documents the intent.
- **Server resolver** ([`server/lib/local-backup.ts`](./server/lib/local-backup.ts)):
  - `getDefaultBackupDir()` — OS-aware: macOS/Linux → `${os.homedir()}/ERD Builder Pro`, Windows → `${os.homedir()}/Documents/ERD Builder Pro`.
  - `getBackupDirForUser(userId)` — reads `UserPreference.backupFolder`. If set: resolves absolute path (relative → `${homedir()}/<path>`). If null → returns `getDefaultBackupDir()`.
  - `ensureBackupDir(dir)` — recursive `mkdir` if missing.
  - `createLocalBackup(backupId, userId)` — now returns `{ filePath, fileSize, fullPath }`. Stored `filePath` is the **absolute filesystem path** (not relative) — see **Absolute File Path Storage (Local Backups)** above. This is what enables `revealItemInDir()` in Tauri even after the user changes their backup folder setting.
  - `getBackupFilePath(relativePath, userId)` — async (now takes `userId`).
- **API** ([`server/routes/backups.ts`](./server/routes/backups.ts)):
  - `GET /api/backups/settings/folder` → `{ supportsLocalFolder, customFolder, defaultFolder, effectiveFolder }`. `supportsLocalFolder: false` in cloud mode (skips prisma lookup entirely). In local mode, all three paths returned so the client can show the active path, the OS default, and whether a custom value is in effect.
  - `PUT /api/backups/settings/folder` body `{ folder: string | null }` (null = reset). Returns 403 in cloud mode. Validates: shell metacharacter blacklist (`` ` $ \ ; < > | & ``), `ensureBackupDir` probe to confirm writability, upserts `UserPreference` row.
- **UI** ([`src/components/views/BackupsView.tsx`](./src/components/views/BackupsView.tsx)):
  - "Storage location" panel between header and table, **conditionally rendered** with `{folderSettings?.supports_local_folder && (...)}` — invisible to Supabase users.
  - When visible: `Folder` icon, full path in monospace font, `Custom` amber badge when `customFolder` is set.
  - `Change` button → input field with Enter to save / Escape to cancel. `Reset` button (only when custom) → puts back to OS default.
  - **Native folder picker (Tauri only)**: `Browse` button (`FolderOpen` icon) next to the input opens the OS-native folder picker via `@tauri-apps/plugin-dialog`'s `open({ directory: true })`. Hidden on web (browsers don't expose a native folder picker). Pre-fills `defaultPath` with the current `effectiveFolder` so the dialog opens at the right place.
  - Toast description in download now uses `effectiveFolder` instead of the OS Downloads dir. Web fallback message preserved if `effectiveFolder` is somehow null.
- **Important security note**: the path is stored server-side and used for both writing backups and serving downloads. The user can put it anywhere the server process has write+read access to (e.g., a USB drive, NAS mount, etc.). Server doesn't restrict the path scope — that's intentional for desktop use.

## Tauri Dialog Plugin (Native Folder/File Picker)

- **Plugin setup** (4 places, all required):
  1. **Rust crate** ([`src-tauri/Cargo.toml`](./src-tauri/Cargo.toml)): `tauri-plugin-dialog = "2"` in `[dependencies]`.
  2. **Plugin registration** ([`src-tauri/src/lib.rs`](./src-tauri/src/lib.rs)): `.plugin(tauri_plugin_dialog::init())` in `tauri::Builder::default()` chain.
  3. **NPM package** ([`package.json`](./package.json)): `@tauri-apps/plugin-dialog` (`^2.7.1`).
  4. **Capability** ([`src-tauri/capabilities/default.json`](./src-tauri/capabilities/default.json)): `"dialog:default"` in `permissions` array.
- **Usage**:
  ```ts
  import { open as openDialog } from '@tauri-apps/plugin-dialog';
  const selected = await openDialog({
    directory: true,
    multiple: false,
    title: 'Select backup folder',
    defaultPath: '/current/path',  // optional initial directory
  });
  // selected: string | null
  ```
- **Tauri detection gate**: only show Browse button when `!!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__)`. Web users get only the text input as fallback.
- **Defaults included**: `dialog:default` grants `allow-open`, `allow-save`, `allow-message`, `allow-ask`, `allow-confirm`. No need to enumerate individual permissions unless locking down further.

## Global vs Item Loading State Fix (Infinite Spinner)

- **Bug**: `isLoading` from `WorkspaceContext` is an aggregate of all background fetches (`isProjectsLoading || isDiagramsLoading || ...`). Binding the main canvas overlay spinner to this global state caused the spinner to hang indefinitely if any single background request (like fetching projects during a tab reload) got stuck or delayed.
- **Fix**: Replaced `isLoading={isLoading}` with specific item loading states (`isERDItemLoading`, `isFlowchartItemLoading`, `isNoteItemLoading`, `isDrawingItemLoading`) across `DiagramEditorRoute`, `FlowchartEditorRoute`, `NoteEditorRoute`, and `DrawingEditorRoute`. The canvas overlay spinner now correctly triggers ONLY when the specific document is actively loading.

## ERD AI Action "Merge Selected" Save Fix

- **Bug**: Clicking "Merge Selected" on the ERD AI Schema Proposal diff bar updated the local React Flow state (`setNodes`, `setEdges`) but did NOT trigger `useAutoSave` because `saveCounter` wasn't bumped. As a result, changes weren't persisted to the database.
- **Fix**: Added an explicit `saveDiagram(finalNodes, finalEdges, getViewport())` call inside `handleApplyMerge` in `ERDView.tsx` followed by `triggerDebouncedSync()`. 
- **Detail**: To capture the current pan/zoom state for `saveDiagram`, `useReactFlow()` was added to `ERDViewComponent`. This is possible because `main.tsx` wraps the entire app in `<ReactFlowProvider>`.
- **Column Changes Persistence Bug**: When merging proposed schema changes, the database save did not persist column changes (added/removed columns or type changes). This was caused by the `pending_update_erd_ddl` effect in `ERDView.tsx` calling `applyToErdContent` with empty arrays (`[], []`) instead of `(nodesRef.current, edgesRef.current)`. As a result, new random IDs were generated for the proposed tables and columns, causing an ID mismatch during the merge and reverting the changes.
- **Column Persistence Fix**: Changed `applyToErdContent` calls in the DDL create and update effects in `ERDView.tsx` to pass `nodesRef.current` and `edgesRef.current`. This ensures that original table and column IDs are correctly matched and merged, and then properly saved to the database.
- **Read-Only / Lock Canvas Interactions Mid-Merge**: Double-clicking table headers during active schema diff mode opened the `TableDialog` (properties modal) which allowed making manual column/table modifications. Since the merge operation (`handleApplyMerge`) overrides active canvas state with the merged proposal snapshot, any manual changes made mid-merge would be silently overwritten/lost.
- **Lock Implementation**: 
  - In `ERDView.tsx`, when `pendingDiff` is active, nodes are mapped to set `data.isDiffMode = true`.
  - In `EntityNode.tsx`, `useWorkspace()` context is imported to check `isPublicView`. Combined with `data.isDiffMode`, we define `isReadOnly = isPublicView || !!data.isDiffMode`.
  - If `isReadOnly` is active, double-click handler `onDoubleClick` is set to `undefined`, edit/delete click handlers return early, and the `DropdownMenu` trigger button (three-dots) is completely hidden. This completely blocks manual edits during diff review.

## TypeScript Cleanup — `@ts-ignore`, `substr()`, and `as any`

### `@ts-ignore` eliminated (10 files, 11 occurrences)

All `@ts-ignore` comments removed and replaced with proper type-safe alternatives:

- **5 data hooks** (`useDiagrams`, `useNotes`, `useFlowcharts`, `useDrawings`, `useProjects`): `type: 'erd'`/`'notes'`/etc. pattern — object type annotation changed from `const x: Interface = { ... }` with separate `x.type = '...'` to single initializer `{ ..., type: '...' } as Interface & { type: string }`. This avoids mutating after creation and eliminates the `@ts-ignore`.
- **`useERDSession.ts`**: `window.currentSyncIsSilent` → `(window as any).currentSyncIsSilent` (type-safe window global access).
- **`Login.tsx`**: `onGuestLogin?.()` — `@ts-ignore` was unnecessary; TS handles optional chaining correctly.
- **`LucideIconExtension.tsx`**, **`SlashMenu.tsx` (2x)**: `LucideIcons[name]` → `(LucideIcons as Record<string, any>)[name]` for dynamic icon lookup.
- **`note-importer.ts`**: `await import('marked')).marked` — removed `@ts-ignore`, dynamic import resolves correctly.

### `substr()` eliminated (12 calls across 7 files)

All `String.prototype.substr()` (deprecated) replaced with `substring()`:
- `substr(2, 9)` → `substring(2, 11)` (9-char random IDs)
- `substr(2, 6)` → `substring(2, 8)` (6-char group IDs)
- Files: `useDiagrams.ts`, `useProjects.ts`, `useERDSession.ts`, `sqlParser.ts`, `SQLImportForm.tsx`, `PropertiesPanel.tsx`, `FlowchartView.tsx`

### `as any` audit

- **25 `as any` casts across 15 files** replaced with precise types (`as const`, `Record<string, any>`, intersection types, proper function overloads).
- **13 remaining** are true exceptions: 9 window globals (mammoth, JSZip, htmlDocx, marked), 2 window flags (`currentSyncIsSilent`), 1 legacy enum migration (`deleteDraft('diagram')`), 1 library-imposed (Tiptap tippyOptions).

## ERD Export All Dialog

**File**: [`src/components/modals/ExportAllDialog.tsx`](./src/components/modals/ExportAllDialog.tsx)

Unified dialog for all ERD export (schema + visual). Replaces submenu Export in `NavActionsMenu` (previously 3 callbacks: `onExportSQL`, `onExportPDF`, `onExportImage`) with a single `onExportAll` callback.

**Format tabs**:
- **Schema group**: MySQL, PostgreSQL, Laravel Migration, Laravel Model, TypeScript, Prisma, Zod — generated via `src/lib/sql-generator-all.ts` (bulk generation from `src/lib/sql-generator.ts` per-entity functions)
- **Visual group**: PDF, SVG — with `Experimental` badge (`FlaskConical` icon + amber styling)

**CodeMirror viewer**: Schema tabs use `@uiw/react-codemirror` read-only editor with `oneDark` theme (matching Import SQL dialog). Installed `@codemirror/lang-javascript` and `@codemirror/lang-php` for TypeScript/Zod/Prisma and Laravel tabs respectively.

**Per-file .zip export** (non-SQL formats): Laravel Migration, Laravel Model, TypeScript, Prisma, Zod generate one file per table, downloaded as `.zip` via `jszip`. File structure:
- `migrations/create_{table}_table.php`
- `models/{Model}.php`
- `{Model}.ts`
- `schema.prisma` (single file, all tables)

SQL formats (MySQL, PostgreSQL) remain single `.sql` file download.

**Copy button behavior**: Enabled only for SQL tabs (MySQL, PostgreSQL). Disabled (`opacity-30 cursor-not-allowed`) for per-file format tabs (Laravel, TypeScript, Prisma, Zod) — each format generates multiple files, making clipboard copy meaningless.

**Bulk generator** ([`src/lib/sql-generator-all.ts`](./src/lib/sql-generator-all.ts)):
- `generateAllTablesFiles(format, nodes, edges)` — returns `ExportFile[]` per table (name + content). Used by .zip export via `jszip`.
- `generateAllTablesCode(format, nodes, edges, fileName)` — returns single concatenated string. Used by CodeMirror display for SQL formats.
- `buildEntityFkMap(entities, edges)` — extracts FK relationships from edges, returns `Map<string, {col, refTable, refCol}[]>`. Used by both `generateAlterTableFKs()` (SQL) and `generateLaravelMigration()` inline FK constraints.
- `getExtension(format)` — file extension per format.
- Filenames use singularized PascalCase matching generated code (e.g. `User.php`, `User.ts`). Migration filenames keep plural per Laravel convention (`create_users_table.php`).

**Generator best-practice fixes**:
- `generateLaravelMigration`: `$table->enum()` → `$table->string()` (Laravel 11+ removed `enum` support). FK constraints now generated inline via `$table->foreign()->references()->on()` using `buildEntityFkMap()`.
- `generateLaravelModel`: adds `protected $table = '{table}'` when singularized model name differs from table name (e.g. `User` vs `users`) — prevents Eloquent pluralization mismatch.
- `generateTypeScript`: `created_at`/`updated_at` no longer hardcoded — only appended if absent from entity columns.
- `generatePrisma`: timestamp fields no longer hardcoded — same conditional append.
- `generateZod`: `z.string()` → `z.string().uuid()` for UUID types, `z.string().datetime()` for datetime/timestamp, `z.string().date()` for date, `z.record(z.unknown())` for json. Schema variable name uses singular camelCase (`userSchema`), filename `UserSchema.ts`.
- `toPascalCase(name, shouldSingularize?)` exported from `sql-generator.ts` — supports `shouldSingularize` parameter. Used by `sql-generator-all.ts` for filename generation.

**Key behaviors**:
- Visual tabs: description + `Generate PDF/SVG` button that calls `onExportPDF`/`onExportImage` callback (from `useImageExporter.ts`)
- Dialog only appears for `view === 'erd'` (guard in `AppLayout.tsx`)
- `NavActionsMenu` ERD Export submenu replaced with a single "Export All" item → `onExportAll` → `setIsExportAllOpen(true)`

**File changes**:
- **NEW** [`src/components/modals/ExportAllDialog.tsx`](./src/components/modals/ExportAllDialog.tsx) — dialog component
- **NEW** [`src/lib/sql-generator-all.ts`](./src/lib/sql-generator-all.ts) — bulk schema generation, per-file export, FK extraction
- **MODIFIED** [`src/lib/sql-generator.ts`](./src/lib/sql-generator.ts) — `generateLaravelMigration`: `z.string()` → `z.string().uuid()` for UUID types, `z.string().datetime()` for datetime/timestamp, `z.string().date()` for date, `z.record(z.unknown())` for json. Schema variable name uses singular camelCase (`userSchema`), filename `UserSchema.ts`.
- **MODIFIED** [`src/components/NavActionsMenu.tsx`](./src/components/NavActionsMenu.tsx) — `onExportAll` prop + single menu item
- **MODIFIED** [`src/components/MainHeader.tsx`](./src/components/MainHeader.tsx) — `onExportAll` prop pass-through
- **MODIFIED** [`src/routes/AppLayout.tsx`](./src/routes/AppLayout.tsx) — `isExportAllOpen` state + `ExportAllDialog` render

## Import SQL Moved to ERD Toolbar

- `onImportSQL` prop added to `ERDView` — triggers `handleOpenImportModal` from `DiagramEditorRoute`
- Import SQL button (Upload icon) rendered in floating toolbar next to Add Table button — visible only on ERD view
- Removed from `NavActionsMenu`, `MainHeader`, `AppLayout` prop chain
- **Files**: [`src/components/views/ERDView.tsx`](./src/components/views/ERDView.tsx), [`src/components/NavActionsMenu.tsx`](./src/components/NavActionsMenu.tsx), [`src/components/MainHeader.tsx`](./src/components/MainHeader.tsx), [`src/routes/AppLayout.tsx`](./src/routes/AppLayout.tsx), [`src/routes/DiagramEditorRoute.tsx`](./src/routes/DiagramEditorRoute.tsx)

## SQL Parser: `cleanIdentifier()` Lowercase Fix

- **Bug**: SQL keyword `action` used as column name (`ALTER TABLE users ADD COLUMN action VARCHAR(50)`) — lexer tokenized `action` as `KEYWORD` (uppercased `ACTION`), column name stored as `ACTION` instead of `action`. When AI-generated SQL referencing `action` arrived, parser couldn't match columns by name (`ACTION` ≠ `action`).
- **Fix**: `cleanIdentifier()` in [`src/lib/sqlParser.ts`](./src/lib/sqlParser.ts) now lowercases output. Safe because unquoted SQL identifiers are case-insensitive; quoted identifiers (`"Users"`) have quotes stripped by the same function.
- **Files**: `sqlParser.ts:9`

## SQL Parser: `BIGSERIAL` → `BIGINT` Normalize Fix

- **Bug**: `normalizeType()` in [`src/lib/sqlParser.ts`](./src/lib/sqlParser.ts) mapped `BIGSERIAL`, `SERIAL`, and `SMALLSERIAL` all to `INT`. This caused FK type mismatch when AI generated `id BIGSERIAL` (parsed as `INT`) referencing `assigned_to_id BIGINT` — ERD type validation rejected the connection.
- **Fix** ([`src/lib/sqlParser.ts`](./src/lib/sqlParser.ts):30-32): Split into individual mappings — `SERIAL → INT`, `BIGSERIAL → BIGINT`, `SMALLSERIAL → SMALLINT`. Same fix applied to `erdActions.ts:388` (`applyToErdContent` normalizer).
- **Files**: `sqlParser.ts:30-32`, `erdActions.ts:388-390`

## EntityNode Double-Click Tooltip

- Added `title="Double-click to edit table"` on ERD table header div in [`src/components/EntityNode.tsx`](./src/components/EntityNode.tsx)
- Hidden when `isReadOnly` (shared/public view or diff mode)
- Helps users discover the table editing flow without hunting through context menus

## Security Hardening

**Packages added**: `express-rate-limit`, `helmet`, `zod`

### Phase 1 — Critical + High Fixes

- **CORS restricted** (`server/index.ts:31-33`): `origin: true` replaced with explicit allowlist via `CORS_ORIGINS` env var (comma-separated). Production uses the allowlist; development keeps `origin: true`.
- **Rate limiting** (`server/index.ts:36-68`): 4 rate limiters — global (200 req/min), auth (10 req/min), AI proxy (30 req/min), upload (20 req/min). All use `express-rate-limit` with standard headers.
- **Trash endpoint scoped** (`server/routes/common.ts:26-33`): `GET /api/trash` now filters by `user_id = (req as any).user.id` — previously returned ALL users' deleted items.
- **`GEMINI_API_KEY` removed from client bundle** (`vite.config.ts:12`): was embedded via Vite `define` but never used in frontend code — pure secret leak.
- **Upload DELETE ownership check** (`server/routes/common.ts:113-133`): key must start with `erd-builder-pro/` prefix. Multer limits: 10MB max, allowed MIME types (JPEG, PNG, GIF, WebP, SVG, PDF). Multer error handler catches size/type violations.
- **AI proxy**: kept unauthenticated (guest mode has no session cookie) — abuse mitigated by 30 req/min rate limiter.

### Phase 2 — Medium Fixes

- **Public route owner bypass fixed** (`diagrams.ts:89-96`, `notes.ts:93-101`, `drawings.ts:93-100`, `flowcharts.ts:92-99`): `isOwner` now checks `user.id === document.user_id` — previously ANY authenticated user bypassed share_token.
- **Zod input validation** (`server/lib/validation.ts`): schemas for login, AI proxy, document CRUD, upload, delete. `validate()` middleware on critical endpoints: `POST /api/login`, `POST /api/ai/proxy`, `POST /api/diagrams`, `POST /api/notes`, `POST /api/drawings`, `POST /api/flowcharts`, `POST /api/upload`, `DELETE /api/upload`.
- **Helmet** (`server/index.ts:22`): `helmet()` middleware adds security headers (CSP, X-Frame-Options, X-Content-Type-Options, etc.).
- **Body limit reduced**: `express.json({ limit: "5mb" })` (was 50MB).
- **Logout cookie fixed** (`server/routes/auth.ts:82`): `sameSite: "lax"` (was inconsistent `"none"` when secure).

### Phase 3 — Low Fixes

- **Error message sanitization** (`server/lib/utils.ts`): `handleError()` no longer leaks `error.message` or `details` to client. Auth login returns generic "Invalid credentials". AI proxy logs provider errors server-side only. Upload/delete errors return generic messages.
- **CSP**: handled by `helmet()` middleware.

### Remaining (Manual)

- **Supabase RLS audit**: frontend `aiEntityContext/*.ts` files make direct Supabase queries bypassing server auth. Security depends entirely on RLS policies being correctly configured. Verify RLS on: `diagrams`, `notes`, `drawings`, `flowcharts`, `entities`, `columns`, `relationships`, `projects`, `ai_chat_sessions`, `ai_chat_messages`.

## Prisma camelCase → Snake_case Bridge (Middleware)

- **Problem**: After migrating all 11 server route files from `supabase.from()` to Prisma, the frontend stopped receiving ERD edges (relationships). PR in database but invisible on canvas.
- **Root cause**: Prisma uses `@map` directives to map camelCase model fields (`sourceEntityId`, `diagramId`) to snake_case DB columns (`source_entity_id`, `diagram_id`). When Prisma returns query results, the field names are camelCase — but the entire frontend codebase expects snake_case because the original Supabase API returned snake_case. The XYFlow edge builder looked for `edge.source_entity_id` which was `undefined`.
- **Same issue affects all models**: `Entity.diagramId`, `Column.isPk`/`isNullable`/`sortOrder`/`enumValues`, `Relationship.sourceEntityId`/`targetEntityId`/`sourceColumnId`/`targetColumnId`/`sourceHandle`/`targetHandle`, `Diagram.isDeleted`/`projectId`/`viewportX`, and all `createdAt`/`updatedAt` timestamps.
- **Fix** ([`server/index.ts`](./server/index.ts)): Added a response middleware that intercepts `res.json()` and recursively converts all object keys from camelCase to snake_case. The `camelToSnake` function:
  - Recursively traverses objects and arrays
  - Uses `.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase())` for key conversion
  - Preserves Dates, primitives, null/undefined as-is
  - Is transparent to route handlers (they use clean camelCase in Prisma queries)
  - Is transparent to frontend (continues receiving snake_case as before)
- **Auth routes unaffected**: Supabase user objects from `supabase.auth.getUser()` are already snake_case (`app_metadata`, `user_metadata`, `created_at`), so no spurious conversion occurs. Even if a key like `emailConfirmedAt` existed, converting to `email_confirmed_at` is equivalent (PostgreSQL convention).
- **Alternative considered**: Editing every route handler to map field names on each response was rejected — too many touch points. Changing the Prisma schema to use snake_case field names directly (removing all `@map`) would require renaming all fields in every Prisma query across 11 files.
- **Chosen approach**: Single middleware in `server/index.ts:110-127`. One function, zero changes to route handlers or frontend. All 15+ server route files continue using clean camelCase in Prisma queries.

## Security Hardening, Phase 4 — Audit Fixes

### Critical Fixes

| Issue | File | Fix |
|-------|------|-----|
| **C1. AI Chat ownership** | `ai-chat.ts` | All session endpoints (`GET /sessions/:uid`, `DELETE`, `PUT`, `GET /:uid/messages`, `POST /messages`) now add `userId: (req as any).user.id` to `where` clauses. Uses `findFirst` with `userId` instead of `findUnique` on `uid` alone. |
| **C2. API key leak** | `ai-chat.ts:174` | `/api/ai/chat/config` no longer returns `apiKey`. Proxy looks up key server-side from authenticated user's session. Response returns only `{ baseUrl, model }`. |
| **C3. AI proxy config** | `ai.ts:44-56` | Removed un-scoped `...(userId ? { userId } : {})` fallback that returned any user's config. Now: (a) if `apiKey` provided → BYOK mode; (b) if no `apiKey` → extracts `userId` from cookie/body → scopes config lookup to that user → rejects unauthenticated requests without API key. |
| **C4. Projects create** | `projects.ts:157` | Added `const userId = (req as any).user.id;` — was `ReferenceError` (variable never defined). |
| **C5. Project permanent delete** | `projects.ts:294` | Replaced `err.message` leak with `handleError()`. |

### High Severity Fixes

| Issue | File | Fix |
|-------|------|-----|
| **H4. err.message leaks** | 11 files, 17+ routes | All `res.status(500).json({ error: err.message })` replaced with `handleError(res, err, "Generic message")`. Only exception: `common.ts` multer file-filter error (user-facing message). |
| **H5. Drawing ownership** | `drawings.ts:178,198,214` | Added `userId` check on PUT/DELETE/RESTORE via `findFirst({ where: { uid, userId } })` before mutating. Permanent delete already correct. |
| **H6. Configs API key** | `ai-settings.ts:23,55` | `GET/POST /configs` now mask `apiKey` in responses (`'***'`). Key stays server-side for proxy lookup. |
| **H7. Prompt ownership** | `ai-settings.ts:138,167,179` | POST/DELETE/TOGGLE-DEFAULT now scope to `OR: [{ userId }, { userId: null }]` — users can only modify own prompts or system prompts. |
| **H11. projectId validation** | `ai-chat.ts:54,94` | `project_id` validated via `Number()` + `isNaN()` before `BigInt()`. Non-numeric returns 400. |

### Vercel Production Fixes

| Issue | File | Fix |
|-------|------|-----|
| **express-rate-limit crash** | `server/index.ts:28-29` | Added `app.set('trust proxy', 1)` — Vercel sets `X-Forwarded-For` but Express default `trust proxy: false` caused `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`. |
| **Prisma connection pool exhaustion** | `server/lib/prisma.ts` | Added `globalThis.__prisma` caching (reuse client across warm invocations) + `connection_limit=3` and `pgbouncer=true` in `DATABASE_URL` via `buildPrismaUrl()`. Prevents `(EMAXCONNSESSION) max clients reached in session mode - pool_size: 15` when multiple Vercel instances spin up. |
| **`.env` encryption** | — | `dotenvx`-encrypted `.env` not decrypted in serverless — Vercel env vars must be set manually in Project Settings. |

### Phase 4 Complete: Frontend Supabase Fully Removed

**All frontend Supabase direct calls have been migrated to `apiFetch` backend endpoints:**

| File | Old | New |
|------|-----|-----|
| `aiEntityContext/siblings.ts` | `supabase.from('notes/diagrams/...')` (5 queries) | `apiFetch('/api/projects/:id/siblings')` |
| `aiEntityContext/diagram.ts` | `supabase.from('diagrams/entities/columns/relationships')` | `apiFetch('/api/diagrams/:uid')` |
| `aiEntityContext/note.ts` | `supabase.from('notes')` | `apiFetch('/api/notes/:uid')` |
| `aiEntityContext/flowchart.ts` | `supabase.from('flowcharts')` | `apiFetch('/api/flowcharts/:uid')` |
| `aiEntityContext/drawing.ts` | `supabase.from('drawings')` | `apiFetch('/api/drawings/:uid')` |
| `AIChatPanel.tsx` | `supabase.from('notes/entities/columns')` | `apiFetch('/api/notes/:uid')` / `apiFetch('/api/diagrams/:uid')` |
| `useRealtimeSync.ts` | `supabase.channel()` Broadcast | Stubbed to no-op |

**Deleted**: `src/lib/supabase.ts` — no longer needed. `@supabase/supabase-js` dependency only used server-side.

**New endpoint**: `GET /api/projects/:id/siblings` at `server/routes/projects.ts:300` — returns `{ notes, diagrams (with entities+columns), flowcharts, drawings }` for a project. Used by `siblings.ts` and `buildSiblingContext`.

**Security note**: All entity context and mention data is now served through authenticated Express endpoints (same JWT auth), eliminating the RLS-dependency concern.

## Future Plans

### Full Migration: Supabase → Pure PostgreSQL

Replace all Supabase database dependencies with direct PostgreSQL (`pg`/`pg-pool`) while keeping Supabase Auth as the identity source.

**Scope**:
- **Auth**: keep Supabase Auth as the source of truth. Session JWTs are issued by Supabase and stored in an httpOnly cookie. No local admin credentials or custom JWT secret.
- **DB client**: `server/lib/config.ts` → `new Pool({ connectionString })`. All 16+ server route files: `supabase.from('x')` → `pg.query('SELECT ...')`.
- **RLS**: `auth.uid()` → `current_setting('app.user_id')::uuid` or application-layer filter in Express routes.
- **Frontend Supabase fully migrated to `apiFetch`** — `src/lib/supabase.ts` deleted. All frontend Supabase calls go through Express backend endpoints. `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` no longer needed.
- **Realtime** (`useRealtimeSync.ts`): optional — replace Supabase Realtime with `pg LISTEN/NOTIFY` + WebSocket relay, or keep Supabase Realtime as standalone service.
- **Edge config** (`server/lib/edge-config.ts`): keep only the minimal Supabase server credentials needed for edge helpers; no admin email/password or custom JWT secret.

**Migration steps**:
1. Setup `pg` pool + test connection
2. Migrate one route file (e.g. `notes.ts`) → test end-to-end
3. Batch the rest
4. Update foreign keys from `REFERENCES auth.users(id)` to application-owned foreign keys where needed
5. RLS rewrite (`auth.uid()` → `current_setting(...)`)
6. Testing + security audit
7. Realtime migration (optional)

**Risk**: changing the DB layer can still break auth-adjacent flows and FK assumptions, but Supabase-issued session tokens remain valid as long as the auth domain is unchanged.

**Estimated effort**: ~12-17 days.

### Role & Permission System (CASL)

Integrate CASL for unified permission enforcement across server middleware and client UI.

**Architecture**:
```
shared/
  abilities.ts          ← defineAbilityFor(user) — single source of truth
  types.ts              ← Subject + Action types

server/
  middleware/
    authorize.ts        ← ability.cannot() → 403

client/
  components/
    Can.tsx             ← <Can I="update" a="Note"> render children
  hooks/
    useAbility.ts       ← ability from context
```

**Tables needed** (in `public` schema):
- `roles` (id UUID, name TEXT, description TEXT)
- `role_permissions` (id UUID, role_id FK, action TEXT, subject TEXT, conditions JSONB)
- `user_roles` (user_id FK, role_id FK)

**CASL vs native decision**: Native Express middleware sufficient for server-only. CASL recommended because app needs **UI-side enforcement** (show/hide buttons, filter lists) — single ability definition syncs both layers. Also handles complex resource-level conditions (`user can update note if userId === note.author_id`).

**Implementation order** (post-migration):
1. Add `@casl/ability` + `@casl/react`
2. Create shared ability definitions
3. Apply to Express routes as middleware
4. Apply to React UI components (conditionals, <Can> filter)

## Performance Optimizations — Initial Load Speed

### Root Cause
Post-login spinner (5-8s) caused by:
1. **Projects endpoint eager-loads ALL children** (`server/routes/projects.ts:66-96`): `include` with `diagrams`, `notes` (with `content` column!), `drawings`, `flowcharts` for every project — returns MBs of unnecessary data
2. **Notes/Drawings/Diagrams list endpoints return ALL columns** — including `content` (rich text HTML), `data` (diagram JSON, drawing JSON)
3. **DashboardRoute full-page spinner**: waited for ALL 5 fetches (projects, notes, diagrams, drawings, flowcharts) to complete before rendering anything
4. **Duplicate pagination fetch**: `useTableViewPagination` fired a redundant fetch for the current view type on initial mount (dashboard route)

### Fixes Applied

#### Server-Side (Biggest Impact)
- **Projects endpoint** ([`server/routes/projects.ts`](./server/routes/projects.ts)): removed `include` that eager-loaded all children (diagrams, notes, drawings, flowcharts) per project. Now returns only project metadata. The frontend already gets children from individual fetches.
- **Notes list** ([`server/routes/notes.ts`](./server/routes/notes.ts)): added explicit `select` — `content` column excluded (was returning full rich text HTML for every note in list).
- **Diagrams list** ([`server/routes/diagrams.ts`](./server/routes/diagrams.ts)): added explicit `select` — `data` column excluded.
- **Drawings list** ([`server/routes/drawings.ts`](./server/routes/drawings.ts)): added explicit `select` — `data` column excluded.
- **Flowcharts list** ([`server/routes/flowcharts.ts`](./server/routes/flowcharts.ts)): narrowed `project` include to only `{ name, uid, id }` instead of all columns.
- All list endpoint `project` includes narrowed to `{ select: { name: true, uid: true, id: true } }` instead of `{ project: true }`.

#### Client-Side
- **DashboardRoute** ([`src/routes/DashboardRoute.tsx`](./src/routes/DashboardRoute.tsx)): removed full-page loading spinner on initial mount. Dashboard renders immediately — stat cards (0), recent docs (empty), workspace (empty) fill in progressively as data arrives.
- **useTableViewPagination** ([`src/hooks/useTableViewPagination.ts`](./src/hooks/useTableViewPagination.ts)): added `isTableView` guard (`pathname.startsWith('/table/')`) — pagination fetches now only fire on actual table routes, not on dashboard or editor routes. Eliminates redundant duplicate fetch on initial mount.
````
This is the description of what the code block changes:
<changeDescription>
Add desktop build configuration section at end of AGENTS.md
</changeDescription>

This is the code block that represents the suggested code change:
````markdown
## Desktop Build Configuration (Tauri DMG)

### Architecture

The desktop app (Tauri v2) bundles three components:
1. **Frontend** — React + Vite → `dist/` (static HTML/JS/CSS)
2. **Backend** — Express.js + Prisma → `dist-server/index.js` (bundled via esbuild)
3. **Native dependencies** — `better-sqlite3`, `@prisma/client`, `@prisma/adapter-better-sqlite3`, Prisma engine → `dist-server/node_modules/`

### Build Pipeline

**Trigger**: `npm run build:desktop` (called from `tauri.conf.json` `beforeBuildCommand`)

**Script**: [`scripts/build-server.js`](./scripts/build-server.js)
1. Bundles `server/run.ts` + all imports via esbuild → `dist-server/index.js`
2. Externalizes native modules (better-sqlite3, @prisma/*, prisma)
3. Copies runtime node_modules to `dist-server/node_modules/`:
   - `.prisma/client/` (Prisma generated client + engine binaries)
   - `@prisma/` (adapter packages + client runtime)
   - `better-sqlite3/` (SQLite native addon)
   - Optionally `pg/` + `@prisma/adapter-pg/` (PostgreSQL — kept for local PG mode)
4. Copies `prisma/schema.sqlite.prisma` → `dist-server/prisma/schema.prisma`
5. Generates `prisma-client-index.js` shim for Prisma client resolution

### CRITICAL: Native Modules are Architecture-Specific

- `better-sqlite3` compiles a `.node` native addon during `npm install` — **this binary is architecture-specific** (ARM64 vs x86_64).
- Prisma 7 with driver adapters uses **WASM engine files** which are architecture-independent — no native Prisma engine binary is needed at runtime.
- **CI approach**: Both macOS DMGs are built **sequentially on `macos-latest` (ARM64) runner**:
  1. `npx tauri build` → ARM64 DMG (native, uses ARM64 better-sqlite3)
  2. `npm_config_arch=x64 npm rebuild better-sqlite3` → recompile for x86_64
  3. `npx tauri build --target x86_64-apple-darwin` → x86_64 DMG (cross-compiled, uses x86_64 better-sqlite3)
- `macos-13` (Intel) runner is avoided due to high demand / long queue times.
- See [`.github/workflows/build.yml`](./.github/workflows/build.yml) for the sequential build steps.
- See [`.github/workflows/build.yml`](./.github/workflows/build.yml) for the matrix-based build strategy.

### Tauri Config

**File**: [`src-tauri/tauri.conf.json`](./src-tauri/tauri.conf.json)
- `beforeBuildCommand`: `"npm run build:desktop"` — runs esbuild bundler + Prisma generate + Vite
- `bundle.resources`: `["dist-server/**"]` — includes the bundled server in the .app bundle
- Server is launched at runtime via `std::process::Command::new("node")`

### Rust Backend (Server Launch)

**File**: [`src-tauri/src/lib.rs`](./src-tauri/src/lib.rs)

On app startup (release mode only), `start_backend_server()` performs **6 logged steps**:

**Step 1 — Locate Node.js**: `find_node_executable()` probes paths.

**Step 2 — Inspect version**: Logs `node -v` and `process.versions.modules` (NODE_MODULE_VERSION aka ABI).

**Step 3 — Native module ABI rebuild**: The bundled `better-sqlite3` native addon was compiled on the CI runner (GitHub Actions). If the user's Node.js version differs, `better_sqlite3.node` fails with `NODE_MODULE_VERSION X vs Y`. The app detects this mismatch and auto-rebuilds:
- Tries `require()` on the `.node` file — if it throws, logs `require_failed` (chicken-and-egg: can't read ABI without loading, can't load due to ABI mismatch)
- Copies `better-sqlite3/` from the read-only app bundle to writable `{app_cache_dir}/rebuilt-node-modules/node_modules/` (uses cache dir **without spaces** — `~/Library/Caches/...` instead of `~/Library/Application Support/...` because `node-gyp` Makefiles break on spaces in paths)
- Runs `npm rebuild better-sqlite3` in that directory — **CRITICAL**: sets `PATH` env var (node's parent dir + `/usr/bin:/bin`) and `npm_config_node_execpath` because Finder/Dock spawns with minimal PATH, causing `npm` to fail with exit 127 (`env: node: No such file or directory`)
- Verifies the rebuilt addon's ABI matches the user's Node version (via `require().versions?.modules`)
- Prepends the rebuilt path to `NODE_PATH` so Node resolves it before the bundled copy

**Step 4 — Log pipes**: Opens `server.log` for stdout/stderr capture.

**Step 5 — Offline migration**: Runs `migrate-db.mjs` if `data.db` is new or empty (applies `schema.sql` via better-sqlite3).

**Step 6 — Spawn Express server**: Child process with `NODE_PATH`, `DATABASE_URL=file:{data_dir}/data.db`, `PORT=3099`.

**Logging**: Every step writes timestamped entries to `server-startup.log` in the app log directory (`~/Library/Logs/com.erdbuilderpro.app/` on macOS). This file survives across launches (appended, never truncated) so users can diagnose startup issues. The separate `server.log` captures the Node.js server's own stdout/stderr.

**Dependencies**: `chrono = "0.4"` added to `Cargo.toml` for timestamp formatting in startup logs.

The server auto-creates the SQLite database on first Prisma query.

### Node.js Discovery

**`find_node_executable()`** in [`src-tauri/src/lib.rs`](./src-tauri/src/lib.rs) probes these paths (in order):
1. `/opt/homebrew/bin/node` — Apple Silicon Homebrew
2. `/usr/local/bin/node` — Intel Homebrew / official installer
3. `/usr/bin/node` — System install (rare)
4. `/opt/local/bin/node` — MacPorts
5. `~/.nvm/versions/node/current/bin/node` — nvm (via symlink)
6. `~/.fnm/current/bin/node` — fnm
7. `~/.volta/bin/node` — Volta
8. `~/.nvm/versions/node/*/bin/node` — nvm (glob fallback, latest version)
9. `which node` — PATH lookup (only works in dev mode with shell PATH)

If none found: server doesn't start, error logged to `server-start-error.log`.

### Database Location

- **Development**: `DATABASE_URL=file:./data.db` — in project root
- **Production (Tauri DMG)**: `~/Library/Application Support/com.erdbuilderpro.app/data.db` (auto-resolved by `app.path().app_data_dir()`)
- The first Prisma query (`prisma.$connect()`) auto-creates the `data.db` file using better-sqlite3

### GitHub Actions Build Strategy

**File**: [`.github/workflows/build.yml`](./.github/workflows/build.yml)

All platforms are built using a `matrix.include` strategy. macOS handles both architectures **sequentially on a single `macos-latest` (ARM64) runner**:

```yaml
strategy:
  matrix:
    include:
      - os: ubuntu-latest
        platform: linux
      - os: windows-latest
        platform: windows
      - os: macos-latest
        platform: macos
```

Build steps on `macos-latest`:
1. **ARM64 DMG** — `npx tauri build` (native, uses ARM64 better-sqlite3)
2. **Rebuild for x86_64** — `npm_config_arch=x64 npm rebuild better-sqlite3` (recompiles native addon for Intel)
3. **x86_64 DMG** — `npx tauri build --target x86_64-apple-darwin` (cross-compiled Rust + x86_64 better-sqlite3)

**Why sequential on one runner instead of `macos-13`**:
- `macos-13` (Intel) runners have very limited availability → queue times can exceed 30min
- Sequential builds add ~25min total but start immediately (no queue)
- `npm_config_arch=x64` triggers node-gyp to recompile `better-sqlite3` for the target architecture before cross-compilation

### Key Files

| File | Purpose |
|------|---------|
| [`scripts/build-server.js`](./scripts/build-server.js) | esbuild server bundler + native module copier |
| [`src-tauri/tauri.conf.json`](./src-tauri/tauri.conf.json) | Tauri build config: beforeBuildCommand, resources |
| [`src-tauri/src/lib.rs`](./src-tauri/src/lib.rs) | Rust entry: 6-step startup with ABI rebuild, spawns Node.js, logs to server-startup.log |
| [`package.json`](./package.json) | Scripts: `build:server`, `build:desktop`, `dev:tauri` |
| [`.github/workflows/build.yml`](./.github/workflows/build.yml) | CI/CD: matrix builds, artifact upload, release |

### Build & Release Commands

```bash
# Development (hot-reload)
npm run dev:tauri

# Production build (DMG)
npx tauri build                # runs beforeBuildCommand → build:desktop automatically

# CI release (GitHub Actions)
git tag v2.x.x
git push origin v2.x.x          # triggers Build & Release workflow
```

### Important Notes

- **`node` must be available on user's machine**: The bundled app spawns `node` at runtime. If Node.js isn't installed, the server won't start. Future improvement: compile server with `pkg` or `nexe` into a standalone binary.
- **`npm_config_arch=x64`**: environment variable that makes `node-gyp` (used by `better-sqlite3`) compile for x86_64 architecture even on ARM64 hardware. Applied via `npm rebuild better-sqlite3` on the CI runner.
- **Cross-compilation works for Rust** (`--target x86_64-apple-darwin`) but NOT for native Node addons — those must be rebuilt separately.
- **`macos-13` runner is avoided** due to consistently long queue times. Both architectures are built sequentially on `macos-latest`.
- **esbuild NOT in package.json**: `build-server.js` calls `require('esbuild')` — if esbuild is not installed, use `npx esbuild` or install via `npm install -D esbuild`.
- **Supports both Apple Silicon and Intel from a single release**: The sequential build produces both `_aarch64.dmg` and `_x86_64.dmg`, plus a `latest.json` for Tauri's built-in updater.

### Prisma 7 CLI `db push` — `--url` flag required

- **Symptom**: First launch of the bundled DMG hangs at "Preparing…" forever; `~/Library/Logs/com.erdbuilderpro.app/server.log` shows:
  ```
  Prisma schema loaded from ../../../../../Applications/ERD Builder Pro.app/Contents/Resources/dist-server/prisma/schema.prisma.
  Error: The datasource.url property is required in your Prisma config file when using prisma db push.
  ```
- **Root cause**: Prisma 7 removed `datasource.url` from `schema.prisma` files. The CLI now requires either a `prisma.config.ts` (with `datasource.url`) or an explicit `--url` flag. The Rust spawn sets `DATABASE_URL` env var, but Prisma 7's CLI does NOT read it from env — it only reads from the config file or the `--url` flag.
- **Fix** ([`src-tauri/src/lib.rs`](./src-tauri/src/lib.rs)): added `.arg("--url")` + `.arg(format!("file:{}", db_path.display()))` to the `prisma db push` invocation. No `prisma.config.ts` bundling needed (which would require `dotenv` + transpilation overhead).
- **Why not bundle a `prisma.config.js`**: a config file would need absolute paths (since `cwd` = app data dir, not project root) and would be re-loaded on every CLI call. The `--url` flag is the simplest, most portable solution.
- **Symptom 2 — `Loaded Prisma config from prisma.config.ts.` message**: harmless. Prisma 7 looks for `prisma.config.{ts,js,mjs}` in `cwd`; when not found, it falls back to `--url` / env. The error appears only when NEITHER config URL NOR `--url` is provided.

## Desktop Database Initialization (Fallback Chain)

### Problem: Authentication Failed on First Launch

- **Symptom**: Production .dmg app shows login form, but `admin@local.dev` / `admin123` returns "Authentication failed" (HTTP 500).
- **Root cause**: The offline migration (`migrate-db.mjs`) uses better-sqlite3 directly to apply `schema.sql`. If the migration script fails (e.g., native addon load failure, schema file missing, SQL error), the database has NO tables. When the user clicks Login, `prisma.user.findFirst()` throws "no such table: users" which is caught by the generic catch block in `auth.ts` → "Authentication failed".
- **The error message is misleading**: it could be DB tables missing (500) OR wrong credentials (401). The real error goes to `server.log`, not the UI.

### Fix: Two-Layer Defense

**Layer 1: `ensureDatabaseTables()` in `server/run.ts`** ([`server/run.ts`](./server/run.ts)):
- Runs at server startup BEFORE `backfillUids()`
- Probes `SELECT 1 FROM users LIMIT 1` via Prisma raw query
- If table doesn't exist: reads `schema.sql` (bundled in `dist-server/`) and executes each statement via `prisma.$executeRawUnsafe()`
- Uses `import.meta.url` to find `schema.sql` relative to the bundled script (not `process.cwd()`)
- Ignores `already exists` errors for idempotency
- Logs `tableCount` on success

**Layer 2: Better auth error messages** ([`server/routes/auth.ts`](./server/routes/auth.ts)):
- The catch block now detects Prisma errors: `no such table`, `relation does not exist`, `P2021`
- Returns HTTP 503 with `"Database not initialized. Please restart the application."` instead of generic 500
- This distinguishes "schema not created" from real auth failures

### Key Files

| File | Purpose |
|------|---------|
| [`server/run.ts`](./server/run.ts) | `ensureDatabaseTables()` fallback, calls schema apply before backfill |
| [`server/routes/auth.ts`](./server/routes/auth.ts) | Better error discrimination (DB vs auth) |

### Dependency Order

```
migrate-db.mjs (offline, before Node.js starts)
  └─ if fails → server starts anyway, tables missing
      └─ ensureDatabaseTables() in run.ts (on server boot)
          └─ prisma.$executeRawUnsafe() creates missing tables
              └─ backfillUids() → server ready
```

### Why `import.meta.url` and not `process.cwd()`

- In production Tauri, `process.cwd()` resolves to the **app data directory** (`~/Library/Application Support/...`), NOT the Resources directory.
- The bundled `schema.sql` lives in the **Resources** directory alongside `index.js`: `/Applications/ERD Builder Pro.app/Contents/Resources/dist-server/schema.sql`
- `fileURLToPath(import.meta.url)` gives the correct path to the running script, from which we derive `schema.sql`'s location.
- esbuild preserves `import.meta.url` in ESM output.

## Docker Deployment (Entrypoint + docker-compose)

### Architecture

Docker image supports 3 database modes via **entrypoint script** ([`docker-entrypoint.sh`](./docker-entrypoint.sh)):

| Mode | Detection | Entrypoint action |
|------|-----------|-------------------|
| **SQLite** (default) | No `DATABASE_URL` or `file:` prefix | Sets `DATABASE_URL=file:/app/data/erd-builder.db`, runs `prisma db push` with SQLite schema |
| **Local PostgreSQL** | `postgresql://` without `SUPABASE_URL` | Regenerates Prisma client for PG schema, runs `prisma db push` |
| **Supabase PostgreSQL** | `SUPABASE_URL` is set | Skips everything (client already generated at build time) |

### Entrypoint Flow ([`docker-entrypoint.sh`](./docker-entrypoint.sh))

```sh
# Simplified flow
if SUPABASE_URL is set  → exec CMD (skip migration)
if no DATABASE_URL      → SQLite: set file path + schema variant + prisma db push
if postgresql://        → Local PG: set schema variant + prisma db push
exec CMD
```

- `prisma db push --accept-data-loss` dijalankan di entrypoint — membuat/meng-update tabel sesuai schema Prisma.
- Volume `/app/data` di-mount untuk persistensi SQLite.
- Supabase mode tidak perlu migrasi karena schema dikelola Supabase.

### Dockerfile Changes

- **`prisma` CLI diinstall di production stage**: `npm install tsx prisma`. Prisma dibutuhkan untuk `prisma db push` dan regenerasi client.
- **Pre-generated client** masih di-copy sebagai fallback (Supabase mode), tapi akan ditimpa oleh entrypoint untuk mode lain.
- **Entrypoint** dipasang via `ENTRYPOINT ["docker-entrypoint.sh"]` dengan `CMD ["npm", "start"]` sebagai default.

### docker-compose.yml

File [`docker-compose.yml`](./docker-compose.yml) menyediakan konfigurasi siap pakai:

- **Default SQLite**: volume `erd-data` otomatis di-mount ke `/app/data` — data persist walau container restart.
- **PostgreSQL**: tinggal uncomment bagian `environment` + `depends_on` + `db` service.
- **Restart policy**: `unless-stopped`.

### Volume Persistence

- **SQLite**: data disimpan di `/app/data/erd-builder.db` (di dalam volume `erd-data`).
- **PostgreSQL**: data disimpan di volume `pg-data` untuk `postgres` container.
- Entrypoint membuat direktori `/app/data` otomatis (`mkdir -p`) sebelum menjalankan migrasi.

### Usage

```bash
# Mode 1: SQLite (zero-config)
docker compose up -d

# Mode 2: Local PostgreSQL
docker compose -f docker-compose.yml -f docker-compose.pg.yml up -d
# atau edit docker-compose.yml, uncomment bagian PostgreSQL

# Mode 3: Supabase
docker run -d -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e SUPABASE_URL="https://project.supabase.co" \
  -e SUPABASE_SERVICE_ROLE_KEY="..." \
  erd-builder-pro

# Build dari source
docker compose build
docker compose up -d
```

### Entrypoint vs Desktop Fallback

- Entrypoint menjalankan `prisma db push` yang membuat tabel via Prisma CLI.
- Server startup (`ensureDatabaseTables()` di `server/run.ts`) tetap jalan sebagai fallback untuk desktop, tapi di Docker tabel sudah dibuat oleh entrypoint.
- `ensureDatabaseTables()` di Docker hanya nge-probe `SELECT 1 FROM users` dan return true (karena tabel sudah ada).

### P2002 Fix: PostgreSQL Catalog Conflict on Re-deployment

**Error**: `P2002 - Unique constraint failed on the fields: ('typname','typnamespace')` when `prisma db push` runs on a database that already has tables from a previous deployment.

**Root cause**: PostgreSQL's `pg_type` catalog has a unique constraint on `(typname, typnamespace)`. When `prisma db push` re-runs on an initialized database, Prisma's reconciliation process can trigger a conflict with existing composite types that PostgreSQL auto-creates for each table.

**Fix** ([`docker-entrypoint.sh`](./docker-entrypoint.sh)):
- **SQLite**: check if the DB file exists (`-f "$DATA_DIR/erd-builder.db"`)
- **PostgreSQL**: probe for `users` table using `psql "$DATABASE_URL" -c "SELECT 1 FROM users LIMIT 1"`
- If the database is already initialized, skip `prisma db push` entirely
- If `prisma db push` still fails (non-zero exit), log a warning and continue starting the server

**Dockerfile dependency**: `postgresql-client` installed via `apk add --no-cache postgresql-client` for `psql` probing.

### P1003 Fix: Database Does Not Exist on First Deploy

**Error**: `P1003 - database "erd_builder_pro" does not exist` on fresh deployment to Dokploy or any PostgreSQL host.

**Root cause**: `prisma db push` can create TABLES inside an existing database, but it CANNOT create the database itself. PostgreSQL requires the database to exist before any connection can be made.

**Fix** ([`docker-entrypoint.sh`](./docker-entrypoint.sh)): Before `prisma db push`, the entrypoint now:

1. **Extracts database name** from `DATABASE_URL` using `awk`:
   - `postgresql://user:pass@host:5432/erd_builder_pro?params` → `erd_builder_pro`
2. **Connects to the default `postgres` admin database** (always exists on any PostgreSQL server)
3. **Probes** `SELECT 1 FROM pg_database WHERE datname='erd_builder_pro'`
4. **Creates database** if missing: `CREATE DATABASE "erd_builder_pro"`
5. Then proceeds with the normal probe → `prisma db push` flow

This is safe to run on every deployment — `CREATE DATABASE` is only executed when the database doesn't exist, and the `pg_database` probe is a read-only check.

**Complete PostgreSQL flow**:
```
Entrypoint for postgresql://...
  ↓
Extract DB_NAME from URL
  ↓
Connect to 'postgres' admin database
  ↓
Probe pg_database → DB exists?
  ├─ YES → skip
  └─ NO  → CREATE DATABASE
  ↓
Probe users table → table exists?
  ├─ YES → skip prisma db push
  └─ NO  → prisma db push (creates all tables)
  ↓
Start server
```
