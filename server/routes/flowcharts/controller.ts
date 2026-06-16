import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase } from "../../lib/config.js";
import { handleError } from "../../lib/utils.js";
import { resolveOwnedProjectId } from "../../lib/security.js";
import { prisma } from "../../lib/prisma.js";
import * as fcService from "./service.js";

export async function list(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;
    const projectId = req.query.project_id as string;
    const q = req.query.q as string;
    const rawPublic = req.query.is_public as string;
    const isPublic = rawPublic === "true" ? true : rawPublic === "false" ? false : null;
    const userId = (req as any).user.id;

    const result = await fcService.listFlowcharts(userId, { limit, offset, projectId, q, isPublic });
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch flowcharts");
  }
}

export async function create(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    if (!prisma) { res.status(500).json({ error: "Database connection not available" }); return; }
    const userId = (req as any).user.id;
    const { title, data, project_id, uid } = req.body;
    const resolvedProjectId = await resolveOwnedProjectId(prisma, userId, project_id);

    const flowchart = await fcService.createFlowchart({
      title, fcData: data, projectId: resolvedProjectId, userId, uid,
    });
    res.json(flowchart);
  } catch (err: any) {
    handleError(res, err, "Failed to create flowchart");
  }
}

export async function get(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const flowchart = await fcService.getFlowchart(req.params.uid, userId);
    if (!flowchart) { res.status(404).json({ error: "Flowchart not found" }); return; }
    res.json(flowchart);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch flowchart");
  }
}

export async function update(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const { title, data, project_id } = req.body;

    if (!prisma) { res.status(500).json({ error: "Database connection not available" }); return; }

    let resolvedProjectId: number | null | undefined;
    if (project_id !== undefined) {
      resolvedProjectId = await resolveOwnedProjectId(prisma, userId, project_id);
    }

    const result = await fcService.updateFlowchart(req.params.uid, userId, {
      title, fcData: data, projectId: resolvedProjectId,
    });
    if (!result) { res.status(404).json({ error: "Flowchart not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to update flowchart");
  }
}

export async function remove(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const result = await fcService.softDeleteFlowchart(req.params.uid, userId);
    if (!result) { res.status(404).json({ error: "Flowchart not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to delete flowchart");
  }
}

export async function restore(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const result = await fcService.restoreFlowchart(req.params.uid, userId);
    if (!result) { res.status(404).json({ error: "Flowchart not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to restore flowchart");
  }
}

export async function permanentDelete(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const result = await fcService.permanentDeleteFlowchart(req.params.uid, userId);
    if (!result) { res.status(404).json({ error: "Flowchart not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to permanently delete flowchart");
  }
}

export async function getPublic(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const flowchart = await fcService.getPublicFlowchart(req.params.uid);
    if (!flowchart) { res.status(404).json({ error: "Flowchart not found" }); return; }

    if (flowchart.project?.isDeleted) {
      res.status(404).json({ error: "Flowchart not found (associated project deleted)" }); return;
    }
    if (flowchart.isDeleted) {
      res.status(404).json({ error: "Flowchart not found" }); return;
    }
    if (!flowchart.isPublic) {
      res.status(403).json({ error: "This document is private" }); return;
    }

    let isOwner = false;
    const sessionToken = req.cookies.token;
    if (sessionToken) {
      const { data: { user } } = await supabase.auth.getUser(sessionToken);
      if (user && user.id === flowchart.userId) isOwner = true;
    }

    if (!isOwner) {
      if (flowchart.expiryDate && new Date(flowchart.expiryDate) < new Date()) {
        res.status(403).json({ error: "This share link has expired" }); return;
      }
      const providedToken = (req.headers["x-share-token"] as string) || (req.query.token as string);
      if (flowchart.shareToken && flowchart.shareToken !== providedToken) {
        res.status(401).json({ error: "Invalid access token", requiresToken: true }); return;
      }
    }

    res.json(flowchart);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch public flowchart");
  }
}

export async function updateShare(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const { uid } = req.params;
    const { is_public, share_token, expiry_date } = req.body;
    const userId = (req as any).user.id;

    const result = await fcService.updateFlowchartShare(uid, userId, {
      isPublic: is_public,
      shareToken: share_token,
      expiryDate: expiry_date ? new Date(expiry_date) : null,
    });
    if (!result) { res.status(404).json({ error: "Flowchart not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to update share settings");
  }
}
