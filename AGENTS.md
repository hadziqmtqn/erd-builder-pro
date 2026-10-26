# ERD Builder Pro — Agent Memory

## Project Overview

All frontend DB access goes through `apiFetch` → Express → Prisma — no direct DB client in frontend. DB modes: pure PostgreSQL (main, web), SQLite (Desktop/CLI), and legacy Supabase. New code targets PostgreSQL and SQLite; do not add new Supabase-only behavior.

**Features**: Notes (Tiptap), ERD (React Flow), Flowchart (React Flow), Drawings (Excalidraw), AI Assistant.

**DB mode detection** (see full table below): `DATABASE_URL` + `SUPABASE_URL` env vars. Local auth routes use `useLocalAuth()`. Prisma 7 with driver adapters (`@prisma/adapter-pg`, `@prisma/adapter-better-sqlite3`).

## Contribution Rules

Full rules are in [`CONTRIBUTING.md`](./CONTRIBUTING.md). In short:

- Work starts from an issue on the [ERD Builder Pro Roadmap](https://github.com/users/hadziqmtqn/projects/8). Roadmap IDs (`CLD-008F`, `BUG-016`) are assigned by maintainers only; never invent one.
- Branch from the latest `master` as `<type>/<id>-<short-name>` (`feat/cld-008f-cloud-import-lockdown`), or `<type>/issue-<number>-<short-name>` before triage. `development` is not used.
- Commits use `<type>(<ID>): <description>`. PRs target `master`, are written in English, and include `Fixes #<issue>`.
- One roadmap ID per branch and PR. `npm run lint` must pass.

## Product and Security Rules

These rules constrain code in every mode. Do not weaken them to make a feature easier.

- **One Team model.** Every document belongs to a Personal Workspace or a Team. Do not add private packages, private forks, or a second nested Team.
- **Server-side authorization only.** Every Team-scoped request re-checks membership, member status, and entitlement on the server. Browser state, cached grants, and Team IDs from the client are never proof of access.
- **Generic not-found.** A resource owned by another user or Team returns the same not-found response as a missing one. Never reveal that a protected resource exists.
- **Locked Team keeps data.** When a Team is locked or revoked, deny Team access per request and keep its data. Never delete documents as a licensing reaction. The Personal Workspace stays usable.
- **Self-host data stays local.** Self-host users, documents, office data, and AI credentials are never sent to the Cloud control plane. Cloud telemetry is aggregate and redacted only; Self-host sends none.
- **Official Cloud has no local SuperAdmin.** Identity, Team membership, roles, subscription, entitlement, billing, and AI configuration come from the control plane; the runtime keeps only the minimum local mapping.
- **Public MCP** is Web-only and read-only, limited to explicitly allowed Personal or Team documents.
- **Separate secrets.** Instance-license and Cloud-user tokens use separate audiences, signing keys, and session paths. Webhooks stay signed, replay-protected, and idempotent.
- **Preserve installed data.** Migrations are additive and idempotent; never reset, truncate, or rebuild user data in startup code.

## State Management

- **WorkspaceContext**: global state (auth, documents, active IDs, XYFlow state, undo/redo, panels, theme). Single provider.
- **AIActionContext**: AI assistant actions, `selectionText`, `registerContentHandler`/`applyContent` for `replace`/`append` strategies.
- **useAuth**: Context-based hook (`AuthProvider` wraps app). Shared state — `setUser` exposed for immediate sync after account update. No second API round-trip.

## Key Patterns

### AI → Content Application Flow

```
AIChatPanel → registerContentHandler → applyContent(content, strategy)
  → active view handler (NotesView, ERDView, FlowchartView)
  → DiffPreviewModal (for Notes) or inline diff dialog
  → User confirms → marked.parse → DOMPurify → save
```

Safeguards: `confirmLockRef` prevents double-click, `originalContent` snapshot captured when modal opens (not live state), error keeps modal open. No streaming apply.

### Save Chain (Notes)
```
Editor onUpdate → handleNoteChange (debounced 800ms)
  → saveNote → setNotes (immediate state sync) → IndexedDB (800ms) + cloud sync (1600ms)
```

`saveNote` calls `setNotes` directly — redundant with debounced handler but harmless.

### Cross-Feature Session Scoping
**Architecture decision**: Use `project_id` on `ai_chat_sessions` as truth source, **not** `referenced_file_info` (JSONB). `referenced_file_info` is a cache that goes stale — files deleted/moved invalidate references. With `project_id`, dynamic queries of all files per project run on every `sendMessage()` — always fresh, zero maintenance.

Server `/sessions` GET — three-tier query:
- `project_id` + `entity_uid` → OR: `project_id=X OR (project_id IS NULL AND entity_type=Y AND entity_uid=Z)`
- `project_id` only → `project_id=X`
- `entity_uid` only → orphan sessions for that file
- No params → `[]` (was `project_id IS NULL` — leaked across files)

**Dynamic `project_id` sync**: Every `sendMessage` reads `projectIdRef.current`, compares with `currentSession.project_id`. If different → updates DB + syncs local state. Uses ref not state because `sendMessage` is memoized with limited deps — ref breaks the dependency chain.

### AI Chat @Mentions
User types `@` in ChatInput → dropdown filters files from same project. Content resolution: Note from state/Supabase, Flowchart from `fc.data`, Diagram title-only, Drawing from `dw.data`. Truncated 2000 chars, HTML stripped. `@FileName` preserved in DB.

### Content-Aware Action Buttons
- Notes view: always shows Replace/Append, plus Database/Flowchart/Notes buttons when content detected
- ERD view: shows Append only for SQL; Replace hidden
- Flowchart view: shows Replace/Append only for JSON
- Notes button always visible across ALL views — opens `NoteFromTextDialog`
- AI instructed to say "click the Database button" not "Append/Replace" for SQL content

### AI Action Modes (Radio Pills + Hidden System Prompt)
Radio toggle pills in ChatInput (one active at a time). System prompt stored in background — user only sees own instruction. On send: `{userText}\n\n---SYSTEM_PROMPT---\n{systemPrompt}`. `activeActionId` cleared after send.

### Context Prominence
Entity context + selection text injected as **prefix of user message** (not system message). Fine-tuned models give lower weight to system messages.

## Theme System

State in WorkspaceContext: `theme` (`'light'|'dark'|'system'`), `resolvedTheme` (`'light'|'dark'`). localStorage key `erd-builder-theme`. Class `dark` toggled on `<html>` + `<body>`.

```
Theme selector → setTheme() → localStorage → update DOM class
  → resolvedTheme derived from prefers-color-scheme media query
  → passed as prop to: Excalidraw (theme), ReactFlow (colorMode), all canvases
```

CSS variables from shadcn (`var(--popover)`, `var(--popover-foreground)`) used in JS style objects for React Flow edge labels.

**Edge colors**: `defaultEdgeOptions` and `onConnect` use CSS variables for stroke/markerEnd color — theme-aware. `memoizedEdges` overrides both `markerEnd` AND `markerStart` when selected (fixes misalignment).

## UUID vs Numeric ID (Delete/Restore)

**Critical bug pattern**: All document types have dual ID fields (`id` numeric + `uid` UUID). `delete*`/`restore*` functions must use **dual-field matching**: `ref.find(d => String(d.id) === String(uid) || String(d.uid) === String(uid))`. Old pattern `d.uid ?? d.id` failed when `uid` existed but caller passed numeric id.

**ERD create/save chain fix**: `createDiagram` sends `crypto.randomUUID()` as `uid`. `selectDiagram` uses `urlIdentifier` (UUID-preferring). Server save accepts numeric IDs + backfills `uid`. Server create persists `uid` from client.

## Guest Mode

- `isGuest = true`, data from IndexedDB, no API calls.
- **Critical pattern**: every guest early return MUST call `setIsLoading(false)`.
- `isGuestCheck()` reads from ref + `sessionStorage.getItem('auth_mode') === 'guest'` (synchronous, catches race before React state propagates).
- Applied in: `useDiagrams`, `useNotes`, `useFlowcharts`, `useDrawings`, `useProjects`, `useTrash`, `useAIChat`, `useSyncService`.
- AI Chat functional in Guest — in-memory sessions, proxy flow via server.
- Guest data export/import via IndexedDB `.json` file + `POST /api/guest/import` (NDJSON streaming, batched transactions).

## ERD Architecture

### Key Rules
- **1 FK = max 1 PK**: one FK column can only point to one PK. Multiple FKs in same table → different tables allowed.
- **Edge dedup**: canonical relation key from both endpoints sorted before comparison. Name-based fallback for stale IDs.
- **Edge handle self-heal**: after flip (drag PK→FK), recomputes suffix matching side position. Detects impossible suffix pairs (source+target) and rewrites.
- **4 handles per column**: `-target` (left), `-source-l` (left), `-source` (right), `-target-r` (right).

### Drag Performance
- `styledNodes`/`styledEdges` preserve references — only create new objects for nodes whose selected state changed.
- Filter `type: 'select'` changes before forwarding to React Flow.
- `defaultEdgeOptions` memoized.

### Schema Diff & Merge
- `computeSchemaDiff` matches tables by name (lowercase). Diff overlay on canvas with green/amber/red borders.
- Merge panel: approve/reject per table. `handleApplyMerge` explicitly calls `saveDiagram` + `triggerDebouncedSync` after merge.
- `isDiffMode` flag blocks all editing (double-click, dropdown, delete) during diff review.

## Flowchart Architecture

### Section/Group Feature
- Start nodes have "Group Title" — stored as `section` in node data.
- `groupId` auto-generated (`grp_quickstart`). AI context groups symbols by section via BFS from Start.
- Delete Group: deletes all nodes sharing same `section`. Move Group: BFS selects all member nodes → multi-drag.

### AI Content
- `MAX_AI_NODES = 60`, `MAX_AI_EDGES = 120` — hard limits.
- Fast-path: if AI provides positions, skip Sugiyama layout.
- Stable IDs via `hashStr(JSON.stringify(parsed))` — identical AI response → identical IDs.
- `applyInsertBetween`: sourceGroupId > sourceIndex > sourceLabel priority.
- Preview modal shows GitHub-style diff before confirm.

### Drag Performance
- Position changes NOT blocked during drag (matched ERD pattern). Only filter `select` changes.
- `setActionContextData` debounced 500ms during drag — prevents heavy syntax highlighting re-renders.
- `emptySetRef` for stable Set reference — prevents unnecessary `memoizedNodes` recompute.

## DB Mode Detection

| Mode | Detection | Auth | IDs | Schema |
|------|-----------|------|-----|--------|
| Pure PostgreSQL (main) | `postgresql://` + no `SUPABASE_URL` | Local | Int | `schema.pg.prisma` |
| Official Cloud | Pure PostgreSQL + `AUTH_MODE=sso` | SSO; local password routes disabled | Int | `schema.pg.prisma` |
| Desktop/SQLite (and CLI) | `file:` or `.db` in URL | Local (desktop-auth) | Int | `schema.sqlite.prisma` |
| Supabase (legacy) | `postgresql://` + `SUPABASE_URL` | Supabase JWT | BigInt | `schema.prisma` |

Detection: `isDesktopMode()`, `isLocalPostgres()`, `useLocalAuth()`. Supabase auth via `supabase.auth.getUser(token)`.

Local web development uses `npm run dev:pg:local` and `npm run test:pg`. `DB_VARIANT` defaults to `pg`; `npm run dev` and `npm run dev:api` generate the PostgreSQL client without pushing the schema. `postinstall` generates the legacy Supabase client first (kept for Supabase deployments that build with `npm install`), then the PostgreSQL client, so `@prisma/client` types follow `schema.pg.prisma`.

### Prisma 7 Migration
- Driver adapters mandatory (`@prisma/adapter-pg`, `@prisma/adapter-better-sqlite3`)
- `prisma.config.ts` with env-based schema switching via `DB_VARIANT`
- `datasource.url` removed from schema files
- Cache stale after schema switch → `rm -rf node_modules/.prisma/client` before regenerate (in all dev scripts)

### CLI/Installed SQLite Updates
- CLI uses the same `src/` frontend and `server/` bundle as Desktop; `npm run build:cli` assembles generated `cli/dist`, `cli/dist-server`, and copies the authoritative `prisma/schema.sqlite.prisma` plus `schema.sql`.
- `isDesktopMode()` includes CLI because its `DATABASE_URL` is `file:`. New system tables are owned by the selected Prisma schema and versioned migration; `server/lib/startup-migration.ts` may contain only additive columns or data-preserving legacy compatibility, never the table definition itself.
- Keep `cli/prisma/schema.sqlite.prisma`, `cli/prisma/schema.sql`, and `scripts/schema.sql` refreshed from the build after schema changes. Generated `cli/dist*` folders are excluded from TypeScript checks.

### Security (Phase 1-4)
- CORS allowlist via `CORS_ORIGINS` env var
- Rate limiting: global 200/min, auth 10/min, AI proxy 30/min, upload 20/min
- Zod validation on critical endpoints
- Helmet middleware
- AI proxy returns 502 (not pass-through 401) — prevents auth:unauthorized dispatch
- API keys masked as `'***'` in GET/POST responses
- `err.message` never leaked to client; generic error messages only
- Frontend Supabase client fully removed — all calls via `apiFetch` → Express → Prisma

## Account Update — Mode-Aware

| Mode | Behavior |
|------|----------|
| Desktop (Tauri) | Edit name + email, no password (fixed at install) |
| Web Pure PG | Edit name + email + password (verified by current password) |
| Web Supabase | Read-only display (blue banner) |

**User name field**: `user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0] || "User"`. Always check both `full_name` (Supabase) and `name` (local auth).

## Known Bug Patterns

| Pattern | Symptom | Fix |
|---------|---------|-----|
| Stale session list after auth | `listSessions` returns same data after login | Remove `getUserId()` guard — server extracts JWT |
| Stale table list after delete | Empty/missing slots on page 1 | `tableRefreshKey` counter in context triggers re-fetch |
| ERD double-save on column edit | 2 saves for 1 change | 100ms guard in auto-save — skip if direct save just happened |
| Auto-generated docs lost on reload | ERD/Flowchart content disappears | Call `triggerDebouncedSync()` after `saveDiagram`/`saveFlowchart` in mount effect |
| Prisma cache stale after schema switch | Wrong model in queries | `rm -rf node_modules/.prisma/client` before regenerate |
| `projectId` in `sendMessage` stale | Callback references old project | Use ref not state — breaks dependency chain |
| Edge handle suffix mismatch after flip | Edge invisible (data saved but not rendered) | Self-heal source/target suffix after flip |
| Guest `hasPendingSyncs` stuck | Save indicator shows forever | `isGuestCheck()` guard in `triggerDebouncedSync` |
| Login second round-trip | Login page stays visible after success | Use `handleLogin(userData)` synchronous — no `checkAuth()` call |
| Edge reconnect preserves old edge | Edge snaps back to original | Use atomic `reconnectEdge()` from `@xyflow/system`, not filter + connect |
| Base-UI select focus-out close | Column type dropdown closes mid-typing | `eventDetails.cancel()` on `'focus-out'` reason |

## Notable Conventions

- All files must be <400 lines — split on sight
- No boolean `isX` params that alter internal flow — use separate functions
- Business logic extracted to `src/lib/` or `src/hooks/`, not in components
- `isGuestCheck()` = `isGuestRef.current || sessionStorage.getItem('auth_mode') === 'guest'`
- `apiFetch()` for all API calls — set `VITE_API_URL` to migrate backend
- `cleanIdentifier()` strips backticks/quotes/brackets from SQL identifiers
- `sortOrder` column → handle rebuild via `updateNodeInternals`
- Global 401 interceptor in `main.tsx` — respects `API_BASE_URL` prefix
- `res.on("close")` (not `req.on("close")`) for AI proxy — req fires too early
- Seed AI providers on every server startup (`seedAIProviders()`)
