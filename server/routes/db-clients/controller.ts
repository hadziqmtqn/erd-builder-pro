import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { handleError } from "../../lib/utils.js";
import { resolveOwnedProjectId } from "../../lib/security.js";

function ownedWhere(uid: string, userId: string): any {
  return /^\d+$/.test(uid)
    ? { userId, OR: [{ uid }, { id: Number(uid) }] }
    : { userId, uid };
}

function includeData() {
  return {
    project: { select: { id: true, uid: true, name: true } },
    catalog: { select: { id: true, databaseName: true, label: true, account: { select: { id: true, name: true, type: true } } } },
    layout: true,
  };
}

function output(client: any) {
  let data = {};
  try { data = JSON.parse(client.layout?.data || "{}"); } catch { /* keep empty */ }
  const { layout, ...record } = client;
  return { ...record, data };
}

async function owned(uid: string, userId: string, deleted?: boolean) {
  return (prisma as any).dbClient.findFirst({
    where: { ...ownedWhere(uid, userId), ...(deleted === undefined ? {} : { isDeleted: deleted }) },
    include: includeData(),
  });
}

export async function list(req: Request, res: Response) {
  try {
    const userId = String((req as any).user.id);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const projectId = req.query.project_id ? Number(req.query.project_id) : undefined;
    const q = String(req.query.q || "").trim();
    const where: any = { userId, isDeleted: false };
    if (Number.isFinite(projectId)) where.projectId = projectId;
    if (q) where.name = { contains: q };
    const [data, total] = await Promise.all([
      (prisma as any).dbClient.findMany({ where, include: includeData(), orderBy: { updatedAt: "desc" }, skip: offset, take: limit }),
      (prisma as any).dbClient.count({ where }),
    ]);
    res.json({ data: data.map(output), total });
  } catch (error) { handleError(res, error, "Failed to fetch DB Clients"); }
}

export async function get(req: Request, res: Response) {
  try {
    const client = await owned(req.params.uid, String((req as any).user.id), false);
    if (!client) return res.status(404).json({ error: "DB Client not found" });
    res.json(output(client));
  } catch (error) { handleError(res, error, "Failed to fetch DB Client"); }
}

export async function update(req: Request, res: Response) {
  try {
    const userId = String((req as any).user.id);
    const client = await owned(req.params.uid, userId, false);
    if (!client) return res.status(404).json({ error: "DB Client not found" });
    const data: any = {};
    if (typeof req.body.name === "string" && req.body.name.trim()) data.name = req.body.name.trim();
    if (Object.prototype.hasOwnProperty.call(req.body, "project_id")) {
      data.projectId = await resolveOwnedProjectId(prisma as any, userId, req.body.project_id);
    }
    const updated = await (prisma as any).dbClient.update({ where: { id: client.id }, data, include: includeData() });
    res.json(output(updated));
  } catch (error) { handleError(res, error, "Failed to update DB Client"); }
}

export async function saveLayout(req: Request, res: Response) {
  try {
    const client = await owned(req.params.uid, String((req as any).user.id), false);
    if (!client) return res.status(404).json({ error: "DB Client not found" });
    const data = req.body?.data;
    if (!data || typeof data !== "object") return res.status(400).json({ error: "Layout data is required" });
    await (prisma as any).$transaction([
      (prisma as any).dbClientLayout.upsert({
        where: { dbClientId: client.id },
        create: { dbClientId: client.id, data: JSON.stringify(data) },
        update: { data: JSON.stringify(data) },
      }),
      (prisma as any).dbClient.update({ where: { id: client.id }, data: { version: { increment: 1 } } }),
    ]);
    res.json({ success: true });
  } catch (error) { handleError(res, error, "Failed to save DB Client layout"); }
}

async function setDeleted(req: Request, res: Response, isDeleted: boolean) {
  const client = await owned(req.params.uid, String((req as any).user.id));
  if (!client) return res.status(404).json({ error: "DB Client not found" });
  const updated = await (prisma as any).dbClient.update({
    where: { id: client.id }, data: { isDeleted, deletedAt: isDeleted ? new Date() : null },
  });
  res.json(updated);
}

export async function remove(req: Request, res: Response) {
  try { await setDeleted(req, res, true); } catch (error) { handleError(res, error, "Failed to delete DB Client"); }
}

export async function restore(req: Request, res: Response) {
  try { await setDeleted(req, res, false); } catch (error) { handleError(res, error, "Failed to restore DB Client"); }
}

export async function permanentDelete(req: Request, res: Response) {
  try {
    const client = await owned(req.params.uid, String((req as any).user.id), true);
    if (!client) return res.status(404).json({ error: "Deleted DB Client not found" });
    await (prisma as any).$transaction(async (tx: any) => {
      await tx.dbClient.delete({ where: { id: client.id } });
      if (!client.legacyDiagramId) return;
      const legacyWhere = { id: client.legacyDiagramId, userId: String((req as any).user.id), sourceType: "production_db" };
      const entities = await tx.entity.findMany({ where: { diagramId: client.legacyDiagramId }, select: { id: true } });
      const entityIds = entities.map((entity: any) => entity.id);
      await tx.relationship.deleteMany({ where: { diagramId: client.legacyDiagramId } });
      await tx.sqlQuery.deleteMany({ where: { diagramId: client.legacyDiagramId } });
      if (entityIds.length) await tx.column.deleteMany({ where: { entityId: { in: entityIds } } });
      await tx.entity.deleteMany({ where: { diagramId: client.legacyDiagramId } });
      await tx.diagram.deleteMany({ where: legacyWhere });
    });
    res.json({ success: true });
  } catch (error) { handleError(res, error, "Failed to permanently delete DB Client"); }
}
