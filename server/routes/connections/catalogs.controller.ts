import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { fetchSchema, testConnection, getConnector } from "../../lib/db-connectors/registry.js";
import { decrypt } from "../../lib/crypto.js";
import { prisma } from "../../lib/prisma.js";
import { buildConnectionInfo } from "./middleware.js";
import * as accountsService from "./accounts.service.js";
import * as catalogsService from "./catalogs.service.js";

export async function listCatalogs(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const accountId = req.query.accountId ? Number(req.query.accountId) : undefined;

  try {
    const catalogs = await catalogsService.findAllCatalogs(userId, accountId);
    res.json(catalogs || []);
  } catch (err) {
    console.error("Error listing catalogs:", err);
    res.status(500).json({ error: "Failed to list catalogs" });
  }
}

export async function createCatalog(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { accountId, databaseName, label } = req.body;

  if (!accountId || !databaseName) {
    return res.status(400).json({ error: "accountId and databaseName are required" });
  }

  try {
    // Verify account belongs to user
    const account = await accountsService.findAccountById(accountId, userId);
    if (!account) return res.status(404).json({ error: "Account not found" });

    // Check duplicate database name under same account
    const existing = await (prisma as any)?.dbCatalog.findFirst({
      where: { accountId: Number(accountId), databaseName },
    });
    if (existing) {
      return res.status(409).json({ error: `Database "${databaseName}" is already connected` });
    }

    const catalog = await catalogsService.createCatalog({
      accountId: Number(accountId),
      databaseName,
      label: label || databaseName,
    });

    res.status(201).json(catalog);
  } catch (err) {
    console.error("Error creating catalog:", err);
    res.status(500).json({ error: "Failed to create catalog" });
  }
}

export async function deleteCatalog(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    const catalog = await catalogsService.findCatalogById(id, userId);
    if (!catalog) return res.status(404).json({ error: "Catalog not found" });

    const affectedDiagrams = await catalogsService.findAffectedDiagrams(id);

    await catalogsService.detachDiagramsFromCatalog(id);
    await catalogsService.deleteCatalog(id);

    res.json({
      success: true,
      detachedDiagrams: affectedDiagrams?.length ?? 0,
      diagramNames: affectedDiagrams?.map((d: any) => d.name) ?? [],
    });
  } catch (err) {
    console.error("Error deleting catalog:", err);
    res.status(500).json({ error: "Failed to delete catalog" });
  }
}

export async function fetchCatalogSchema(req: ExpressRequest, res: ExpressResponse) {
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
    console.error("Error fetching schema:", err);
    res.status(500).json({ error: `Failed to fetch schema: ${err.message}` });
  }
}

export async function importSchema(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { name } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ error: "Diagram name is required" });
  }

  try {
    const catalog = await catalogsService.findCatalogById(id, userId);
    if (!catalog) return res.status(404).json({ error: "Catalog not found" });

    // 1. Fetch schema from the database
    const tables = await fetchSchema(buildConnectionInfo({
      type: (catalog as any).account.type,
      host: (catalog as any).account.host,
      port: (catalog as any).account.port,
      user: (catalog as any).account.user,
      password: (catalog as any).account.password,
      database: (catalog as any).databaseName,
    }));

    // 2. Build positions (auto-layout) + data JSON
    const positions: Record<string, any> = {};
    tables.forEach((t: any, i: number) => {
      positions[t.table_name] = {
        x: (i % 4) * 280 + 50,
        y: Math.floor(i / 4) * 200 + 50,
        color: "#4f46e5",
        collapsed: false,
        hidden_columns: [],
        note: "",
      };
    });

    const diagramData = {
      nodes: positions,
      viewport: { x: 0, y: 0, zoom: 1 },
      _type: "production_db_positions",
      source: {
        type: (catalog as any).account.type,
        host: (catalog as any).account.host || undefined,
        port: (catalog as any).account.port || undefined,
        user: (catalog as any).account.user || undefined,
        database: (catalog as any).databaseName,
        password_encrypted: (catalog as any).account.password || undefined,
      },
    };

    // 3. Create diagram
    const diagram = await prisma?.diagram.create({
      data: {
        name: name.trim(),
        uid: crypto.randomUUID(),
        userId,
        sourceType: "production_db",
        sourceConnectionId: Number(id),
        data: JSON.stringify(diagramData),
      },
    });

    if (!diagram) return res.status(500).json({ error: "Failed to create diagram" });

    res.status(201).json({
      diagram,
      tableCount: tables.length,
    });
  } catch (err: any) {
    console.error("Error importing schema:", err);
    res.status(500).json({ error: `Failed to import schema: ${err.message}` });
  }
}

export async function queryRecords(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { table, page = 1, pageSize = 50 } = req.body;

  if (!table?.trim()) {
    return res.status(400).json({ error: "table name is required" });
  }

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
        const countRes = await pgClient.query(`SELECT COUNT(*)::int AS total FROM "${table.replace(/"/g, '""')}"`);
        total = countRes.rows[0]?.total || 0;
        const dataRes = await pgClient.query(`SELECT * FROM "${table.replace(/"/g, '""')}" LIMIT $1 OFFSET $2`, [limit, offset]);
        columns = dataRes.fields.map((f: any) => f.name);
        rows = dataRes.rows;
      } else if (info.type === "mysql") {
        const mysqlClient = client as any;
        const escapedTable = table.replace(/`/g, "``");
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
            columns.forEach((col: string, i: number) => {
              row[col] = vals[i];
            });
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
}
