import type { Request, Response } from "express";
import { z } from "zod";
import { normalizeHistoryEntityType } from "../../lib/entity-history.js";
import { handleError } from "../../lib/utils.js";
import * as service from "./service.js";

function entityType(req: Request, res: Response) {
  const type = normalizeHistoryEntityType(req.params.entityType);
  if (!type) res.status(400).json({ error: "Unsupported history entity type" });
  return type;
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const type = entityType(req, res);
    if (!type) return;
    const result = await service.listHistory(type, req.params.uid, (req as any).user.id, Number(req.query.limit) || 100);
    if (!result) { res.status(404).json({ error: "Document not found" }); return; }
    res.json(result);
  } catch (err) {
    handleError(res, err, "Failed to load version history");
  }
}

export async function get(req: Request, res: Response): Promise<void> {
  try {
    const type = entityType(req, res);
    if (!type) return;
    const revisionId = req.params.revisionId;
    if (!/^\d+$/.test(revisionId)) { res.status(400).json({ error: "Invalid revision id" }); return; }
    const result = await service.readHistoryRevision(type, req.params.uid, (req as any).user.id, revisionId);
    if (!result) { res.status(404).json({ error: "Revision not found" }); return; }
    res.json(result);
  } catch (err) {
    handleError(res, err, "Failed to load version");
  }
}

const restoreSchema = z.object({ expected_updated_at: z.string().datetime().nullable() });

export async function restore(req: Request, res: Response): Promise<void> {
  try {
    const type = entityType(req, res);
    if (!type) return;
    const revisionId = req.params.revisionId;
    const parsed = restoreSchema.safeParse(req.body ?? {});
    if (!/^\d+$/.test(revisionId) || !parsed.success) { res.status(400).json({ error: "Invalid restore request" }); return; }
    const result = await service.restoreHistoryRevision({
      entityType: type,
      uid: req.params.uid,
      userId: (req as any).user.id,
      revisionId,
      expectedUpdatedAt: parsed.data.expected_updated_at,
    });
    if (result.status === "conflict") { res.status(409).json({ error: "Document changed while history was open", current_updated_at: result.currentUpdatedAt }); return; }
    if (result.status !== "ok") { res.status(404).json({ error: "Document or revision not found" }); return; }
    res.json({ success: true, revision_id: result.revisionId ? String(result.revisionId) : null, updated_at: result.updatedAt });
  } catch (err) {
    handleError(res, err, "Failed to restore version");
  }
}
