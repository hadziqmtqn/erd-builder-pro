import { prisma } from "../../lib/prisma.js";
import { encrypt } from "../../lib/crypto.js";
import { isDesktopMode } from "../../lib/config.js";

export async function runUserMigration(userId: string) {
  // Skip for SQLite
  if (isDesktopMode()) {
    return { migrated: 0, message: "Migration not needed for SQLite" };
  }

  // Check if old table exists
  const tables = await prisma?.$queryRawUnsafe<{ table_name: string }[]>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'local_db_connections'"
  );
  if (!tables || tables.length === 0) {
    return { migrated: 0, message: "No old connections to migrate" };
  }

  const oldConns = await prisma?.$queryRawUnsafe<any[]>(
    "SELECT * FROM local_db_connections WHERE user_id = $1",
    userId
  );
  if (!oldConns || oldConns.length === 0) {
    return { migrated: 0, message: "No old connections to migrate" };
  }

  const results: { oldId: number; newCatalogId?: number }[] = [];
  for (const conn of oldConns) {
    const account = await prisma?.dbAccount.create({
      data: {
        userId,
        name: conn.name,
        type: conn.type,
        host: conn.host || "",
        port: conn.port ? Number(conn.port) : undefined,
        user: conn.user || "",
        password: conn.password ? encrypt(conn.password) : "",
      },
    });
    if (!account) continue;

    const catalog = await prisma?.dbCatalog.create({
      data: {
        accountId: account.id,
        databaseName: conn.database,
        label: conn.name,
      },
    });

    if (catalog) {
      // Update diagrams pointing to old connection id
      await prisma?.diagram.updateMany({
        where: { userId, sourceConnectionId: conn.id },
        data: { sourceConnectionId: catalog.id },
      });
    }

    results.push({ oldId: conn.id, newCatalogId: catalog?.id });
  }

  return { migrated: results.length, results };
}
