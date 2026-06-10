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

# ── Migrate + Generate Prisma Client ──
# Client regeneration is critical because the build stage generates for Supabase,
# but runtime may use SQLite or local PG.
echo "Running Prisma schema migration for ${SCHEMA_VARIANT}..."
npx prisma db push --accept-data-loss

echo "=== Entrypoint complete — starting server ==="
exec "$@"
