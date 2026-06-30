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

Login with:
- **Email:** `admin@local.dev`
- **Password:** `admin123`

Data stored in `~/.erdbpro/`. SQLite by default, PostgreSQL supported.

---

## Commands

```bash
erdbpro                          # Start server + open browser
erdbpro start                    # Same as above
erdbpro start --background       # Run in background (detached)
erdbpro start --port 4000        # Custom port
erdbpro start --no-open          # Don't open browser
erdbpro start --force            # Restart if already running
erdbpro stop                     # Stop background server
erdbpro status                   # Check if server is running
```

---

## Database Options

**SQLite (default):** Zero config. Database created automatically in `~/.erdbpro/data.db`.

**PostgreSQL:**
```bash
erdbpro start --db-url postgresql://user:pass@localhost:5432/erdbpro
```

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

```bash
npm update -g erdbpro
erdbpro start --force       # Stop old + start new
```

Amber dot badge appears on the nav-user avatar in the web app when a newer version is available.

---

## Features

All features identical to the desktop app:
- **ERD Diagrams** — design database schemas with React Flow
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
  └── config.json      # User preferences (future)
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
