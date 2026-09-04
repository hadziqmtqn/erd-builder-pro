import { prisma } from "./prisma.js";
import { createHash, randomUUID } from "crypto";
import { logger } from "./logger.js";
import { isDesktopMode, isLocalPostgres, SUPABASE_URL } from "./config.js";
import { isUuid, replaceColumnIdInHandle } from "./erd-column-id-migration.js";
import { migrateDbClients } from "./db-client-migration.js";

type PrismaRecord = { id: number | bigint | string };

const SHAREABLE_FILE_TABLES = ["diagrams", "notes", "drawings", "flowcharts"] as const;

function isPostgresDatabase(): boolean {
  const url = process.env.DATABASE_URL || "";
  return url.startsWith("postgresql://") || url.startsWith("postgres://");
}

function postgresDateType(): string {
  return SUPABASE_URL ? "TIMESTAMPTZ(6)" : "TIMESTAMP(3)";
}

async function backfillModelUids<T extends PrismaRecord>(
  name: string,
  findMany: () => Promise<T[]>,
  updateOne: (id: T["id"], uid: string) => Promise<unknown>,
): Promise<void> {
  const records = await findMany();
  if (records.length === 0) return;

  for (const record of records) {
    await updateOne(record.id, randomUUID());
  }
  logger.info({ count: records.length, model: name }, "Backfilled uids");
}

/**
 * Backfills `uid` for existing records that have a null uid.
 * Required for SQLite where @default(dbgenerated("gen_random_uuid()"))
 * is not available — only PostgreSQL supports that.
 */
export async function backfillUids(): Promise<void> {
  if (!prisma) return;

  try {
    await backfillModelUids(
      "project",
      () => prisma!.project.findMany({ where: { uid: null }, select: { id: true } }),
      (id, uid) => prisma!.project.update({ where: { id: id as never }, data: { uid } }),
    );
    await backfillModelUids(
      "diagram",
      () => prisma!.diagram.findMany({ where: { uid: null }, select: { id: true } }),
      (id, uid) => prisma!.diagram.update({ where: { id: id as never }, data: { uid } }),
    );
    await backfillModelUids(
      "note",
      () => prisma!.note.findMany({ where: { uid: null }, select: { id: true } }),
      (id, uid) => prisma!.note.update({ where: { id: id as never }, data: { uid } }),
    );
    await backfillModelUids(
      "drawing",
      () => prisma!.drawing.findMany({ where: { uid: null }, select: { id: true } }),
      (id, uid) => prisma!.drawing.update({ where: { id: id as never }, data: { uid } }),
    );
    await backfillModelUids(
      "flowchart",
      () => prisma!.flowchart.findMany({ where: { uid: null }, select: { id: true } }),
      (id, uid) => prisma!.flowchart.update({ where: { id: id as never }, data: { uid } }),
    );
    await backfillModelUids(
      "aiChatSession",
      () => prisma!.aiChatSession.findMany({ where: { uid: null }, select: { id: true } }),
      (id, uid) => prisma!.aiChatSession.update({ where: { id: id as never }, data: { uid } }),
    );
    if (isDesktopMode()) {
      await backfillModelUids(
        "sqlQuery",
        () => (prisma as any).sqlQuery.findMany({ where: { uid: null }, select: { id: true } }),
        (id, uid) => (prisma as any).sqlQuery.update({ where: { id: id as never }, data: { uid } }),
      );
    }
  } catch (err) {
    logger.error({ err }, "Failed to backfill uids");
  }
}

/**
 * Add a column to a table if it doesn't already exist.
 * Uses information_schema for PostgreSQL and PRAGMA for SQLite, then runs
 * ALTER TABLE ADD COLUMN. Safe to rerun — no-op if the column is present.
 */
export type ColumnInfo = {
  name: string;
  type: string;
  notnull: boolean;
  dflt_value: string | null;
  pk: boolean;
};

async function getColumns(table: string): Promise<ColumnInfo[]> {
  if (!prisma) return [];
  try {
    if (isPostgresDatabase()) {
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT column_name AS name, data_type AS type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        table,
      );
      return rows.map((r: any) => ({
        name: r.name,
        type: (r.type || "TEXT").toUpperCase(),
        notnull: r.is_nullable === "NO",
        dflt_value: r.column_default,
        pk: false,
      }));
    }
    const rows: any[] = await prisma.$queryRawUnsafe(
      `PRAGMA table_info("${table}")`,
    );
    return rows.map((r: any) => ({
      name: r.name,
      type: (r.type || "TEXT").toUpperCase(),
      notnull: !!r.notnull,
      dflt_value: r.dflt_value,
      pk: !!r.pk,
    }));
  } catch {
    return [];
  }
}

async function addColumnIfMissing(
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  if (!prisma) return;
  try {
    const cols = await getColumns(table);
    if (cols.some((c) => c.name === column)) {
      logger.info({ table, column }, "Column already exists, skipping migration");
      return;
    }
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${table}" ADD COLUMN ${definition}`,
    );
    logger.info({ table, column }, "Column added via startup migration");
  } catch (err: any) {
    if (err?.message?.includes("no such table")) {
      logger.warn({ table }, "Table not found, skipping column migration");
      return;
    }
    logger.warn({ err: err?.message, table, column }, "Failed to add column (non-fatal)");
  }
}

async function ensureAiChatMessageIdempotency(): Promise<void> {
  if (!prisma) return;
  await addColumnIfMissing("ai_chat_messages", "client_message_id", '"client_message_id" VARCHAR(64)');
  try {
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "ai_chat_messages_session_id_client_message_id_key" ON "ai_chat_messages"("session_id", "client_message_id")',
    );
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Failed to create AI chat idempotency index (non-fatal)");
  }
}

export async function ensureRepositoryLinkColumns(): Promise<void> {
  if (!prisma || !isDesktopMode()) return;
  await addColumnIfMissing("diagrams", "repository_path", '"repository_path" TEXT');
  await addColumnIfMissing("diagrams", "repository_ref", '"repository_ref" TEXT');
  await addColumnIfMissing("diagrams", "repository_source_id", '"repository_source_id" TEXT');
}

async function createSqlQueriesTableIfMissing(): Promise<void> {
  if (!prisma || !isDesktopMode()) return;
  try {
    const cols = await getColumns("sql_queries");
    if (cols.length > 0) return;
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "sql_queries" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "uid" TEXT UNIQUE,
        "diagram_id" INTEGER NOT NULL,
        "group_name" TEXT NOT NULL DEFAULT 'Ungrouped',
        "name" TEXT NOT NULL,
        "script" TEXT NOT NULL,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "sql_queries_diagram_id_fkey" FOREIGN KEY ("diagram_id") REFERENCES "diagrams" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_sql_queries_diagram" ON "sql_queries"("diagram_id")`);
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Failed to create sql_queries table (non-fatal)");
  }
}

async function createDbConnectTablesIfMissing(): Promise<void> {
  if (!prisma || !isDesktopMode()) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "db_accounts" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "user_id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "host" TEXT,
        "port" INTEGER,
        "user" TEXT,
        "password" TEXT,
        "environment" TEXT NOT NULL DEFAULT 'development',
        "safe_mode" TEXT NOT NULL DEFAULT 'protected',
        "ssl_mode" TEXT NOT NULL DEFAULT 'disable',
        "ssl_ca" TEXT,
        "ssl_cert" TEXT,
        "ssl_key" TEXT,
        "query_timeout_ms" INTEGER NOT NULL DEFAULT 30000,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "db_catalogs" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "account_id" INTEGER NOT NULL,
        "database_name" TEXT NOT NULL,
        "label" TEXT,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "db_catalogs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "db_accounts" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_db_accounts_user" ON "db_accounts"("user_id")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_db_catalogs_account" ON "db_catalogs"("account_id")`);
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Failed to create DB Connect tables (non-fatal)");
  }
}

async function createTeamTablesIfMissing(): Promise<void> {
  if (!prisma || (!isDesktopMode() && !isLocalPostgres())) return;

  await addColumnIfMissing("projects", "team_id", '"team_id" TEXT');
  try {
    const dateType = isLocalPostgres() ? "TIMESTAMP(3)" : "DATETIME";
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "teams" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "license_id" TEXT UNIQUE,
        "license_code_last_four" TEXT,
        "license_status" TEXT NOT NULL DEFAULT 'active',
        "license_expires_at" ${dateType},
        "max_members" INTEGER,
        "binding_generation" INTEGER DEFAULT 0,
        "created_at" ${dateType} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" ${dateType} NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "team_members" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "team_id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'member',
        "status" TEXT NOT NULL DEFAULT 'active',
        "joined_at" ${dateType} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )`);
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "idx_teams_license_status" ON "teams"("license_status")');
    await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "team_members_team_user_key" ON "team_members"("team_id", "user_id")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "idx_team_members_user_status" ON "team_members"("user_id", "status")');
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Failed to create Team tables (non-fatal)");
  }
}

async function backfillLegacyFileAccess(table: string): Promise<void> {
  if (!prisma) return;

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "${table}"
       SET "public_access" = 'read_only'
       WHERE "public_access" = 'off' AND COALESCE("is_public", false) = true`,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "${table}"
       SET "share_expires_at" = "expiry_date"
       WHERE "share_expires_at" IS NULL AND "expiry_date" IS NOT NULL`,
    );

    const rows = await prisma.$queryRawUnsafe<{ id: number | bigint | string; token: string }[]>(
      `SELECT "id", "share_token" AS "token"
       FROM "${table}"
       WHERE "share_token" IS NOT NULL
         AND "share_token" <> ''
         AND "share_token_hash" IS NULL`,
    );

    for (const row of rows) {
      const hash = createHash("sha256").update(String(row.token), "utf8").digest("hex");
      if (isPostgresDatabase()) {
        await prisma.$executeRawUnsafe(
          `UPDATE "${table}" SET "share_token_hash" = $1 WHERE "id" = $2 AND "share_token_hash" IS NULL`,
          hash,
          row.id,
        );
      } else {
        await prisma.$executeRawUnsafe(
          `UPDATE "${table}" SET "share_token_hash" = ? WHERE "id" = ? AND "share_token_hash" IS NULL`,
          hash,
          row.id,
        );
      }
    }

    if (rows.length > 0) {
      logger.info({ table, count: rows.length }, "Backfilled legacy share token hashes");
    }
  } catch (err: any) {
    if (err?.message?.includes("no such table") || err?.message?.includes("does not exist")) {
      logger.warn({ table }, "File table not found, skipping access backfill");
      return;
    }
    logger.warn({ err: err?.message, table }, "Failed to backfill legacy file access");
  }
}

async function ensureFileAccessColumns(): Promise<void> {
  if (!prisma) return;

  const dateType = isPostgresDatabase() ? postgresDateType() : "DATETIME";
  for (const table of SHAREABLE_FILE_TABLES) {
    await addColumnIfMissing(table, "team_access", `"team_access" TEXT NOT NULL DEFAULT 'private'`);
    await addColumnIfMissing(table, "public_access", `"public_access" TEXT NOT NULL DEFAULT 'off'`);
    await addColumnIfMissing(table, "share_token_hash", '"share_token_hash" TEXT');
    await addColumnIfMissing(table, "share_expires_at", `"share_expires_at" ${dateType}`);
    await backfillLegacyFileAccess(table);
  }
}

async function createErdMetadataTablesIfMissing(): Promise<void> {
  if (!prisma) return;
  try {
    const textType = isLocalPostgres() ? "TEXT" : "TEXT";
    const dateType = isPostgresDatabase() ? postgresDateType() : "DATETIME";
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "table_constraints" (
        "id" ${textType} NOT NULL PRIMARY KEY,
        "entity_id" ${textType} NOT NULL,
        "kind" ${textType} NOT NULL,
        "name" ${textType},
        "column_ids" ${textType},
        "expression" ${textType},
        "created_at" ${dateType} DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "table_constraints_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_table_constraints_entity" ON "table_constraints"("entity_id")`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "table_indexes" (
        "id" ${textType} NOT NULL PRIMARY KEY,
        "entity_id" ${textType} NOT NULL,
        "name" ${textType} NOT NULL,
        "column_ids" ${textType} NOT NULL,
        "is_unique" BOOLEAN DEFAULT false,
        "algorithm" ${textType},
        "created_at" ${dateType} DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "table_indexes_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_table_indexes_entity" ON "table_indexes"("entity_id")`);
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Failed to create ERD metadata tables (non-fatal)");
  }
}

async function normalizeLegacyColumnIds(): Promise<void> {
  if (!prisma) return;

  try {
    const columns: { id: string }[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM "columns"`,
    );
    const legacy = columns.filter((column) => column.id && !isUuid(column.id));
    if (legacy.length === 0) return;

    await prisma.$transaction(async (tx) => {
      for (const column of legacy) {
        const newId = randomUUID();
        await tx.$executeRawUnsafe(
          `UPDATE "columns" SET "id" = ? WHERE "id" = ?`,
          newId,
          column.id,
        );
        const relationships: {
          id: string;
          source_column_id: string | null;
          target_column_id: string | null;
          source_handle: string | null;
          target_handle: string | null;
        }[] = await tx.$queryRawUnsafe(
          `SELECT id, source_column_id, target_column_id, source_handle, target_handle
           FROM "relationships"
           WHERE source_column_id = ? OR target_column_id = ?
             OR source_handle LIKE ? OR target_handle LIKE ?`,
          column.id,
          column.id,
          `%${column.id}%`,
          `%${column.id}%`,
        );
        for (const relationship of relationships) {
          await tx.$executeRawUnsafe(
            `UPDATE "relationships"
             SET source_column_id = ?, target_column_id = ?, source_handle = ?, target_handle = ?
             WHERE id = ?`,
            relationship.source_column_id === column.id ? newId : relationship.source_column_id,
            relationship.target_column_id === column.id ? newId : relationship.target_column_id,
            replaceColumnIdInHandle(relationship.source_handle, column.id, newId),
            replaceColumnIdInHandle(relationship.target_handle, column.id, newId),
            relationship.id,
          );
        }
      }
    }, { timeout: 30000 });

    logger.info({ count: legacy.length }, "Normalized legacy ERD column ids to UUIDs");
  } catch (err: any) {
    if (err?.message?.includes("no such table")) {
      logger.warn("ERD tables not found, skipping column id normalization");
      return;
    }
    logger.warn({ err: err?.message }, "Failed to normalize ERD column ids (non-fatal)");
  }
}

/**
 * Change a column's type by rebuilding the table.
 *
 * SQLite does NOT support ALTER COLUMN. The only safe way is:
 *   1. CREATE temp table with new schema
 *   2. INSERT ... SELECT (with optional CAST)
 *   3. DROP original → RENAME temp
 *
 * CRASH RISK: between DROP and RENAME data lives in temp table.
 * If crash occurs during that window, restart recovers:
 *   - original table gone, temp still there
 *   - re-run finds temp → renames it → completes
 *   - column type already matches → no-op next startup
 *
 * @param castExpr - SQL expression for casting existing data, e.g. "CAST(destinations AS INTEGER)"
 */
async function ensureColumnType(
  table: string,
  column: string,
  newType: string,       // e.g. "INTEGER"
  castExpr?: string,
): Promise<void> {
  if (!prisma) return;

  try {
    // ── Recover from previous crash ──
    // If original table is missing but temp exists, rename temp back.
    const tempName = `__migrate_${table}_new`;
    const tempCols = await getColumns(tempName);
    const origCols = await getColumns(table);
    const origExists = origCols.length > 0;

    if (!origExists && tempCols.length > 0) {
      logger.warn({ tempName }, "Crash recovery: original table missing, renaming temp");
      await prisma.$executeRawUnsafe(`ALTER TABLE "${tempName}" RENAME TO "${table}"`);
      logger.info({ table }, "Crash recovery complete");
      return;
    }
    if (origExists && tempCols.length > 0) {
      // Both exist — previous migration crashed after CREATE but before DROP.
      // Clean up temp and retry fresh.
      logger.warn({ tempName }, "Crash recovery: orphan temp table exists, dropping it");
      await prisma.$executeRawUnsafe(`DROP TABLE "${tempName}"`);
    }

    // ── Check current type ──
    const existing = origCols.find((c) => c.name === column);
    if (!existing) {
      // Column missing — add it instead
      logger.info({ table, column }, "Column missing, adding via ALTER TABLE");
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "${table}" ADD COLUMN "${column}" ${newType}`,
      );
      return;
    }

    const normal = (t: string) => t.replace(/\s+/g, "");
    if (normal(existing.type) === normal(newType.toUpperCase())) {
      logger.info({ table, column, type: existing.type }, "Column type matches, skipping");
      return;
    }

    logger.info(
      { table, column, from: existing.type, to: newType },
      "Column type changed — rebuilding table",
    );

    // ── Get indexes ──
    const idxList: any[] = await prisma.$queryRawUnsafe(
      `PRAGMA index_list("${table}")`,
    );
    const indexes: { name: string; unique: boolean; columns: string[] }[] = [];
    for (const idx of idxList) {
      if ((idx.name as string).startsWith("sqlite_autoindex")) continue;
      const cols: any[] = await prisma.$queryRawUnsafe(
        `PRAGMA index_info("${idx.name}")`,
      );
      indexes.push({
        name: idx.name,
        unique: !!idx.unique,
        columns: cols.map((c: any) => c.name),
      });
    }

    // ── Build CREATE TABLE ──
    const pkCols = origCols.filter((c) => c.pk).map((c) => `"${c.name}"`);
    const colDefs = origCols.map((c) => {
      const type = c.name === column ? newType : c.type;
      const parts = [`"${c.name}"`, type];
      if (c.notnull) parts.push("NOT NULL");
      if (c.dflt_value !== null) parts.push(`DEFAULT ${c.dflt_value}`);
      return parts.join(" ");
    });
    if (pkCols.length > 0) colDefs.push(`PRIMARY KEY (${pkCols.join(", ")})`);

    await prisma.$executeRawUnsafe(`PRAGMA foreign_keys = OFF`);

    try {
      await prisma.$executeRawUnsafe(
        `CREATE TABLE "${tempName}" (\n  ${colDefs.join(",\n  ")}\n)`,
      );

      // ── Copy data with optional CAST ──
      const selectCols = origCols
        .map((c) => (c.name === column && castExpr ? castExpr : `"${c.name}"`))
        .join(", ");
      await prisma.$executeRawUnsafe(
        `INSERT INTO "${tempName}" SELECT ${selectCols} FROM "${table}"`,
      );

      // ── Swap ──
      await prisma.$executeRawUnsafe(`DROP TABLE "${table}"`);
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "${tempName}" RENAME TO "${table}"`,
      );

      // ── Recreate indexes ──
      for (const idx of indexes) {
        const uq = idx.unique ? "UNIQUE " : "";
        const ic = idx.columns.map((c) => `"${c}"`).join(", ");
        await prisma.$executeRawUnsafe(
          `CREATE ${uq}INDEX "${idx.name}" ON "${table}" (${ic})`,
        );
      }

      logger.info({ table, column }, "Table rebuilt for column type change");
    } catch (err) {
      // Cleanup temp table on failure
      try {
        const stillThere = await getColumns(tempName);
        if (stillThere.length > 0)
          await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${tempName}"`);
      } catch { /* best-effort */ }
      throw err;
    } finally {
      await prisma.$executeRawUnsafe(`PRAGMA foreign_keys = ON`);
    }
  } catch (err: any) {
    if (err?.message?.includes("no such table")) {
      logger.warn({ table }, "Table not found, skipping migration");
      return;
    }
    logger.warn(
      { err: err?.message, table, column },
      "Failed to change column type (non-fatal)",
    );
  }
}

/**
 * Apply incremental schema changes for columns added in newer app versions.
 * Called once at startup alongside backfillUids.
 *
 * How to add a new column (always safe):
 *   await addColumnIfMissing("backups", "destinations", "destinations TEXT");
 *
 * How to change a column TYPE (table rebuild, SQLite only):
 *   await ensureColumnType("backups", "destinations", "INTEGER", "CAST(destinations AS INTEGER)");
 *   //                 table ──┘    column ───────┘      new type ────┘   cast expression ────────────────────────┘
 *   // castExpr is optional — omit if existing data is compatible (e.g. TEXT→VARCHAR)
 */
export async function applySchemaMigrations(): Promise<void> {
  // Additive startup self-heal for installed SQLite and PostgreSQL deployments.
  if (!prisma || (!isDesktopMode() && !isPostgresDatabase())) return;

  // v2.4+ — destinations column on backups table
  await addColumnIfMissing("backups", "destinations", "destinations TEXT");
  await addColumnIfMissing("user_preferences", "auto_backup_enabled", '"auto_backup_enabled" BOOLEAN DEFAULT false');
  await addColumnIfMissing("user_preferences", "auto_backup_interval", '"auto_backup_interval" INTEGER DEFAULT 3600');
  await addColumnIfMissing("user_preferences", "auto_backup_retention", '"auto_backup_retention" INTEGER DEFAULT 10');
  await addColumnIfMissing("user_preferences", "storage_config", '"storage_config" TEXT');

  // v3.1.4+ — persist DBML source alongside ERD canvas data
  await addColumnIfMissing("diagrams", "dbml_source", '"dbml_source" TEXT');
  await addColumnIfMissing("diagrams", "source_type", '"source_type" TEXT DEFAULT \'blank\'');
  await addColumnIfMissing("diagrams", "source_connection_id", '"source_connection_id" INTEGER');
  await addColumnIfMissing("diagrams", "data", '"data" TEXT');

  // v3.2+ — ERD column comments and type modifier metadata.
  await addColumnIfMissing("columns", "comment", '"comment" TEXT');
  await addColumnIfMissing("columns", "max_length", '"max_length" INTEGER');
  await addColumnIfMissing("columns", "numeric_precision", '"numeric_precision" INTEGER');
  await addColumnIfMissing("columns", "numeric_scale", '"numeric_scale" INTEGER');
  await addColumnIfMissing("columns", "default_value", '"default_value" TEXT');
  await addColumnIfMissing("columns", "is_unique", '"is_unique" BOOLEAN DEFAULT false');
  await addColumnIfMissing("entities", "comment", '"comment" TEXT');
  await addColumnIfMissing("relationships", "on_delete", '"on_delete" TEXT');
  await addColumnIfMissing("relationships", "on_update", '"on_update" TEXT');
  await addColumnIfMissing("relationships", "constraint_name", '"constraint_name" TEXT');
  await ensureFileAccessColumns();
  await ensureAiChatMessageIdempotency();
  await createErdMetadataTablesIfMissing();
  await createTeamTablesIfMissing();
  if (isDesktopMode()) {
    // v3.4.3+ — local Repository-Aware ERD link used by Desktop/CLI MCP.
    await ensureRepositoryLinkColumns();
    await createDbConnectTablesIfMissing();
    await createSqlQueriesTableIfMissing();
    await migrateDbClients();
    await addColumnIfMissing("db_accounts", "environment", '"environment" TEXT NOT NULL DEFAULT \'development\'');
    await addColumnIfMissing("db_accounts", "safe_mode", '"safe_mode" TEXT NOT NULL DEFAULT \'protected\'');
    await addColumnIfMissing("db_accounts", "ssl_mode", '"ssl_mode" TEXT NOT NULL DEFAULT \'disable\'');
    await addColumnIfMissing("db_accounts", "ssl_ca", '"ssl_ca" TEXT');
    await addColumnIfMissing("db_accounts", "ssl_cert", '"ssl_cert" TEXT');
    await addColumnIfMissing("db_accounts", "ssl_key", '"ssl_key" TEXT');
    await addColumnIfMissing("db_accounts", "query_timeout_ms", '"query_timeout_ms" INTEGER NOT NULL DEFAULT 30000');
  }

  // v3.1.4+ — normalize old random column ids and keep relationships wired.
  if (isDesktopMode()) await normalizeLegacyColumnIds();
}
