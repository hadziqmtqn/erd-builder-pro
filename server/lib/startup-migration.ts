import { prisma } from "./prisma.js";
import { randomUUID } from "crypto";
import { logger } from "./logger.js";
import { isDesktopMode, isLocalPostgres } from "./config.js";
import { isUuid, replaceColumnIdInHandle } from "./erd-column-id-migration.js";

type PrismaRecord = { id: number | bigint | string };

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
 * Uses PRAGMA table_info to check, then runs ALTER TABLE ADD COLUMN.
 * Safe for SQLite — no-op if column already present.
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
    if (isLocalPostgres()) {
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
  // Supabase uses managed migrations. Installed SQLite/CLI Postgres self-heal here.
  if (!prisma || (!isDesktopMode() && !isLocalPostgres())) return;

  // v2.4+ — destinations column on backups table
  await addColumnIfMissing("backups", "destinations", "destinations TEXT");

  // v3.1.4+ — persist DBML source alongside ERD canvas data
  await addColumnIfMissing("diagrams", "dbml_source", '"dbml_source" TEXT');

  // v3.2+ — ERD column comments and type modifier metadata.
  await addColumnIfMissing("columns", "comment", '"comment" TEXT');
  await addColumnIfMissing("columns", "max_length", '"max_length" INTEGER');
  await addColumnIfMissing("columns", "numeric_precision", '"numeric_precision" INTEGER');
  await addColumnIfMissing("columns", "numeric_scale", '"numeric_scale" INTEGER');
  if (isDesktopMode()) await createSqlQueriesTableIfMissing();

  // v3.1.4+ — normalize old random column ids and keep relationships wired.
  if (isDesktopMode()) await normalizeLegacyColumnIds();
}
