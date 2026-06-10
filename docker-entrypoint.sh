#!/bin/sh
set -e

echo "=== ERD Builder Pro — Entrypoint ==="

# ── Detect database mode ──
if [ -n "$SUPABASE_URL" ]; then
  # Supabase mode — client was generated at build time, no migration needed
  echo "Mode: Supabase PostgreSQL — no migration needed"
  exec "$@"
fi

SCHEMA_VARIANT=""
if [ -z "$DATABASE_URL" ] || echo "$DATABASE_URL" | grep -qE "^(file:|\.db$)"; then
  # ── SQLite mode (self-contained, zero-config) ──
  echo "Mode: SQLite (self-contained)"
  SCHEMA_VARIANT="sqlite"

  # Use path inside the /app/data volume mount so data persists
  DATA_DIR="${PWD}/data"
  mkdir -p "$DATA_DIR"
  DATABASE_URL="file:${DATA_DIR}/erd-builder.db"
  export DATABASE_URL
elif echo "$DATABASE_URL" | grep -q "^postgresql://"; then
  # ── Local PostgreSQL mode ──
  echo "Mode: Local PostgreSQL"
  SCHEMA_VARIANT="pg"
else
  echo "WARNING: Unrecognized DATABASE_URL format. Starting without migration."
  exec "$@"
fi

export DB_VARIANT="$SCHEMA_VARIANT"

# ── Check if database is already initialized ──
# Skip prisma db push when tables already exist to avoid PostgreSQL internal
# catalog conflict errors (P2002 on pg_type.typname + typnamespace).
needs_migration=true
if [ "$SCHEMA_VARIANT" = "sqlite" ]; then
  # SQLite: check if the data file already exists
  if [ -f "$DATA_DIR/erd-builder.db" ]; then
    echo "SQLite database already exists — skipping migration"
    needs_migration=false
  fi
elif [ "$SCHEMA_VARIANT" = "pg" ]; then
  # PostgreSQL: probe for users table using psql (installed in Dockerfile)
  if psql "$DATABASE_URL" -c "SELECT 1 FROM users LIMIT 1" >/dev/null 2>&1; then
    echo "PostgreSQL database already initialized — skipping migration"
    needs_migration=false
  fi
fi

if [ "$needs_migration" = true ]; then
  echo "Running Prisma schema migration for ${SCHEMA_VARIANT}..."
  npx prisma db push --accept-data-loss
  exit_code=$?
  if [ $exit_code -ne 0 ]; then
    # If migration fails but server might still work (e.g. pre-existing tables),
    # log the warning and continue
    echo "WARNING: Migration exit code ${exit_code}. Attempting to start server anyway."
  fi
fi

echo "=== Entrypoint complete — starting server ==="
exec "$@"
