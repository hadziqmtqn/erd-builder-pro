import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { testConnection, fetchSchema, getConnector } from "../../lib/db-connectors/registry.js";
import { buildConnectionInfo } from "./middleware.js";
import * as catalogsService from "./catalogs.service.js";
import * as catalogsController from "./catalogs.controller.js";

// ── GET /connections — list all catalogs, shaped like old connections ──
export async function listLegacyConnections(_req: ExpressRequest, res: ExpressResponse) {
  const userId = (_req as any).user.id;
  try {
    const catalogs = await catalogsService.findAllCatalogs(userId);
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
}

// ── POST /connections/test — test raw credentials ──
export async function testLegacyConnection(req: ExpressRequest, res: ExpressResponse) {
  const { type, host, port, user, password, database } = req.body;
  if (!type || !database) return res.status(400).json({ error: "type and database are required" });
  try {
    const result = await testConnection({ type, host, port, user, password, database } as any);
    res.json({ success: result === "OK" || result.startsWith("OK"), message: result });
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
}

// ── POST /connections/:id/test — test catalog connection ──
export async function testLegacyCatalogConnection(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { id } = req.params;
  try {
    const catalog = await catalogsService.findCatalogById(id, userId);
    if (!catalog) return res.status(404).json({ error: "Catalog not found" });
    const result = await testConnection(buildConnectionInfo({
      type: (catalog as any).account.type,
      host: (catalog as any).account.host,
      port: (catalog as any).account.port,
      user: (catalog as any).account.user,
      password: (catalog as any).account.password,
      database: (catalog as any).databaseName,
    }));
    res.json({ success: result === "OK" || result.startsWith("OK"), message: result });
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
}

// ── POST /connections/:id/schema — fetch catalog schema ──
export async function fetchLegacySchema(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { id } = req.params;
  try {
    const catalog = await catalogsService.findCatalogById(id, userId);
    if (!catalog) return res.status(404).json({ error: "Catalog not found" });
    const schema = await fetchSchema(buildConnectionInfo({
      type: (catalog as any).account.type,
      host: (catalog as any).account.host,
      port: (catalog as any).account.port,
      user: (catalog as any).account.user,
      password: (catalog as any).account.password,
      database: (catalog as any).databaseName,
    }));
    res.json({
      schema,
      connectionName: (catalog as any).label || (catalog as any).databaseName,
      dbType: (catalog as any).account.type,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to fetch schema: ${err.message}` });
  }
}

// ── POST /connections/:id/import — import catalog schema as diagram ──
export async function importLegacySchema(req: ExpressRequest, res: ExpressResponse) {
  return catalogsController.importSchema(req, res);
}

// ── POST /connections/:id/records — query table records ──
export async function queryLegacyRecords(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { table, page = 1, pageSize = 50 } = req.body;
  if (!table?.trim()) return res.status(400).json({ error: "table name is required" });

  try {
    const catalog = await catalogsService.findCatalogById(id, userId);
    if (!catalog) return res.status(404).json({ error: "Catalog not found" });

    const info = buildConnectionInfo({
      type: (catalog as any).account.type,
      host: (catalog as any).account.host,
      port: (catalog as any).account.port,
      user: (catalog as any).account.user,
      password: (catalog as any).account.password,
      database: (catalog as any).databaseName,
    });

    const { client, release } = await getConnector(info.type).connect(info);

    try {
      const limit = Math.min(Math.max(1, pageSize), 200);
      const offset = (Math.max(1, page) - 1) * limit;
      let columns: string[] = [];
      let rows: Record<string, any>[] = [];
      let total = 0;

      if (info.type === "postgresql") {
        const pgClient = client as any;
        const cr = await pgClient.query(`SELECT COUNT(*)::int AS total FROM "${table.replace(/"/g, '""')}"`);
        total = cr.rows[0]?.total || 0;
        const dr = await pgClient.query(`SELECT * FROM "${table.replace(/"/g, '""')}" LIMIT $1 OFFSET $2`, [limit, offset]);
        columns = dr.fields.map((f: any) => f.name);
        rows = dr.rows;
      } else if (info.type === "mysql") {
        const mc = client as any;
        const et = table.replace(/`/g, "``");
        const [cr] = await mc.execute(`SELECT COUNT(*) AS total FROM \`${et}\``);
        total = cr[0]?.total || 0;
        const [dr, df] = await mc.execute(`SELECT * FROM \`${et}\` LIMIT ${limit} OFFSET ${offset}`);
        columns = (df || []).map((f: any) => f.name || f.column || f);
        rows = dr;
      } else if (info.type === "sqlite") {
        const db = client as any;
        const et = table.replace(/"/g, '""');
        const cr = db.exec(`SELECT COUNT(*) AS total FROM "${et}"`);
        total = cr[0]?.values[0]?.[0] || 0;
        const dr = db.exec(`SELECT * FROM "${et}" LIMIT ${limit} OFFSET ${offset}`);
        if (dr[0]) {
          columns = dr[0].columns;
          rows = dr[0].values.map((vs: any[]) => {
            const r: Record<string, any> = {};
            columns.forEach((c: string, i: number) => { r[c] = vs[i]; });
            return r;
          });
        }
      }

      res.json({ columns, rows, total, page, pageSize: limit });
    } finally {
      release();
    }
  } catch (err: any) {
    res.status(500).json({ error: `Failed to query records: ${err.message}` });
  }
}
