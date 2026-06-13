import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../lib/middleware.js";
import { isDesktopMode } from "../lib/config.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import type { ConnectionInfo, DbType } from "../lib/db-connectors/types.js";
import { testConnection, fetchSchema, getConnector } from "../lib/db-connectors/registry.js";

const router = Router();

// ── Auto-migration on first load ──
let migrationDone = false;
async function runStartupMigration() {
  if (migrationDone || !prisma) return;
  migrationDone = true;
  try {
    const tables = await prisma.$queryRawUnsafe<{table_name: string}[]>(
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
runStartupMigration();

// ── Desktop-only guard ──
function desktopOnly(_req: ExpressRequest, res: ExpressResponse, next: Function) {
  if (!isDesktopMode()) {
    return res.status(404).json({ error: "Not available" });
  }
  next();
}

function buildConnectionInfo(conn: any): ConnectionInfo {
  return {
    type: conn.type as DbType,
    host: conn.host || undefined,
    port: conn.port || undefined,
    user: conn.user || undefined,
    password: conn.password ? decrypt(conn.password) : undefined,
    database: conn.database,
  };
}

function maskPassword(obj: any): any {
  return { ...obj, password: obj.password ? "***" : null };
}

// ══════════════════════════════════════════
// DB Account routes (/api/accounts)
// ══════════════════════════════════════════

// GET /api/accounts — list all accounts
router.get("/accounts", authenticate, desktopOnly, async (_req: ExpressRequest, res: ExpressResponse) => {
  const userId = (_req as any).user.id;
  try {
    const accounts = await prisma?.dbAccount.findMany({
      where: { userId },
      include: { _count: { select: { catalogs: true } } },
      orderBy: { updatedAt: "desc" },
    });
    res.json((accounts || []).map(maskPassword));
  } catch (err) {
    console.error("Error listing accounts:", err);
    res.status(500).json({ error: "Failed to list accounts" });
  }
});

// POST /api/accounts — create account
router.post("/accounts", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { name, type, host, port, user, password } = req.body;

  if (!name || !type) {
    return res.status(400).json({ error: "name and type are required" });
  }

  try {
    const encryptedPw = password ? encrypt(password) : null;
    const account = await prisma?.dbAccount.create({
      data: {
        userId,
        name,
        type,
        host,
        port: port ? Number(port) : null,
        user,
        password: encryptedPw,
      },
    });
    res.status(201).json(account);
  } catch (err) {
    console.error("Error creating account:", err);
    res.status(500).json({ error: "Failed to create account" });
  }
});

// PUT /api/accounts/:id — update account
router.put("/accounts/:id", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { name, type, host, port, user, password } = req.body;

  try {
    const existing = await prisma?.dbAccount.findFirst({
      where: { id: Number(id), userId },
    });
    if (!existing) return res.status(404).json({ error: "Account not found" });

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (type !== undefined) data.type = type;
    if (host !== undefined) data.host = host;
    if (port !== undefined) data.port = Number(port);
    if (user !== undefined) data.user = user;
    if (password !== undefined) {
      data.password = password ? encrypt(password) : null;
    }

    const updated = await prisma?.dbAccount.update({
      where: { id: Number(id) },
      data,
    });
    res.json(updated);
  } catch (err) {
    console.error("Error updating account:", err);
    res.status(500).json({ error: "Failed to update account" });
  }
});

// DELETE /api/accounts/:id — delete account + cascade catalogs + detach diagrams
router.delete("/accounts/:id", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    const existing = await prisma?.dbAccount.findFirst({
      where: { id: Number(id), userId },
      include: { catalogs: { select: { id: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Account not found" });

    // Detach diagrams that reference any catalog of this account
    const catalogIds = existing.catalogs.map((c: any) => c.id);
    if (catalogIds.length > 0) {
      await prisma?.diagram.updateMany({
        where: { sourceConnectionId: { in: catalogIds } },
        data: { sourceConnectionId: null },
      });
    }

    // Delete account (cascade deletes catalogs via Prisma onDelete: Cascade)
    await prisma?.dbAccount.delete({ where: { id: Number(id) } });
    res.json({ success: true, detachedDiagrams: catalogIds.length });
  } catch (err) {
    console.error("Error deleting account:", err);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

// POST /api/accounts/:id/test — test server connection (without database)
router.post("/accounts/:id/test", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    const account = await prisma?.dbAccount.findFirst({
      where: { id: Number(id), userId },
    });
    if (!account) return res.status(404).json({ error: "Account not found" });

    // Test against the first catalog, or use a default "postgres" db for probe
    const firstCatalog = await prisma?.dbCatalog.findFirst({
      where: { accountId: Number(id) },
    });

    const probeDb = firstCatalog?.databaseName || "postgres";
    const result = await testConnection({
      type: account.type as DbType,
      host: account.host || undefined,
      port: account.port || undefined,
      user: account.user || undefined,
      password: account.password ? decrypt(account.password) : undefined,
      database: probeDb,
    });

    if (result === "OK" || result.startsWith("OK")) {
      res.json({ success: true, message: "Connection successful" });
    } else {
      res.json({ success: false, message: result });
    }
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
});

// POST /api/accounts/test-cred — test raw credentials (no database needed, for form)
router.post("/accounts/test-cred", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const { type, host, port, user, password } = req.body;
  if (!type) return res.status(400).json({ error: "type is required" });

  try {
    const probeDb = type === "postgresql" ? "postgres" : type === "mysql" ? "mysql" : undefined;
    const result = await testConnection({ type, host, port, user, password, database: probeDb } as ConnectionInfo);
    if (result === "OK" || result.startsWith("OK")) {
      res.json({ success: true, message: "Connection successful" });
    } else {
      res.json({ success: false, message: result });
    }
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
});

// POST /api/accounts/:id/test-probe — test against a specific database name
router.post("/accounts/:id/test-probe", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { database } = req.body;

  if (!database) return res.status(400).json({ error: "database name required" });

  try {
    const account = await prisma?.dbAccount.findFirst({
      where: { id: Number(id), userId },
    });
    if (!account) return res.status(404).json({ error: "Account not found" });

    const result = await testConnection({
      type: account.type as DbType,
      host: account.host || undefined,
      port: account.port || undefined,
      user: account.user || undefined,
      password: account.password ? decrypt(account.password) : undefined,
      database,
    });

    if (result === "OK" || result.startsWith("OK")) {
      res.json({ success: true, message: `Connected to database "${database}"` });
    } else {
      res.json({ success: false, message: result });
    }
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
});

// POST /api/accounts/:id/databases — list databases on this server
router.post("/accounts/:id/databases", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    const account = await prisma?.dbAccount.findFirst({
      where: { id: Number(id), userId },
    });
    if (!account) return res.status(404).json({ error: "Account not found" });

    const type = account.type;
    let databases: string[] = [];

    if (type === "postgresql") {
      // Connect to "postgres" system db to list databases
      const pgConn = getConnector("postgresql");
      const { client, release } = await pgConn.connect({
        type: "postgresql",
        host: account.host || undefined,
        port: account.port || undefined,
        user: account.user || undefined,
        password: account.password ? decrypt(account.password) : undefined,
        database: "postgres",
      });

      try {
        const pgClient = client as any;
        const result = await pgClient.query("SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname");
        databases = result.rows.map((r: any) => r.datname);
      } finally {
        release();
      }
    } else if (type === "mysql") {
      const mysqlConn = getConnector("mysql");
      const { client, release } = await mysqlConn.connect({
        type: "mysql",
        host: account.host || undefined,
        port: account.port || undefined,
        user: account.user || undefined,
        password: account.password ? decrypt(account.password) : undefined,
        database: "information_schema",
      });

      try {
        const mysqlClient = client as any;
        const [rows] = await mysqlClient.execute("SHOW DATABASES");
        databases = (rows as any[]).map((r: any) => r.Database).filter(Boolean);
      } finally {
        release();
      }
    } else {
      return res.status(400).json({ error: "Listing databases not supported for this type" });
    }

    // Mark which ones are already cataloged for this account
    const existingCatalogs = await prisma?.dbCatalog.findMany({
      where: { accountId: Number(id) },
      select: { databaseName: true },
    });
    const existingNames = new Set(existingCatalogs?.map((c: any) => c.databaseName) || []);

    res.json({
      databases: databases.map((name) => ({
        name,
        isConnected: existingNames.has(name),
      })),
    });
  } catch (err: any) {
    console.error("Error listing databases:", err);
    res.status(500).json({ error: `Failed to list databases: ${err.message}` });
  }
});

// ══════════════════════════════════════════
// Catalog routes (/api/catalogs)
// ══════════════════════════════════════════

// GET /api/catalogs — list all catalogs (optionally filter by accountId)
router.get("/catalogs", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const accountId = req.query.accountId ? Number(req.query.accountId) : undefined;

  try {
    const where: any = { account: { userId } };
    if (accountId) where.accountId = accountId;

    const catalogs = await prisma?.dbCatalog.findMany({
      where,
      include: {
        account: {
          select: { id: true, name: true, type: true, host: true, port: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(catalogs || []);
  } catch (err) {
    console.error("Error listing catalogs:", err);
    res.status(500).json({ error: "Failed to list catalogs" });
  }
});

// POST /api/catalogs — create catalog (add a database to an account)
router.post("/catalogs", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { accountId, databaseName, label } = req.body;

  if (!accountId || !databaseName) {
    return res.status(400).json({ error: "accountId and databaseName are required" });
  }

  try {
    // Verify account belongs to user
    const account = await prisma?.dbAccount.findFirst({
      where: { id: Number(accountId), userId },
    });
    if (!account) return res.status(404).json({ error: "Account not found" });

    // Check duplicate database name under same account
    const existing = await prisma?.dbCatalog.findFirst({
      where: { accountId: Number(accountId), databaseName },
    });
    if (existing) {
      return res.status(409).json({ error: `Database "${databaseName}" is already connected` });
    }

    const catalog = await prisma?.dbCatalog.create({
      data: {
        accountId: Number(accountId),
        databaseName,
        label: label || databaseName,
      },
    });

    res.status(201).json(catalog);
  } catch (err) {
    console.error("Error creating catalog:", err);
    res.status(500).json({ error: "Failed to create catalog" });
  }
});

// DELETE /api/catalogs/:id — delete catalog + detach diagrams
router.delete("/catalogs/:id", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    const catalog = await prisma?.dbCatalog.findFirst({
      where: { id: Number(id), account: { userId } },
    });
    if (!catalog) return res.status(404).json({ error: "Catalog not found" });

    // Get affected diagrams info before detaching
    const affectedDiagrams = await prisma?.diagram.findMany({
      where: { sourceConnectionId: Number(id) },
      select: { id: true, name: true },
    });

    // Detach diagrams using this catalog
    await prisma?.diagram.updateMany({
      where: { sourceConnectionId: Number(id) },
      data: { sourceConnectionId: null },
    });

    await prisma?.dbCatalog.delete({ where: { id: Number(id) } });
    res.json({
      success: true,
      detachedDiagrams: affectedDiagrams?.length ?? 0,
      diagramNames: affectedDiagrams?.map(d => d.name) ?? [],
    });
  } catch (err) {
    console.error("Error deleting catalog:", err);
    res.status(500).json({ error: "Failed to delete catalog" });
  }
});

// POST /api/catalogs/:id/schema — fetch schema from this catalog
router.post("/catalogs/:id/schema", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    const catalog = await prisma?.dbCatalog.findFirst({
      where: { id: Number(id), account: { userId } },
      include: { account: true },
    });
    if (!catalog) return res.status(404).json({ error: "Catalog not found" });

    const schema = await fetchSchema({
      type: catalog.account.type as DbType,
      host: catalog.account.host || undefined,
      port: catalog.account.port || undefined,
      user: catalog.account.user || undefined,
      password: catalog.account.password ? decrypt(catalog.account.password) : undefined,
      database: catalog.databaseName,
    });

    res.json({
      schema,
      connectionName: catalog.label || catalog.databaseName,
      dbType: catalog.account.type,
    });
  } catch (err: any) {
    console.error("Error fetching schema:", err);
    res.status(500).json({ error: `Failed to fetch schema: ${err.message}` });
  }
});

// POST /api/catalogs/:id/import — import as ERD diagram
router.post("/catalogs/:id/import", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { name } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ error: "Diagram name is required" });
  }

  try {
    const catalog = await prisma?.dbCatalog.findFirst({
      where: { id: Number(id), account: { userId } },
      include: { account: true },
    });
    if (!catalog) return res.status(404).json({ error: "Catalog not found" });

    // 1. Fetch schema from the database
    const tables = await fetchSchema({
      type: catalog.account.type as DbType,
      host: catalog.account.host || undefined,
      port: catalog.account.port || undefined,
      user: catalog.account.user || undefined,
      password: catalog.account.password ? decrypt(catalog.account.password) : undefined,
      database: catalog.databaseName,
    });

    // 2. Parse tables → entities
    const entities = tables.map((t: any, i: number) => ({
      id: crypto.randomUUID(),
      name: t.table_name,
      x: (i % 4) * 280 + 50,
      y: Math.floor(i / 4) * 200 + 50,
      color: "#4f46e5",
      columns: (t.columns || []).map((c: any) => ({
        id: crypto.randomUUID(),
        name: c.name,
        type: c.type,
        is_pk: !!c.is_pk,
        is_nullable: !!c.is_nullable,
        enum_values: null,
        sort_order: c.sort_order || 0,
        _is_fk: false,
      })),
    }));

    // 3. Create diagram pointing to this catalog
    const diagram = await prisma?.diagram.create({
      data: {
        name: name.trim(),
        uid: crypto.randomUUID(),
        userId,
        sourceType: "production_db",
        sourceConnectionId: catalog.id, // ← points to DbCatalog
      },
    });

    if (!diagram) return res.status(500).json({ error: "Failed to create diagram" });

    // 4. Save entities + columns
    if (entities.length > 0) {
      try {
        await prisma?.entity.createMany({
          data: entities.map((e: any) => ({
            id: e.id,
            diagramId: Number(diagram.id),
            name: e.name,
            x: e.x,
            y: e.y,
            color: e.color,
          })),
        });

        const allColumns = entities.flatMap((e: any) =>
          (e.columns || []).map((c: any) => ({
            id: c.id,
            entityId: e.id,
            name: c.name,
            type: c.type,
            isPk: !!c.is_pk,
            isNullable: !!c.is_nullable,
            sortOrder: c.sort_order ?? 0,
          }))
        );

        if (allColumns.length > 0) {
          await prisma?.column.createMany({ data: allColumns });
        }

        // 5. Create relationships from foreign keys
        const entityMap = new Map(entities.map((e: any) => [e.name, e]));
        const columnMap = new Map<string, string>();
        entities.forEach((e: any) =>
          (e.columns || []).forEach((c: any) => {
            columnMap.set(`${e.name}.${c.name}`, c.id);
          })
        );

        const relationships: any[] = [];
        tables.forEach((t: any) => {
          const sourceEntity = entityMap.get(t.table_name);
          if (!sourceEntity) return;
          (t.foreign_keys || []).forEach((fk: any) => {
            const targetEntity = entityMap.get(fk.ref_table);
            if (!targetEntity) return;
            const sourceColId = columnMap.get(`${t.table_name}.${fk.column}`);
            const targetColId = columnMap.get(`${fk.ref_table}.${fk.ref_column}`);
            if (!sourceColId || !targetColId) return;

            relationships.push({
              id: crypto.randomUUID(),
              diagramId: Number(diagram.id),
              sourceEntityId: sourceEntity.id,
              targetEntityId: targetEntity.id,
              sourceColumnId: sourceColId,
              targetColumnId: targetColId,
              type: "one-to-many",
            });
          });
        });

        if (relationships.length > 0) {
          await prisma?.relationship.createMany({ data: relationships });
        }
      } catch (entityErr) {
        await prisma?.diagram.delete({ where: { id: diagram.id } }).catch(() => {});
        throw entityErr;
      }
    }

    res.status(201).json({
      diagram,
      tableCount: entities.length,
    });
  } catch (err: any) {
    console.error("Error importing schema:", err);
    res.status(500).json({ error: `Failed to import schema: ${err.message}` });
  }
});

// POST /api/catalogs/:id/records — query records from a table
router.post("/catalogs/:id/records", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { table, page = 1, pageSize = 50 } = req.body;

  if (!table?.trim()) {
    return res.status(400).json({ error: "table name is required" });
  }

  try {
    const catalog = await prisma?.dbCatalog.findFirst({
      where: { id: Number(id), account: { userId } },
      include: { account: true },
    });
    if (!catalog) return res.status(404).json({ error: "Catalog not found" });

    const info: ConnectionInfo = {
      type: catalog.account.type as DbType,
      host: catalog.account.host || undefined,
      port: catalog.account.port || undefined,
      user: catalog.account.user || undefined,
      password: catalog.account.password ? decrypt(catalog.account.password) : undefined,
      database: catalog.databaseName,
    };

    const { client, release } = await getConnector(info.type).connect(info);

    try {
      const limit = Math.min(Math.max(1, pageSize), 200);
      const offset = (Math.max(1, page) - 1) * limit;

      let columns: string[] = [];
      let rows: Record<string, any>[] = [];
      let total = 0;

      if (info.type === "postgresql") {
        const pgClient = client as any;
        const countRes = await pgClient.query(`SELECT COUNT(*)::int AS total FROM "${table.replace(/"/g, '""')}"`);
        total = countRes.rows[0]?.total || 0;
        const dataRes = await pgClient.query(`SELECT * FROM "${table.replace(/"/g, '""')}" LIMIT $1 OFFSET $2`, [limit, offset]);
        columns = dataRes.fields.map((f: any) => f.name);
        rows = dataRes.rows;
      } else if (info.type === "mysql") {
        const mysqlClient = client as any;
        const escapedTable = table.replace(/`/g, '``');
        const [countRows] = await mysqlClient.execute(`SELECT COUNT(*) AS total FROM \`${escapedTable}\``);
        total = countRows[0]?.total || 0;
        const [dataRows, dataFields] = await mysqlClient.execute(`SELECT * FROM \`${escapedTable}\` LIMIT ${limit} OFFSET ${offset}`);
        columns = (dataFields || []).map((f: any) => f.name || f.column || f);
        rows = dataRows;
      } else if (info.type === "sqlite") {
        const sqdb = client as any;
        const escapedTable = table.replace(/"/g, '""');
        const countResult = sqdb.exec(`SELECT COUNT(*) AS total FROM "${escapedTable}"`);
        total = countResult[0]?.values[0]?.[0] || 0;
        const dataResult = sqdb.exec(`SELECT * FROM "${escapedTable}" LIMIT ${limit} OFFSET ${offset}`);
        if (dataResult[0]) {
          columns = dataResult[0].columns;
          rows = dataResult[0].values.map((vals: any[]) => {
            const row: Record<string, any> = {};
            columns.forEach((col: string, i: number) => { row[col] = vals[i]; });
            return row;
          });
        }
      }

      res.json({ columns, rows, total, page, pageSize: limit });
    } finally {
      release();
    }
  } catch (err: any) {
    console.error("Error querying records:", err);
    res.status(500).json({ error: `Failed to query records: ${err.message}` });
  }
});

// ══════════════════════════════════════════
// Data Migration — old local_db_connections → DbAccount + DbCatalog
// ══════════════════════════════════════════

// POST /api/migrate-connections — one-time migration
router.post("/migrate-connections", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;

  try {
    // Check if old table still has data (Prisma may not know it if schema changed)
    // We try a raw query
    let oldConnections: any[] = [];
    try {
      oldConnections = await prisma?.$queryRawUnsafe("SELECT * FROM local_db_connections WHERE user_id = $1", userId) || [];
    } catch {
      // Table might not exist — OK
    }

    if (oldConnections.length === 0) {
      return res.json({ migrated: 0, message: "No connections to migrate" });
    }

    let migrated = 0;
    for (const old of oldConnections) {
      // Create DbAccount from server credentials
      const account = await prisma?.dbAccount.create({
        data: {
          userId,
          name: old.name,
          type: old.type,
          host: old.host,
          port: old.port ? Number(old.port) : null,
          user: old.user,
          password: old.password, // already encrypted
        },
      });

      if (!account) continue;

      // Create DbCatalog from the database name
      const catalog = await prisma?.dbCatalog.create({
        data: {
          accountId: account.id,
          databaseName: old.database,
          label: old.name,
        },
      });

      if (!catalog) continue;

      // Update diagrams that pointed to the old connection id
      // The old ID == old.id, but Prisma auto-increment may have shifted.
      // We need to map IDs: find diagrams with source_connection_id = old.id
      // and update them to point to the new catalog.id
      // But we need to know the mapping — store it temporarily
      // For now, we do a best-effort: find diagrams with matching source_id
      await prisma?.diagram.updateMany({
        where: {
          userId,
          sourceConnectionId: old.id,
        },
        data: { sourceConnectionId: catalog.id },
      });

      migrated++;
    }

    res.json({
      migrated,
      message: `Migrated ${migrated} connection(s) to new architecture`,
    });
  } catch (err: any) {
    console.error("Error migrating connections:", err);
    res.status(500).json({ error: `Failed to migrate: ${err.message}` });
  }
});

// ══════════════════════════════════════════
// Backward-compat: old /api/connections routes
// These read from the new model but expose old API shape
// ══════════════════════════════════════════

// GET /api/connections — list all catalogs (shaped like old connections)
router.get("/connections", authenticate, desktopOnly, async (_req: ExpressRequest, res: ExpressResponse) => {
  const userId = (_req as any).user.id;
  try {
    const catalogs = await prisma?.dbCatalog.findMany({
      where: { account: { userId } },
      include: {
        account: {
          select: { name: true, type: true, host: true, port: true, user: true, password: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Shape like old Connection format
    const shaped = (catalogs || []).map((c: any) => ({
      id: c.id,
      name: c.label || c.databaseName,
      type: c.account.type,
      host: c.account.host,
      port: c.account.port,
      user: c.account.user,
      password: c.account.password ? "***" : null,
      database: c.databaseName,
      created_at: c.createdAt,
      catalog: { id: c.id, databaseName: c.databaseName, accountId: c.accountId },
    }));

    res.json(shaped);
  } catch (err) {
    console.error("Error listing connections:", err);
    res.status(500).json({ error: "Failed to list connections" });
  }
});

// ── Backward-compat routes ──

router.post("/connections/test", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const { type, host, port, user, password, database } = req.body;
  if (!type || !database) return res.status(400).json({ error: "type and database are required" });
  try {
    const result = await testConnection({ type, host, port, user, password, database } as ConnectionInfo);
    res.json({ success: result === "OK" || result.startsWith("OK"), message: result });
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
});

router.post("/connections/:id/test", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  try {
    const catalog = await prisma?.dbCatalog.findFirst({ where: { id: Number(id), account: { userId } }, include: { account: true } });
    if (!catalog) return res.status(404).json({ error: "Catalog not found" });
    const result = await testConnection({
      type: catalog.account.type as DbType,
      host: catalog.account.host || undefined,
      port: catalog.account.port || undefined,
      user: catalog.account.user || undefined,
      password: catalog.account.password ? decrypt(catalog.account.password) : undefined,
      database: catalog.databaseName,
    });
    res.json({ success: result === "OK" || result.startsWith("OK"), message: result });
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
});

router.post("/connections/:id/schema", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  try {
    const catalog = await prisma?.dbCatalog.findFirst({ where: { id: Number(id), account: { userId } }, include: { account: true } });
    if (!catalog) return res.status(404).json({ error: "Catalog not found" });
    const schema = await fetchSchema({
      type: catalog.account.type as DbType,
      host: catalog.account.host || undefined, port: catalog.account.port || undefined,
      user: catalog.account.user || undefined,
      password: catalog.account.password ? decrypt(catalog.account.password) : undefined,
      database: catalog.databaseName,
    });
    res.json({ schema, connectionName: catalog.label || catalog.databaseName, dbType: catalog.account.type });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to fetch schema: ${err.message}` });
  }
});

router.post("/connections/:id/import", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Diagram name is required" });
  try {
    const catalog = await prisma?.dbCatalog.findFirst({ where: { id: Number(id), account: { userId } }, include: { account: true } });
    if (!catalog) return res.status(404).json({ error: "Catalog not found" });
    const tables = await fetchSchema({
      type: catalog.account.type as DbType,
      host: catalog.account.host || undefined, port: catalog.account.port || undefined,
      user: catalog.account.user || undefined,
      password: catalog.account.password ? decrypt(catalog.account.password) : undefined,
      database: catalog.databaseName,
    });
    const entities = tables.map((t: any, i: number) => ({
      id: crypto.randomUUID(), name: t.table_name,
      x: (i % 4) * 280 + 50, y: Math.floor(i / 4) * 200 + 50, color: "#4f46e5",
      columns: (t.columns || []).map((c: any) => ({
        id: crypto.randomUUID(), name: c.name, type: c.type, is_pk: !!c.is_pk,
        is_nullable: !!c.is_nullable, enum_values: null, sort_order: c.sort_order || 0, _is_fk: false,
      })),
    }));
    const diagram = await prisma?.diagram.create({
      data: { name: name.trim(), uid: crypto.randomUUID(), userId, sourceType: "production_db", sourceConnectionId: catalog.id },
    });
    if (!diagram) return res.status(500).json({ error: "Failed to create diagram" });
    if (entities.length > 0) {
      try {
        await prisma?.entity.createMany({ data: entities.map((e: any) => ({ id: e.id, diagramId: Number(diagram.id), name: e.name, x: e.x, y: e.y, color: e.color })) });
        const allColumns = entities.flatMap((e: any) => (e.columns || []).map((c: any) => ({ id: c.id, entityId: e.id, name: c.name, type: c.type, isPk: !!c.is_pk, isNullable: !!c.is_nullable, sortOrder: c.sort_order ?? 0 })));
        if (allColumns.length > 0) await prisma?.column.createMany({ data: allColumns });
        const entityMap = new Map(entities.map((e: any) => [e.name, e]));
        const columnMap = new Map<string, string>();
        entities.forEach((e: any) => (e.columns || []).forEach((c: any) => columnMap.set(`${e.name}.${c.name}`, c.id)));
        const relationships: any[] = [];
        tables.forEach((t: any) => {
          const se = entityMap.get(t.table_name);
          if (!se) return;
          (t.foreign_keys || []).forEach((fk: any) => {
            const te = entityMap.get(fk.ref_table);
            if (!te) return;
            const sc = columnMap.get(`${t.table_name}.${fk.column}`);
            const tc = columnMap.get(`${fk.ref_table}.${fk.ref_column}`);
            if (!sc || !tc) return;
            relationships.push({ id: crypto.randomUUID(), diagramId: Number(diagram.id), sourceEntityId: se.id, targetEntityId: te.id, sourceColumnId: sc, targetColumnId: tc, type: "one-to-many" });
          });
        });
        if (relationships.length > 0) await prisma?.relationship.createMany({ data: relationships });
      } catch (entityErr) {
        await prisma?.diagram.delete({ where: { id: diagram.id } }).catch(() => {});
        throw entityErr;
      }
    }
    res.status(201).json({ diagram, tableCount: entities.length });
  } catch (err: any) {
    console.error("Error importing schema:", err);
    res.status(500).json({ error: `Failed to import schema: ${err.message}` });
  }
});

router.post("/connections/:id/records", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { table, page = 1, pageSize = 50 } = req.body;
  if (!table?.trim()) return res.status(400).json({ error: "table name is required" });
  try {
    const catalog = await prisma?.dbCatalog.findFirst({ where: { id: Number(id), account: { userId } }, include: { account: true } });
    if (!catalog) return res.status(404).json({ error: "Catalog not found" });
    const info: ConnectionInfo = {
      type: catalog.account.type as DbType,
      host: catalog.account.host || undefined, port: catalog.account.port || undefined,
      user: catalog.account.user || undefined,
      password: catalog.account.password ? decrypt(catalog.account.password) : undefined,
      database: catalog.databaseName,
    };
    const { client, release } = await getConnector(info.type).connect(info);
    try {
      const limit = Math.min(Math.max(1, pageSize), 200);
      const offset = (Math.max(1, page) - 1) * limit;
      let columns: string[] = []; let rows: Record<string, any>[] = []; let total = 0;
      if (info.type === "postgresql") {
        const pgClient = client as any;
        const cr = await pgClient.query(`SELECT COUNT(*)::int AS total FROM "${table.replace(/"/g, '""')}"`);
        total = cr.rows[0]?.total || 0;
        const dr = await pgClient.query(`SELECT * FROM "${table.replace(/"/g, '""')}" LIMIT $1 OFFSET $2`, [limit, offset]);
        columns = dr.fields.map((f: any) => f.name); rows = dr.rows;
      } else if (info.type === "mysql") {
        const mc = client as any;
        const et = table.replace(/`/g, '``');
        const [cr] = await mc.execute(`SELECT COUNT(*) AS total FROM \`${et}\``);
        total = cr[0]?.total || 0;
        const [dr, df] = await mc.execute(`SELECT * FROM \`${et}\` LIMIT ${limit} OFFSET ${offset}`);
        columns = (df || []).map((f: any) => f.name || f.column || f); rows = dr;
      } else if (info.type === "sqlite") {
        const db = client as any;
        const et = table.replace(/"/g, '""');
        const cr = db.exec(`SELECT COUNT(*) AS total FROM "${et}"`);
        total = cr[0]?.values[0]?.[0] || 0;
        const dr = db.exec(`SELECT * FROM "${et}" LIMIT ${limit} OFFSET ${offset}`);
        if (dr[0]) { columns = dr[0].columns; rows = dr[0].values.map((vs: any[]) => { const r: Record<string, any> = {}; columns.forEach((c: string, i: number) => { r[c] = vs[i]; }); return r; }); }
      }
      res.json({ columns, rows, total, page, pageSize: limit });
    } finally { release(); }
  } catch (err: any) {
    res.status(500).json({ error: `Failed to query records: ${err.message}` });
  }
});

// ── Migration: local_db_connections → DbAccount + DbCatalog ──
router.post("/migrate-connections", authenticate, desktopOnly, async (_req: ExpressRequest, res: ExpressResponse) => {
  const userId = (_req as any).user.id;
  try {
    // Check if old table exists
    const tables = await prisma?.$queryRawUnsafe<{table_name: string}[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'local_db_connections'"
    );
    if (!tables || tables.length === 0) {
      return res.json({ migrated: 0, message: "No old connections to migrate" });
    }
    const oldConns = await prisma?.$queryRawUnsafe<any[]>(
      "SELECT * FROM local_db_connections WHERE user_id = $1", userId
    );
    if (!oldConns || oldConns.length === 0) {
      return res.json({ migrated: 0, message: "No old connections to migrate" });
    }
    const results: any[] = [];
    for (const conn of oldConns) {
      // Create DbAccount
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
      // Create DbCatalog
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
    res.json({ migrated: results.length, results });
  } catch (err: any) {
    console.error("Migration error:", err);
    res.status(500).json({ error: `Migration failed: ${err.message}` });
  }
});

export default router;
