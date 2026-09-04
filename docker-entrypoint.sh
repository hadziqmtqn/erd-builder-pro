#!/bin/sh
set -e

echo "=== ERD Builder Pro — Entrypoint ==="

# ── Detect database mode ──
if [ -n "$SUPABASE_URL" ]; then
  # Supabase mode — additive schema self-heal runs in server/run.ts.
  # Keep db push out of this entrypoint because Supabase is managed PostgreSQL.
  echo "Mode: Supabase PostgreSQL — additive startup migration handled by the app"
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

  # Extract database name from URL: postgresql://user:***@host:port/dbname?params
  DB_NAME=$(echo "$DATABASE_URL" | awk -F'/' '{print $NF}' | awk -F'?' '{print $1}')

  # Wait for PostgreSQL to be reachable (handles container startup races)
  echo "Waiting for PostgreSQL to accept connections..."
  for i in $(seq 1 30); do
    if psql "$DATABASE_URL" -c "SELECT 1" >/dev/null 2>&1; then
      echo "PostgreSQL ready after ${i}s"
      break
    fi
    if [ "$i" -eq 30 ]; then
      echo "ERROR: PostgreSQL not reachable within timeout — continuing anyway"
    fi
    sleep 1
  done

  if [ -n "$DB_NAME" ] && [ "$DB_NAME" != "postgres" ]; then
    # Build admin URL pointing to the default 'postgres' database (always exists).
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
echo "Regenerating Prisma client for ${SCHEMA_VARIANT} schema..."
npx prisma generate

# ── Push schema to database (BEFORE server start) ──
# MUST run before server — server creates empty SQLite DB file on connect,
# which breaks the old "skip if exists" check and bypasses migration entirely.
if [ "$SCHEMA_VARIANT" = "sqlite" ]; then
  echo "Running Prisma schema push for sqlite..."
  npx prisma db push --accept-data-loss || echo "WARNING: Schema push failed, continuing anyway"
elif [ -n "$SCHEMA_VARIANT" ]; then
  echo "Running Prisma schema push for ${SCHEMA_VARIANT}..."
  npx prisma db push || echo "WARNING: Schema push failed, continuing anyway"
fi

# ── Seed initial data (BEFORE server start) ──
echo "Seeding initial data..."
npx tsx prisma/seed.sqlite.ts || echo "WARNING: Seeding failed (non-fatal)"

# ── Start server in background ──
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

# ── Handle Docker stop signals ──
trap "echo 'Stopping server...'; kill $SERVER_PID 2>/dev/null; exit 0" SIGTERM SIGINT SIGQUIT

echo "=== Entrypoint complete — server running on port 3000 ==="
# Keep server running in foreground
wait $SERVER_PID
