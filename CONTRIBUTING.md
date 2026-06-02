# Contributing to ERD Builder Pro

## Branching

- `master` — production (protected). PR from `development` via **Rebase and merge**.
- `development` — default branch for PRs. All feature branches originate from here.
- Feature branches: `feat/<name>`, `fix/<name>`, `refactor/<name>`.

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

1. Create feature branch from `development`
2. Commit with convention above
3. Open PR against `development`
4. Ensure `npm run lint` passes (zero TypeScript errors)
5. Maintainer reviews → squash or rebase merge

## Prerequisites

- **Node.js** v20+
- **npm** v10+
- **Supabase** account (free tier works) for Auth + database
- **Cloudflare R2** account (optional, for storage)

## Setup

```bash
git clone https://github.com/hadziqmtqn/erd-builder-pro
cd erd-builder-pro

cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
# Optional: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY for mentions, AI context, and realtime

npm install
npm run dev        # Full stack (Express + Vite middleware)
npm run dev:api    # Backend only
npm run dev:client # Frontend only (proxies /api to :3000)
npm run clean      # Remove dist/
```

## Before You Code

- **Read [`AGENTS.md`](./AGENTS.md)** — contains agent memory about architecture, patterns, bug fixes, and technical decisions. Must be read before making changes.
- **Understand Guest Mode**: All data hooks (`useNotes`, `useDiagrams`, `useFlowcharts`, `useDrawings`, `useTrash`, `useProjects`, `useAIChat`) use the `isGuestCheck()` pattern — `isGuestRef.current || sessionStorage.getItem('auth_mode') === 'guest'`. Never use raw `if (isGuest)` — it causes stale closures on initial render.
- **Auth is Supabase-only**: the server verifies Supabase session JWTs from the `httpOnly` `token` cookie. Do not add local `JWT_SECRET`, `ADMIN_EMAIL`, or `ADMIN_PASSWORD` assumptions back into new code.
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
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Optional: `R2_*` (Cloudflare storage), `GITHUB_*`, `TELEGRAM_*`.

## Need Help?

Open a [GitHub Discussion](https://github.com/hadziqmtqn/erd-builder-pro/discussions) or issue.
