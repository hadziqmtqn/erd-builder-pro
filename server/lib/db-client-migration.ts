import { randomUUID } from "crypto";
import { prisma } from "./prisma.js";
import { logger } from "./logger.js";
import { isDesktopMode } from "./config.js";

const EMPTY_LAYOUT = '{"nodes":{},"viewport":{"x":0,"y":0,"zoom":1}}';

export function legacyDbClientLayout(value: unknown): string {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return JSON.stringify({
      nodes: parsed.nodes && typeof parsed.nodes === "object" ? parsed.nodes : {},
      viewport: parsed.viewport && typeof parsed.viewport === "object" ? parsed.viewport : { x: 0, y: 0, zoom: 1 },
      _type: "production_db_positions",
    });
  } catch {
    return EMPTY_LAYOUT;
  }
}

export async function migrateDbClients(): Promise<void> {
  if (!prisma || !isDesktopMode()) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "db_clients" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "uid" TEXT NOT NULL UNIQUE,
      "name" TEXT NOT NULL, "user_id" TEXT NOT NULL, "project_id" INTEGER,
      "catalog_id" INTEGER, "legacy_diagram_id" INTEGER UNIQUE,
      "is_deleted" BOOLEAN NOT NULL DEFAULT false, "deleted_at" DATETIME,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "_version" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "db_clients_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE SET NULL ON UPDATE NO ACTION,
      CONSTRAINT "db_clients_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "db_catalogs" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
    )`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "db_client_layouts" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "db_client_id" INTEGER NOT NULL UNIQUE,
      "data" TEXT NOT NULL DEFAULT '${EMPTY_LAYOUT}', "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "db_client_layouts_client_id_fkey" FOREIGN KEY ("db_client_id") REFERENCES "db_clients" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
    )`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "db_client_queries" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "uid" TEXT NOT NULL UNIQUE,
      "db_client_id" INTEGER NOT NULL, "legacy_query_id" INTEGER UNIQUE,
      "group_name" TEXT NOT NULL DEFAULT 'Ungrouped', "name" TEXT NOT NULL, "script" TEXT NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "db_client_queries_client_id_fkey" FOREIGN KEY ("db_client_id") REFERENCES "db_clients" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
    )`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_db_clients_user_deleted" ON "db_clients"("user_id", "is_deleted")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_db_clients_project_deleted" ON "db_clients"("project_id", "is_deleted")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_db_clients_catalog" ON "db_clients"("catalog_id")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_db_client_queries_client" ON "db_client_queries"("db_client_id")`);

  const legacy: any[] = await prisma.$queryRawUnsafe(`
    SELECT d.* FROM "diagrams" d LEFT JOIN "db_clients" c ON c."legacy_diagram_id" = d."id"
    WHERE d."source_type" = 'production_db' AND c."id" IS NULL
  `);
  for (const diagram of legacy) {
    const fallbackUser = diagram.user_id ? null : (await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM "users" LIMIT 1`))[0];
    const userId = diagram.user_id || fallbackUser?.id;
    if (!userId) {
      logger.warn({ diagramId: diagram.id }, "Skipped legacy DB Client without an owning user");
      continue;
    }
    await prisma.$transaction(async tx => {
      const catalogExists = diagram.source_connection_id != null
        && (await tx.$queryRawUnsafe<any[]>(`SELECT "id" FROM "db_catalogs" WHERE "id" = ? LIMIT 1`, diagram.source_connection_id)).length > 0;
      const projectExists = diagram.project_id != null
        && (await tx.$queryRawUnsafe<any[]>(`SELECT "id" FROM "projects" WHERE "id" = ? LIMIT 1`, diagram.project_id)).length > 0;
      await tx.$executeRawUnsafe(
        `INSERT INTO "db_clients" ("uid", "name", "user_id", "project_id", "catalog_id", "legacy_diagram_id", "is_deleted", "deleted_at", "created_at", "updated_at", "_version") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        diagram.uid || randomUUID(), diagram.name, String(userId), projectExists ? diagram.project_id : null,
        catalogExists ? diagram.source_connection_id : null, diagram.id, diagram.is_deleted || false,
        diagram.deleted_at, diagram.created_at || new Date(), diagram.updated_at || new Date(), diagram._version || 0,
      );
      const [{ id }] = await tx.$queryRawUnsafe<any[]>(`SELECT "id" FROM "db_clients" WHERE "legacy_diagram_id" = ?`, diagram.id);
      await tx.$executeRawUnsafe(
        `INSERT OR IGNORE INTO "db_client_layouts" ("db_client_id", "data", "created_at", "updated_at") VALUES (?, ?, ?, ?)`,
        id, legacyDbClientLayout(diagram.data), diagram.created_at || new Date(), diagram.updated_at || new Date(),
      );
      const queries = await tx.$queryRawUnsafe<any[]>(`SELECT * FROM "sql_queries" WHERE "diagram_id" = ?`, diagram.id);
      for (const query of queries) {
        await tx.$executeRawUnsafe(
          `INSERT OR IGNORE INTO "db_client_queries" ("uid", "db_client_id", "legacy_query_id", "group_name", "name", "script", "created_at", "updated_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          query.uid || randomUUID(), id, query.id, query.group_name || "Ungrouped", query.name, query.script,
          query.created_at || new Date(), query.updated_at || new Date(),
        );
      }
    });
  }
  if (legacy.length) logger.info({ count: legacy.length }, "Migrated legacy DB Client diagrams");
}
