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

  # Extract database name from URL: postgresql://user:pass@host:port/dbname?params
  # Split by /, take last segment, strip query params
  DB_NAME=$(echo "$DATABASE_URL" | awk -F'/' '{print $NF}' | awk -F'?' '{print $1}')

  if [ -n "$DB_NAME" ] && [ "$DB_NAME" != "postgres" ]; then
    # Build admin URL pointing to the default 'postgres' database (always exists).
    # Simple string replacement: change only the database path segment, keep query params intact.
    ADMIN_URL=$(echo "$DATABASE_URL" | sed "s|/$DB_NAME|/postgres|")
    echo "Ensuring database \"${DB_NAME}\" exists..."
    if psql "$ADMIN_URL" -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
      echo "Database \"${DB_NAME}\" already exists"
    else
      echo "Creating database \"${DB_NAME}\"..."
      psql "$ADMIN_URL" -c "CREATE DATABASE \"${DB_NAME}\""
      echo "Database created successfully"
    fi
  else
    echo "Database name is '${DB_NAME}' — skipping creation (must be the 'postgres' admin database)"
  fi

  SCHEMA_VARIANT="pg"
else
  echo "WARNING: Unrecognized DATABASE_URL format. Starting without migration."
  exec "$@"
fi

export DB_VARIANT="$SCHEMA_VARIANT"

# ── Regenerate Prisma client ──
# Critical: the build stage generates the client for Supabase schema, but at
# runtime we may need SQLite or local PG schema. Without regeneration, the
# client will have the wrong User model (e.g. auth.users fields) causing
# seed scripts and upsert queries to fail.
echo "Regenerating Prisma client for ${SCHEMA_VARIANT} schema..."
npx prisma generate

# ── Check if database is already initialized ──
# Skip prisma db push when tables already exist to avoid PostgreSQL internal
# catalog conflict errors (P2002 on pg_type.typname + typnamespace).
needs_migration=true
if [ "$SCHEMA_VARIANT" = "sqlite" ]; then
  if [ -f "$DATA_DIR/erd-builder.db" ]; then
    echo "SQLite database already exists — skipping migration"
    needs_migration=false
  fi
elif [ "$SCHEMA_VARIANT" = "pg" ]; then
  if psql "$DATABASE_URL" -c "SELECT 1 FROM users LIMIT 1" >/dev/null 2>&1; then
    echo "PostgreSQL database already initialized — skipping migration"
    needs_migration=false
  fi
fi

# ── Start server in background ──
# This is the KEY fix for Dokploy/Traefik Bad Gateway. By starting the Node
# server BEFORE running prisma db push, port 3000 opens quickly and Traefik
# can route traffic immediately. The health endpoint (/api/health) returns
# OK without querying the database, so it works even before tables exist.
echo "Starting server in background..."
npm start &
SERVER_PID=$!

# Wait for server to be ready on port 3000
echo "Waiting for server to accept connections..."
for i in $(seq 1 90); do
  if wget -q --spider http://127.0.0.1:3000/api/health 2>/dev/null; then
    echo "Server is ready on port 3000"
    break
  fi
  if [ "$i" -eq 90 ]; then
    echo "WARNING: Server did not become ready within timeout"
  fi
  sleep 1
done

# ── Run migration ──
if [ "$needs_migration" = true ]; then
  echo "Running Prisma schema migration for ${SCHEMA_VARIANT}..."
  npx prisma db push --accept-data-loss || echo "WARNING: Migration failed, continuing anyway"
fi

# ── Seed initial data ──
# Tables now exist (either from this deploy or a previous one). Run the seed
# script which is fully idempotent — it checks if data already exists before
# inserting. Safe to run on every deploy.
echo "Seeding initial data..."
npx tsx prisma/seed.sqlite.ts || echo "WARNING: Seeding failed (non-fatal)"

# ── Handle Docker stop signals ──
trap "echo 'Stopping server...'; kill $SERVER_PID 2>/dev/null; exit 0" SIGTERM SIGINT SIGQUIT

echo "=== Entrypoint complete — server running on port 3000 ==="
# Keep server running in foreground
wait $SERVER_PID
