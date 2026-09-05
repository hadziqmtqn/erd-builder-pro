import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase, s3Client, R2_BUCKET_NAME } from "../../lib/config.js";
import { handleError } from "../../lib/utils.js";
import { resolveNewFileProjectId, resolveOwnedProjectId } from "../../lib/security.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import * as drawingsService from "./service.js";
import { getStorageClientForUser } from "../../lib/storage.js";

export async function list(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;
    const projectId = req.query.project_id as string;
    const q = req.query.q as string;
    const rawPublic = req.query.is_public as string;
    const isPublic = rawPublic === "true" ? true : rawPublic === "false" ? false : null;
    const userId = (req as any).user.id;

    const result = await drawingsService.listDrawings(userId, { limit, offset, projectId, q, isPublic });
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch drawings");
  }
}

export async function create(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    if (!prisma) { res.status(500).json({ error: "Database connection not available" }); return; }
    const userId = (req as any).user.id;
    const { title, data, project_id, uid } = req.body;
    const resolvedProjectId = await resolveNewFileProjectId(prisma, userId, project_id);

    const drawing = await drawingsService.createDrawing({
      title, drawingData: data, projectId: resolvedProjectId, userId, uid,
    });
    res.json(drawing);
  } catch (err: any) {
    handleError(res, err, "Failed to create drawing");
  }
}

export async function get(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const drawing = await drawingsService.getDrawing(req.params.uid, userId);
    if (!drawing) { res.status(404).json({ error: "Drawing not found" }); return; }
    res.json(drawing);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch drawing");
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

    const result = await drawingsService.updateDrawing(req.params.uid, userId, {
      title, drawingData: data, projectId: resolvedProjectId,
    });
    if (!result) { res.status(404).json({ error: "Drawing not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to update drawing");
  }
}

export async function remove(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const result = await drawingsService.softDeleteDrawing(req.params.uid, userId);
    if (!result) { res.status(404).json({ error: "Drawing not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to delete drawing");
  }
}

export async function restore(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const result = await drawingsService.restoreDrawing(req.params.uid, userId);
    if (!result) { res.status(404).json({ error: "Drawing not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to restore drawing");
  }
}

export async function permanentDelete(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const drawing = await drawingsService.getDrawingForPermanentDelete(req.params.uid, userId);
    if (!drawing) { res.status(404).json({ error: "Drawing not found" }); return; }

    // Clean up storage images embedded in Excalidraw data
    const userStorage = await getStorageClientForUser(userId, prisma);
    const cleanupClient = userStorage?.client ?? s3Client;
    const cleanupBucket = userStorage?.bucketName ?? R2_BUCKET_NAME;
    if (drawing.data && cleanupClient && cleanupBucket) {
      const keys = drawingsService.extractR2KeysFromDrawingData(drawing.data);
      if (keys.length > 0) {
        logger.info(`Deleting ${keys.length} images from storage for drawing ${req.params.uid}`);
        await Promise.all(keys.map(key =>
          cleanupClient!.send(new DeleteObjectCommand({ Bucket: cleanupBucket as string, Key: key }))
            .catch(err => logger.error({ err }, `Failed to delete storage object ${key}`))
        ));
      }
    }

    await drawingsService.permanentDeleteDrawing(Number(drawing.id));
    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to permanently delete drawing");
  }
}

export async function getPublic(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const drawing = await drawingsService.getPublicDrawing(req.params.uid);
    if (!drawing) { res.status(404).json({ error: "Drawing not found" }); return; }

    if (drawing.project?.isDeleted) {
      res.status(404).json({ error: "Drawing not found (associated project deleted)" }); return;
    }
    if (drawing.isDeleted) {
      res.status(404).json({ error: "Drawing not found" }); return;
    }
    if (!drawing.isPublic) {
      res.status(403).json({ error: "This document is private" }); return;
    }

    let isOwner = false;
    const sessionToken = req.cookies.token;
    if (sessionToken) {
      const { data: { user } } = await supabase.auth.getUser(sessionToken);
      if (user && user.id === drawing.userId) isOwner = true;
    }

    if (!isOwner) {
      if (drawing.expiryDate && new Date(drawing.expiryDate) < new Date()) {
        res.status(403).json({ error: "This share link has expired" }); return;
      }
      const providedToken = (req.headers["x-share-token"] as string) || (req.query.token as string);
      if (drawing.shareToken && drawing.shareToken !== providedToken) {
        res.status(401).json({ error: "Invalid access token", requiresToken: true }); return;
      }
    }

    res.json(drawing);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch public drawing");
  }
}

export async function updateShare(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const { uid } = req.params;
    const { is_public, share_token, expiry_date } = req.body;
    const userId = (req as any).user.id;

    const result = await drawingsService.updateDrawingShare(uid, userId, {
      isPublic: is_public,
      shareToken: share_token,
      expiryDate: expiry_date ? new Date(expiry_date) : null,
    });
    if (!result) { res.status(404).json({ error: "Drawing not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to update share settings");
  }
}
