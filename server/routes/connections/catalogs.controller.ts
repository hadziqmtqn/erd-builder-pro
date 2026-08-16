import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { fetchSchema } from "../../lib/db-connectors/registry.js";
import { prisma } from "../../lib/prisma.js";
import { resolveOwnedProjectId } from "../../lib/security.js";
import { buildCatalogConnectionInfo } from "./middleware.js";
import * as accountsService from "./accounts.service.js";
import * as catalogsService from "./catalogs.service.js";
export { buildRecordDelete, buildRecordInsert, buildRecordUpdate, buildRecordWhere, validateRecordValues } from "./record-helpers.js";
export { createRecord, deleteRecord, queryRecords, updateRecord } from "./records.controller.js";
export { getStructureSql, importStructureSql, updateStructure } from "./structure.controller.js";

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

    const deletedDiagrams = await catalogsService.deleteDiagramsForCatalog(id);
    await catalogsService.deleteCatalog(id);

    res.json({
      success: true,
      detachedDiagrams: deletedDiagrams,
      deletedDiagrams,
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

    const info = buildCatalogConnectionInfo(catalog);
    const schema = await fetchSchema(info);

    res.json({
      schema,
      connectionName: (catalog as any).label || (catalog as any).databaseName,
      dbType: (catalog as any).account.type,
      connectionSecurity: {
        environment: info.environment,
        safeMode: info.safeMode,
        sslMode: info.sslMode,
        queryTimeoutMs: info.queryTimeoutMs,
      },
    });
  } catch (err: any) {
    console.error("Error fetching schema:", err);
    res.status(500).json({ error: `Failed to fetch schema: ${err.message}` });
  }
}

export async function importSchema(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { name, project_id } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ error: "Diagram name is required" });
  }

  try {
    const catalog = await catalogsService.findCatalogById(id, userId);
    if (!catalog) return res.status(404).json({ error: "Catalog not found" });
    const projectId = await resolveOwnedProjectId(prisma as any, userId, project_id);

    // 1. Fetch schema from the database
    const tables = await fetchSchema(buildCatalogConnectionInfo(catalog));

    // 2. Build positions (auto-layout) + data JSON
    const positions: Record<string, any> = {};
    tables.forEach((t: any, i: number) => {
      positions[t.table_name] = {
        x: (i % 4) * 280 + 50,
        y: Math.floor(i / 4) * 200 + 50,
        color: "#6b7280",
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
        projectId,
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
