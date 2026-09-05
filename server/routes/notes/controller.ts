import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase, s3Client, R2_BUCKET_NAME } from "../../lib/config.js";
import { handleError } from "../../lib/utils.js";
import { resolveNewFileProjectId, resolveOwnedProjectId } from "../../lib/security.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import * as notesService from "./service.js";
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

    const result = await notesService.listNotes(userId, { limit, offset, projectId, q, isPublic });
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch notes");
  }
}

export async function create(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    if (!prisma) { res.status(500).json({ error: "Database connection not available" }); return; }
    const userId = (req as any).user.id;
    const { title, content, project_id, uid } = req.body;
    const resolvedProjectId = await resolveNewFileProjectId(prisma, userId, project_id);

    const note = await notesService.createNote({
      title, content, projectId: resolvedProjectId, userId, uid,
    });
    res.json(note);
  } catch (err: any) {
    handleError(res, err, "Failed to create note");
  }
}

export async function get(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const note = await notesService.getNote(req.params.uid, userId);
    if (!note) { res.status(404).json({ error: "Note not found" }); return; }
    res.json(note);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch note");
  }
}

export async function update(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const { title, content, project_id } = req.body;

    if (!prisma) { res.status(500).json({ error: "Database connection not available" }); return; }

    let resolvedProjectId: number | null | undefined;
    if (project_id !== undefined) {
      resolvedProjectId = await resolveOwnedProjectId(prisma, userId, project_id);
    }

    const result = await notesService.updateNote(req.params.uid, userId, {
      title, content, projectId: resolvedProjectId,
    });
    if (!result) { res.status(404).json({ error: "Note not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to update note");
  }
}

export async function remove(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const result = await notesService.softDeleteNote(req.params.uid, userId);
    if (!result) { res.status(404).json({ error: "Note not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to delete note");
  }
}

export async function restore(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const result = await notesService.restoreNote(req.params.uid, userId);
    if (!result) { res.status(404).json({ error: "Note not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to restore note");
  }
}

export async function permanentDelete(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const note = await notesService.getNoteForPermanentDelete(req.params.uid, userId);
    if (!note) { res.status(404).json({ error: "Note not found" }); return; }

    // Clean up storage images embedded in note content
    // Resolve client from DB config, fall back to env-var s3Client
    const userStorage = await getStorageClientForUser(userId, prisma);
    const cleanupClient = userStorage?.client ?? s3Client;
    const cleanupBucket = userStorage?.bucketName ?? R2_BUCKET_NAME;
    if (note.content && cleanupClient && cleanupBucket) {
      const keys = notesService.extractR2KeysFromContent(note.content);
      await Promise.all(keys.map(key =>
        cleanupClient!.send(new DeleteObjectCommand({ Bucket: cleanupBucket as string, Key: key }))
          .catch(err => logger.error({ err }, "Failed to delete image from storage during note deletion:"))
      ));
    }

    await notesService.permanentDeleteNote(Number(note.id));
    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to permanently delete note");
  }
}

export async function getPublic(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const note = await notesService.getPublicNote(req.params.uid);
    if (!note) { res.status(404).json({ error: "Note not found" }); return; }

    if (note.project?.isDeleted) {
      res.status(404).json({ error: "Note not found (associated project deleted)" }); return;
    }
    if (note.isDeleted) {
      res.status(404).json({ error: "Note not found" }); return;
    }
    if (!note.isPublic) {
      res.status(403).json({ error: "This document is private" }); return;
    }

    // Owner bypass
    let isOwner = false;
    const sessionToken = req.cookies.token;
    if (sessionToken) {
      const { data: { user } } = await supabase.auth.getUser(sessionToken);
      if (user && user.id === note.userId) isOwner = true;
    }

    if (!isOwner) {
      if (note.expiryDate && new Date(note.expiryDate) < new Date()) {
        res.status(403).json({ error: "This share link has expired" }); return;
      }
      const providedToken = (req.headers["x-share-token"] as string) || (req.query.token as string);
      if (note.shareToken && note.shareToken !== providedToken) {
        res.status(401).json({ error: "Invalid access token", requiresToken: true }); return;
      }
    }

    res.json(note);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch public note");
  }
}

export async function updateShare(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const { uid } = req.params;
    const { is_public, share_token, expiry_date } = req.body;
    const userId = (req as any).user.id;

    const result = await notesService.updateNoteShare(uid, userId, {
      isPublic: is_public,
      shareToken: share_token,
      expiryDate: expiry_date ? new Date(expiry_date) : null,
    });
    if (!result) { res.status(404).json({ error: "Note not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to update share settings");
  }
}
