import { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from "express";
import { prisma } from "../../lib/prisma.js";
import { isDesktopMode } from "../../lib/config.js";
import { encrypt, decrypt } from "../../lib/crypto.js";
import type { ConnectionInfo, DbType } from "../../lib/db-connectors/types.js";

// ── Desktop-only guard ──
export function desktopOnly(_req: ExpressRequest, res: ExpressResponse, next: NextFunction) {
  if (!isDesktopMode()) {
    return res.status(404).json({ error: "Not available" });
  }
  next();
}

// ── Helpers ──
export function buildConnectionInfo(conn: {
  type: string;
  host?: string | null;
  port?: number | null;
  user?: string | null;
  password?: string | null;
  database: string;
}): ConnectionInfo {
  return {
    type: conn.type as DbType,
    host: conn.host ?? undefined,
    port: conn.port ?? undefined,
    user: conn.user ?? undefined,
    password: conn.password ? decrypt(conn.password) : undefined,
    database: conn.database,
  };
}

export function maskPassword(obj: Record<string, unknown>): Record<string, unknown> {
  return { ...obj, password: (obj as any).password ? "***" : null };
}

// ── Auto-migration on first load ──
let migrationDone = false;
export async function runStartupMigration() {
  if (migrationDone || !prisma) return;
  migrationDone = true;
  try {
    // Skip migration for SQLite (desktop mode) — information_schema doesn't exist
    if (isDesktopMode()) return;

    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'local_db_connections'"
    ).catch(() => []);
    if (!tables || tables.length === 0) return;

    const oldConns = await prisma.$queryRawUnsafe<any[]>(
      "SELECT * FROM local_db_connections"
    ).catch(() => []);
    if (!oldConns || oldConns.length === 0) return;

    console.log(`[migrate] Migrating ${oldConns.length} local_db_connections → DbAccount + DbCatalog`);

    for (const conn of oldConns) {
      const existing = await prisma.dbCatalog.findFirst({
        where: { account: { userId: conn.user_id }, databaseName: conn.database },
      });
      if (existing) continue;

      const account = await prisma.dbAccount.create({
        data: {
          userId: conn.user_id,
          name: conn.name,
          type: conn.type,
          host: conn.host || "",
          port: conn.port ? Number(conn.port) : undefined,
          user: conn.user || "",
          password: conn.password ? encrypt(String(conn.password)) : "",
        },
      });

      const catalog = await prisma.dbCatalog.create({
        data: { accountId: account.id, databaseName: conn.database, label: conn.name },
      });

      await prisma.diagram.updateMany({
        where: { userId: conn.user_id, sourceConnectionId: conn.id },
        data: { sourceConnectionId: catalog.id },
      });
    }

    console.log("[migrate] Migration complete");
  } catch (err) {
    console.error("[migrate] Error (non-fatal):", err);
  }
}

// Run on import
runStartupMigration();
