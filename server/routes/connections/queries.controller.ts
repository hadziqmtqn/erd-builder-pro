import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { randomUUID } from "crypto";
import { prisma } from "../../lib/prisma.js";
import { getConnector } from "../../lib/db-connectors/registry.js";
import { buildCatalogConnectionInfo } from "./middleware.js";
import * as catalogsService from "./catalogs.service.js";
import { normalizeSelectQuery } from "./query-helpers.js";

function querySelect() {
  return {
    id: true, uid: true, dbClientId: true, groupName: true, name: true, script: true,
    createdAt: true, updatedAt: true,
  };
}

async function assertDbClient(req: ExpressRequest, value: unknown) {
  const id = Number(value);
  if (!id) throw new Error("dbClientId is required");
  const client = await (prisma as any)?.dbClient.findFirst({
    where: { id, userId: String((req as any).user.id), isDeleted: false },
    select: { id: true },
  });
  if (!client) throw new Error("DB Client not found");
  return id;
}

export async function listQueries(req: ExpressRequest, res: ExpressResponse) {
  try {
    const id = Number(req.query.dbClientId);
    if (!id) throw new Error("dbClientId is required");
    const client = await (prisma as any)?.dbClient.findFirst({
      where: { id, userId: String((req as any).user.id), isDeleted: false },
      select: { queries: { select: querySelect(), orderBy: [{ groupName: "asc" }, { updatedAt: "desc" }] } },
    });
    if (!client) throw new Error("DB Client not found");
    res.json({ queries: client.queries || [] });
  } catch (err: any) {
    res.status(/not found/i.test(err.message) ? 404 : 400).json({ error: err.message || "Failed to load SQL queries" });
  }
}

export async function saveQuery(req: ExpressRequest, res: ExpressResponse) {
  try {
    const dbClientId = await assertDbClient(req, req.body.dbClientId);
    const name = String(req.body.name || "").trim();
    const script = String(req.body.script || "");
    if (!name) return res.status(400).json({ error: "Query name is required" });
    normalizeSelectQuery(script);
    const data = { dbClientId, groupName: String(req.body.groupName || "Ungrouped").trim() || "Ungrouped", name, script };
    let query;
    if (req.body.id) {
      const current = await (prisma as any).dbClientQuery.findFirst({ where: { id: Number(req.body.id), dbClientId }, select: { id: true } });
      if (!current) return res.status(404).json({ error: "SQL query not found" });
      query = await (prisma as any).dbClientQuery.update({ where: { id: current.id }, data, select: querySelect() });
    } else {
      query = await (prisma as any).dbClientQuery.create({ data: { ...data, uid: randomUUID() }, select: querySelect() });
    }
    res.json({ query });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to save SQL query" });
  }
}

export async function deleteQuery(req: ExpressRequest, res: ExpressResponse) {
  try {
    const dbClientId = await assertDbClient(req, req.query.dbClientId);
    const id = Number(req.params.queryId);
    if (!id) return res.status(400).json({ error: "queryId is required" });
    const current = await (prisma as any).dbClientQuery.findFirst({ where: { id, dbClientId }, select: { id: true } });
    if (!current) return res.status(404).json({ error: "SQL query not found" });
    await (prisma as any).dbClientQuery.delete({ where: { id: current.id } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(/not found/i.test(err.message) ? 404 : 400).json({ error: err.message || "Failed to delete SQL query" });
  }
}

export async function runQuery(req: ExpressRequest, res: ExpressResponse) {
  const userId = (req as any).user.id;
  const { id } = req.params;
  try {
    const sql = normalizeSelectQuery(req.body.script);
    const catalog = await catalogsService.findCatalogById(id, userId);
    if (!catalog) return res.status(404).json({ error: "Catalog not found" });

    const info = buildCatalogConnectionInfo(catalog);
    if (info.type === "sqlite") return res.status(400).json({ error: "Custom query is supported for MySQL and PostgreSQL only" });

    const connector = getConnector(info.type);
    const connected = await connector.connect(info);
    const { client, release } = connected;
    const runId = String(req.body.runId || "");
    if (runId) activeQueries.set(`${userId}:${runId}`, connected.cancel);
    const started = Date.now();
    try {
      if (info.type === "postgresql") {
        const result = await (client as any).query(sql);
        return res.json({ columns: result.fields.map((f: any) => f.name), rows: result.rows, durationMs: Date.now() - started });
      }
      const [rows, fields] = await (client as any).execute(sql);
      res.json({ columns: (fields || []).map((f: any) => f.name || f.column || f), rows, durationMs: Date.now() - started });
    } finally {
      if (runId) activeQueries.delete(`${userId}:${runId}`);
      release();
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to run SQL query" });
  }
}

const activeQueries = new Map<string, (() => Promise<void>) | undefined>();

export async function cancelQuery(req: ExpressRequest, res: ExpressResponse) {
  const key = `${(req as any).user.id}:${String(req.params.runId || "")}`;
  const cancel = activeQueries.get(key);
  if (!cancel) return res.status(404).json({ error: "Running query not found" });
  try {
    await cancel();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to cancel query" });
  }
}
