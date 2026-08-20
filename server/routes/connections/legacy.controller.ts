import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { testConnection, fetchSchema, getConnector } from "../../lib/db-connectors/registry.js";
import { erdColumnType } from "../../lib/db-connectors/types.js";
import { prisma } from "../../lib/prisma.js";
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
  /* Legacy implementation kept below for one release as rollback reference.
     It is unreachable so this endpoint can no longer create production_db diagrams. */
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Diagram name is required" });

  try {
    const catalog = await catalogsService.findCatalogById(id, userId);
    if (!catalog) return res.status(404).json({ error: "Catalog not found" });

    const tables = await fetchSchema(buildConnectionInfo({
      type: (catalog as any).account.type,
      host: (catalog as any).account.host,
      port: (catalog as any).account.port,
      user: (catalog as any).account.user,
      password: (catalog as any).account.password,
      database: (catalog as any).databaseName,
    }));

    const entities = tables.map((t: any, i: number) => ({
      id: crypto.randomUUID(),
      name: t.table_name,
      x: (i % 4) * 280 + 50,
      y: Math.floor(i / 4) * 200 + 50,
      color: "#6b7280",
      columns: (t.columns || []).map((c: any) => ({
        id: crypto.randomUUID(),
        name: c.name,
        type: erdColumnType(c),
        is_pk: !!c.is_pk,
        is_nullable: !!c.is_nullable,
        enum_values: c.enum_values ?? null,
        comment: c.comment || "",
        max_length: c.max_length ?? null,
        numeric_precision: c.numeric_precision ?? null,
        numeric_scale: c.numeric_scale ?? null,
        sort_order: c.sort_order || 0,
        _is_fk: false,
      })),
    }));

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
            enumValues: c.enum_values ?? null,
            comment: c.comment || null,
            maxLength: c.max_length ?? null,
            numericPrecision: c.numeric_precision ?? null,
            numericScale: c.numeric_scale ?? null,
            sortOrder: c.sort_order ?? 0,
          }))
        );
        if (allColumns.length > 0) {
          await prisma?.column.createMany({ data: allColumns });
        }

        const entityMap = new Map(entities.map((e: any) => [e.name, e]));
        const columnMap = new Map<string, string>();
        entities.forEach((e: any) =>
          (e.columns || []).forEach((c: any) => columnMap.set(`${e.name}.${c.name}`, c.id))
        );

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
            relationships.push({
              id: crypto.randomUUID(),
              diagramId: Number(diagram.id),
              sourceEntityId: se.id,
              targetEntityId: te.id,
              sourceColumnId: sc,
              targetColumnId: tc,
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

    res.status(201).json({ diagram, tableCount: entities.length });
  } catch (err: any) {
    console.error("Error importing schema:", err);
    res.status(500).json({ error: `Failed to import schema: ${err.message}` });
  }
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
