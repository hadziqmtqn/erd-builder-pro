# Contributing to ERD Builder Pro

## Branching

- `master` is the default and protected branch. Never commit to it directly; every change goes through a PR into `master`.
- `development` is no longer used. Do not branch from it or open PRs against it.
- Create one branch per issue from the latest `master`, named `<type>/<id>-<short-name>`:
  - `<type>` is the commit type of the main change: `feat`, `fix`, `refactor`, `docs`, `chore`, `perf`, or `test`.
  - `<id>` is the roadmap ID in lowercase (`cld-008f`). If the issue has no roadmap ID yet, use `issue-<number>` instead.
  - `<short-name>` is two to five lowercase words joined by hyphens.

| Case | Branch |
|------|--------|
| Roadmap issue `CLD-008F` | `feat/cld-008f-cloud-import-lockdown` |
| Bug with roadmap ID `BUG-016` | `fix/bug-016-notes-cursor-jump` |
| Issue `#312`, not triaged yet | `fix/issue-312-export-filename` |

Keep a branch to one roadmap ID. Split unrelated work into separate branches and PRs.

## Commit Convention

```
<type>(<scope>): <description>
```

| Type | Usage |
|------|-------|
| `feat` | New feature |
| `fix` | Bug fix |
| `chore` | Tooling, config, CI |
| `docs` | Documentation |
| `refactor` | Code restructuring |
| `style` | UI/style changes |
| `perf` | Performance |
| `test` | Tests |
| `merge` | Branch merge |

> Emojis are optional. Common examples: `✨ feat`, `🐛 fix`, `♻️ refactor`.

Examples:
```
feat(erd): add schema diffing and merge panel
fix(chat): resolve stale selection text on blur
refactor(ai): split useAIChat into modules
docs: add Docker Hub badges to README
```

## PR Workflow

1. Create a branch from the latest `master` as described under Branching.
2. Commit with the convention above. Use the roadmap ID as the scope when there is one, for example `feat(CLD-008F): reject Import/Export/Backup in Cloud mode`.
3. Before opening the PR, update your branch with the latest `master`.
4. Open a PR against `master`, written in English. Start the title with the same type and scope as the main commit, and put `Fixes #<issue>` in the description.
5. Ensure `npm run lint` passes (zero TypeScript errors).
6. A maintainer reviews, then squash- or rebase-merges it.

## Roadmap

The public roadmap is the [ERD Builder Pro Roadmap](https://github.com/users/hadziqmtqn/projects/8) GitHub Project. Its columns are **Planned**, **In Progress**, and **Done**.

- **Issues** are work you can pick up. Their titles start with a roadmap ID such as `CLD-008F`.
- **Draft items** announce planned work that is still maintainer-led. They cannot be claimed yet.

### Opening a new issue

1. Search existing issues and the roadmap first.
2. Open an issue with the bug report, feature request, or documentation template. Do not put a roadmap ID in the title; the issue number (`#123`) is enough.
3. A maintainer triages it:
   - **Accepted**: the maintainer assigns a roadmap ID, prefixes the title with it, and adds the issue to the roadmap as Planned.
   - **Not accepted**: the issue is closed with `duplicate`, `invalid`, or `wontfix` and a short reason.

Roadmap IDs are assigned by maintainers only, because they are used in commits and PRs.

### Claiming an issue

1. Pick an issue labeled `help wanted` or `good first issue`. If an issue says it is waiting on other work, ask before starting.
2. Comment on the issue that you want to work on it, with a short plan.
3. Wait until a maintainer assigns you. The item then moves to In Progress.
4. Open a PR following the steps above and put `Fixes #<issue>` in its description. Merging the PR closes the issue and moves it to Done.

If an assigned issue has no activity for 14 days, a maintainer may unassign it so someone else can take it.

## Prerequisites

- **Node.js** v20+
- **npm** v10+
- **PostgreSQL** running locally (the main database for web development)
- **Cloudflare R2** account (optional, for storage)

## Setup

```bash
git clone https://github.com/hadziqmtqn/erd-builder-pro
cd erd-builder-pro

createdb erd_builder_pro
cp .env.example .env
# Set DATABASE_URL to your local database, for example:
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/erd_builder_pro"
# Leave SUPABASE_URL unset: pure PostgreSQL uses local auth.

npm install
npm run dev:pg:local # Push the PostgreSQL schema, generate the client, start full stack
npm run dev:client   # Frontend only (proxies /api to :3000)
npm run test:pg      # Tests against the PostgreSQL client
npm run clean        # Remove dist/
```

Use `npm run dev:pg:local` rather than `npm run dev` or `npm run dev:api`; those regenerate the legacy Supabase Prisma client. For PostgreSQL schema changes, edit `prisma/schema.pg.prisma` and add a migration with `npm run db:migrate:pg:local`.

## CLI Development and Releases

The CLI packages the same frontend and server used by the desktop app. Do not edit `cli/dist/` or `cli/dist-server/` manually; those folders are generated and ignored. DB Client UI changes belong in `src/`, API/connector changes in `server/`, and the authoritative local system database schema is `prisma/schema.sqlite.prisma`.

Build the complete local CLI package with:

```bash
npm run build:cli
```

This builds the server bundle and frontend, copies the current SQLite Prisma schema and generated `schema.sql` into `cli/`, and prepares the native SQLite dependency. Run it after DB Client changes before testing the CLI:

```bash
node cli/bin/erdbpro.js start --port 3101 --open
```

CLI uses local auto-login; it should open the dashboard directly. If a login page appears, rebuild the frontend with `npm run build:cli`, stop any previous process on the port, and retry with a clean test `HOME` directory. The first `/api/me` request may briefly wait while the SQLite migration runs.

### System database changes

For every new system table or column:

1. Update `prisma/schema.sqlite.prisma`.
2. Add a versioned SQL migration under `prisma/migrations-sqlite/` for development/fresh-schema history.
3. Do not add `CREATE TABLE` to `server/lib/startup-migration.ts`. Use Prisma's migration runner for table creation; startup code may only perform a data-preserving compatibility step for legacy installed databases when required.
4. Run `npm run build:cli`; it refreshes `cli/prisma/schema.sqlite.prisma`, `cli/prisma/schema.sql`, and the bundled server.
5. Verify both a fresh database and an existing database from the previous release. Never rely on `CREATE TABLE` in the fresh schema alone for installed updates.

The CLI stores its system database at `~/.erdbpro/data.db`. Updating the npm package and starting it again runs the startup migration before the API is marked ready. Keep migrations additive and idempotent; preserve user data and never rebuild a table in startup migration without an explicit data-preserving migration.

## Before You Code

- **Read [`AGENTS.md`](./AGENTS.md)** — contains agent memory about architecture, patterns, bug fixes, and technical decisions. Must be read before making changes.
- **Understand Guest Mode**: All data hooks (`useNotes`, `useDiagrams`, `useFlowcharts`, `useDrawings`, `useTrash`, `useProjects`, `useAIChat`) use the `isGuestCheck()` pattern — `isGuestRef.current || sessionStorage.getItem('auth_mode') === 'guest'`. Never use raw `if (isGuest)` — it causes stale closures on initial render.
- **Database and auth modes**: pure PostgreSQL is the main database. It uses local auth (`useLocalAuth()`), like Desktop/SQLite. Supabase is a legacy mode, detected only when `SUPABASE_URL` is set; do not make new code depend on it. Official Cloud uses SSO (`AUTH_MODE=sso`). The server reads the session from the `token` cookie in every mode. Do not add `JWT_SECRET` or custom credential env var assumptions.
- **Keep AGENTS.md updated**: After completing a feature/fix, update `AGENTS.md` with any relevant new patterns.

## Code Style

- **TypeScript** strict mode. Avoid `any` unless necessary.
- **React** functional components with hooks. No class components.
- **Tailwind CSS v4** for styling. No CSS-in-JS.
- **Shadcn UI** primitives (`Button`, `Dialog`, `Select`, etc.) from `src/components/ui/`.
- **Imports**: `@/` alias for `src/`, `../shared/` for shared types.
- **State**: Use `WorkspaceContext` for global app state, local `useState`/`useRef` for component state.
- **AI features**: Register actions in `src/components/ai/AIActions.ts`, build prompts in `src/components/ai/actions/`.

## Architecture

```
src/
├── components/     # React components
│   ├── ai/         # AI chat panel, actions, dialogs
│   ├── flowchart/  # Flowchart UI (preview modal, export, properties)
│   ├── modals/     # Dialogs (rename, trash, table, share)
│   └── ui/         # Shadcn primitives
├── hooks/          # Custom hooks + aiChat/ submodule
├── providers/      # WorkspaceContext, WorkspaceProvider
├── routes/         # Page layouts (AppLayout, TableRoute, editor routes)
├── lib/            # Utilities (api, sqlParser, schema-diff, exporters)
└── contexts/       # AIActionContext
server/
├── routes/         # Express API routes
└── lib/            # Server config, middleware
shared/
└── types.ts        # All TypeScript interfaces (single source of truth)
```

## Environment Variables

Minimal required in `.env`:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/erd_builder_pro"
APP_TIMEZONE=Asia/Jakarta
PORT=3000
```

Optional: `R2_*` (Cloudflare storage), `GITHUB_*`, `TELEGRAM_*`. See [`.env.example`](./.env.example) for every setting.

## Need Help?

Open a [GitHub Discussion](https://github.com/hadziqmtqn/erd-builder-pro/discussions) or issue.
