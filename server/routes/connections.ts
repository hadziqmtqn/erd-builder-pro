import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../lib/middleware.js";
import { isDesktopMode } from "../lib/config.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import type { ConnectionInfo, DbType } from "../lib/db-connectors/types.js";
import { testConnection, fetchSchema, getConnector } from "../lib/db-connectors/registry.js";

const router = Router();

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

// GET /api/connections — list all saved connections
router.get("/connections", authenticate, desktopOnly, async (_req: ExpressRequest, res: ExpressResponse) => {
  const userId = (_req as any).user.id;
  try {
    const connections = await prisma?.localDbConnection.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });

    const masked = (connections || []).map((c: any) => ({
      ...c,
      password: c.password ? "***" : null,
    }));

    res.json(masked);
  } catch (err) {
    console.error("Error listing connections:", err);
    res.status(500).json({ error: "Failed to list connections" });
  }
});

// POST /api/connections — create connection
router.post("/connections", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { name, type, host, port, user, password, database } = req.body;

  if (!name || !type || !database) {
    return res.status(400).json({ error: "name, type, and database are required" });
  }

  try {
    const encryptedPw = password ? encrypt(password) : null;
    const conn = await prisma?.localDbConnection.create({
      data: {
        userId,
        name,
        type,
        host,
        port: port ? Number(port) : null,
        user,
        password: encryptedPw,
        database,
      },
    });
    res.status(201).json(conn);
  } catch (err) {
    console.error("Error creating connection:", err);
    res.status(500).json({ error: "Failed to create connection" });
  }
});

// PUT /api/connections/:id — update connection
router.put("/connections/:id", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { name, type, host, port, user, password, database } = req.body;

  try {
    const existing = await prisma?.localDbConnection.findFirst({
      where: { id: Number(id), userId },
    });
    if (!existing) return res.status(404).json({ error: "Connection not found" });

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (type !== undefined) data.type = type;
    if (host !== undefined) data.host = host;
    if (port !== undefined) data.port = Number(port);
    if (user !== undefined) data.user = user;
    if (database !== undefined) data.database = database;
    if (password !== undefined) {
      data.password = password ? encrypt(password) : null;
    }

    const updated = await prisma?.localDbConnection.update({
      where: { id: Number(id) },
      data,
    });
    res.json(updated);
  } catch (err) {
    console.error("Error updating connection:", err);
    res.status(500).json({ error: "Failed to update connection" });
  }
});

// DELETE /api/connections/:id — delete connection
router.delete("/connections/:id", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    const existing = await prisma?.localDbConnection.findFirst({
      where: { id: Number(id), userId },
    });
    if (!existing) return res.status(404).json({ error: "Connection not found" });

    await prisma?.localDbConnection.delete({ where: { id: Number(id) } });
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting connection:", err);
    res.status(500).json({ error: "Failed to delete connection" });
  }
});

// POST /api/connections/test — test connection without saving
router.post("/connections/test", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const { type, host, port, user, password, database } = req.body;

  if (!type || !database) {
    return res.status(400).json({ error: "type and database are required" });
  }

  try {
    const result = await testConnection({ type, host, port, user, password, database } as ConnectionInfo);
    if (result === "OK" || result.startsWith("OK")) {
      res.json({ success: true, message: "Connection successful" });
    } else {
      res.json({ success: false, message: result });
    }
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
});

// POST /api/connections/:id/test — test saved connection
router.post("/connections/:id/test", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    const conn = await prisma?.localDbConnection.findFirst({
      where: { id: Number(id), userId },
    });
    if (!conn) return res.status(404).json({ error: "Connection not found" });

    const result = await testConnection(buildConnectionInfo(conn));
    if (result === "OK" || result.startsWith("OK")) {
      res.json({ success: true, message: "Connection successful" });
    } else {
      res.json({ success: false, message: result });
    }
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
});

// POST /api/connections/:id/schema — fetch schema from external DB
router.post("/connections/:id/schema", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    const conn = await prisma?.localDbConnection.findFirst({
      where: { id: Number(id), userId },
    });
    if (!conn) return res.status(404).json({ error: "Connection not found" });

    const schema = await fetchSchema(buildConnectionInfo(conn));
    res.json({ schema, connectionName: conn.name, dbType: conn.type });
  } catch (err: any) {
    console.error("Error fetching schema:", err);
    res.status(500).json({ error: `Failed to fetch schema: ${err.message}` });
  }
});

// POST /api/connections/:id/import — fetch schema + create diagram + persist entities
router.post("/connections/:id/import", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { name } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ error: "Diagram name is required" });
  }

  try {
    const conn = await prisma?.localDbConnection.findFirst({
      where: { id: Number(id), userId },
    });
    if (!conn) return res.status(404).json({ error: "Connection not found" });

    // 1. Fetch schema from external DB
    const tables = await fetchSchema(buildConnectionInfo(conn));

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

    // 3. Create diagram with source info
    const diagram = await prisma?.diagram.create({
      data: {
        name: name.trim(),
        uid: crypto.randomUUID(),
        userId,
        sourceType: "production_db",
        sourceConnectionId: Number(id),
      },
    });

    if (!diagram) return res.status(500).json({ error: "Failed to create diagram" });

    // 4. Save entities + columns
    if (entities.length > 0) {
      try {
        // createMany doesn't support relation fields — create columns separately
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

        // Batch create all columns
        const allColumns = entities.flatMap((e: any) =>
          (e.columns || []).map((c: any) => ({
            id: c.id,
            entityId: e.id,
            name: c.name,
            type: c.type,
            isPk: !!c.is_pk,
            isNullable: !!c.is_nullable,
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
        // Cleanup orphan diagram — entity creation failed
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

// POST /api/connections/:id/records — query records from a table
router.post("/connections/:id/records", authenticate, desktopOnly, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { table, page = 1, pageSize = 50 } = req.body;

  if (!table?.trim()) {
    return res.status(400).json({ error: "table name is required" });
  }

  try {
    const conn = await prisma?.localDbConnection.findFirst({
      where: { id: Number(id), userId },
    });
    if (!conn) return res.status(404).json({ error: "Connection not found" });

    const info = buildConnectionInfo(conn);
    const { client, release } = await getConnector(info.type).connect(info);

    try {
      const limit = Math.min(Math.max(1, pageSize), 200);
      const offset = (Math.max(1, page) - 1) * limit;

      let columns: string[] = [];
      let rows: Record<string, any>[] = [];
      let total = 0;

      if (info.type === "postgresql") {
        const pgClient = client as any;
        // Count total
        const countRes = await pgClient.query(`SELECT COUNT(*)::int AS total FROM "${table.replace(/"/g, '""')}"`);
        total = countRes.rows[0]?.total || 0;
        // Fetch rows
        const dataRes = await pgClient.query(`SELECT * FROM "${table.replace(/"/g, '""')}" LIMIT $1 OFFSET $2`, [limit, offset]);
        columns = dataRes.fields.map((f: any) => f.name);
        rows = dataRes.rows;
      } else if (info.type === "mysql") {
        const mysqlClient = client as any;
        const escapedTable = table.replace(/`/g, '``');
        const [countRows] = await mysqlClient.execute(`SELECT COUNT(*) AS total FROM \`${escapedTable}\``);
        total = countRows[0]?.total || 0;
        const [dataRows, dataFields] = await mysqlClient.execute(`SELECT * FROM \`${escapedTable}\` LIMIT ? OFFSET ?`, [limit, offset]);
        columns = (dataFields || []).map((f: any) => f.name || f.column || f);
        rows = dataRows;
      } else if (info.type === "sqlite") {
        const db = client as any;
        const escapedTable = table.replace(/"/g, '""');
        const countResult = db.exec(`SELECT COUNT(*) AS total FROM "${escapedTable}"`);
        total = countResult[0]?.values[0]?.[0] || 0;
        const dataResult = db.exec(`SELECT * FROM "${escapedTable}" LIMIT ${limit} OFFSET ${offset}`);
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

export default router;
