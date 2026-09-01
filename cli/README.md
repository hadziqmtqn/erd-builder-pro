# erdbpro

**ERD Builder Pro CLI — one command to start your database design workspace.**

```bash
npx erdbpro
```

No config. No setup. No Docker required. Just Node.js 18+.

---

## Quick Start

```bash
# Install globally
npm install -g erdbpro

# Start (opens browser at localhost:3101)
erdbpro
```

The CLI uses local auto-login and does not show a login form. It creates/uses the local administrator automatically.

Data stored in `~/.erdbpro/` (SQLite). Zero config, always ready.

---

## Interactive Menu

After starting, you'll see an interactive menu you can navigate with arrow keys:

```
========================================
  ERD Builder Pro (v2.5.2)
  🚀 Server: http://localhost:3101
========================================

 ▶ Web UI (Open in Browser)
   Hide to Background
   Exit

  ↑↓ move  Enter select  q quit
```

- **↑↓** — move the `▶` selector up or down
- **Enter** — execute the selected action
- After an action (e.g. opening the browser), press **Enter** to return to the menu
- **q** or **Ctrl+C** — exit immediately

### Menu Options

| Option | What it does |
|--------|--------------|
| **Web UI** | Opens the app in your default browser at `http://localhost:3101` |
| **Hide to Background** | Detaches the server to run silently. Stop with `erdbpro stop`. |
| **Exit** | Stops the server and exits the CLI |

You can also bypass the menu entirely:

```bash
erdbpro start --background   # Start silently, no menu
erdbpro start --open         # Open browser immediately, no menu
```

---

## Commands

```bash
erdbpro                          # Start server + interactive menu
erdbpro start                    # Same as above
erdbpro start --background       # Run in background (detached)
erdbpro start --open             # Skip menu, open browser immediately
erdbpro start --port 4000        # Custom port
erdbpro start --force            # Restart if already running
erdbpro stop                     # Stop background server
erdbpro status                   # Check if server is running
erdbpro mcp                      # MCP using CLI data
erdbpro mcp --desktop            # MCP using Desktop app data
erdbpro schema check --repo .    # Validate repository schema for local/CI use
```

`erdbpro mcp` reads `~/.erdbpro/data.db`. The `--desktop` flag runs the installed Desktop MCP backend bundle directly against the Desktop database; it does not launch the Desktop GUI. In development, run it from the repository root to use the Desktop dev database.

### Schema checks in CI

The checker supports Laravel migrations, DBML, and SQL schema/migration sources. It never checks out a branch or modifies the repository.

```bash
erdbpro schema check --repo . --ref WORKTREE
erdbpro schema check --repo . --source laravel:database/migrations --json
erdbpro schema check --repo . --fail-on-warnings
```

GitHub Actions example:

```yaml
- uses: actions/setup-node@v7
  with:
    node-version: "22"
- run: npx --yes erdbpro@latest schema check --repo . --fail-on-warnings
```

Exit code `0` means valid, `1` means the source could not be read or parsed, and `2` means warnings were found with `--fail-on-warnings`.

---

## Database

**SQLite only.** Database created automatically in `~/.erdbpro/data.db`. No configuration needed.

Need PostgreSQL? Use the Docker image instead:
```bash
docker run -p 3101:3101 -e DATABASE_URL=postgresql://... bekenweb/erd-builder-pro
```

The CLI distribution keeps things simple — SQLite is fast, portable, and requires zero setup. Docker and desktop (Tauri) builds support PostgreSQL for production use.

---

## Port

Default: `3101` (avoids conflicts with dev server on 3098 and desktop app on 3099).

---

## Background Mode

```bash
erdbpro start --background
erdbpro status              # → ✅ Server running (PID: 12345)
erdbpro stop                # → 🛑 Server stopped
```

PID file stored at `~/.erdbpro/server.pid`. Auto-cleaned on stop or stale detection.

---

## Update

When a newer npm version is available, `erdbpro` shows **Update** as the first interactive-menu option. Selecting it stops the local server and prints the install command; it never updates automatically.

```bash
npm install -g erdbpro@latest --prefer-online
erdbpro start --force       # Stop old + start new
```

Amber dot badge appears on the nav-user avatar in the web app when a newer version is available.

On the next start after an update, the CLI automatically applies additive system-database migrations to `~/.erdbpro/data.db` before the API becomes ready. Existing diagrams, notes, connections, and query drafts are preserved.

---

## Features

All features identical to the desktop app:
- **ERD Diagrams** — design database schemas with React Flow
- **DB Client** — connect to PostgreSQL, MySQL, or SQLite, browse/edit records, inspect structure, and run SQL queries
- **Flowcharts** — create flowcharts with multiple node shapes
- **Notes** — rich text editing with Tiptap
- **Drawings** — whiteboard with Excalidraw
- **AI Assistant** — chat with AI for SQL generation, flowchart creation, and more

---

## Requirements

- **Node.js 18+** (22 LTS recommended)
- macOS, Linux, or Windows

---

## Files

```
~/.erdbpro/
  ├── data.db          # SQLite database
  ├── server.pid       # Background process PID
  └── logs/            # Server logs
```

---

## Uninstall

```bash
npm uninstall -g erdbpro
rm -rf ~/.erdbpro
```

---

Built with React, Vite, Express, Prisma, and Commander.js.  
[GitHub](https://github.com/hadziqmtqn/erd-builder-pro)
