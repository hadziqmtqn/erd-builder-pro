import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase, s3Client, R2_BUCKET_NAME } from "../lib/config.js";
import { authenticate } from "../lib/middleware.js";
import { validate, createNoteSchema } from "../lib/validation.js";
import { handleError, uidOrIdWhere } from "../lib/utils.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { resolveOwnedProjectId } from "../lib/security.js";

const router = Router();

router.get("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;
    const projectId = req.query.project_id as string;
    const q = req.query.q as string;
    const isPublic = req.query.is_public === 'true' ? true : req.query.is_public === 'false' ? false : null;

    const where: any = {
      isDeleted: false,
      userId: (req as any).user.id,
    };

    if (isPublic !== null) {
      where.isPublic = isPublic;
    }

    if (q && q.trim()) {
      where.title = { contains: q.trim(), mode: 'insensitive' };
    }

    if (projectId === "null") {
      where.projectId = null;
    } else if (projectId && projectId !== "all" && !isNaN(parseInt(projectId))) {
      where.projectId = parseInt(projectId);
    }

    const deletedProjects = await prisma?.project.findMany({
      where: { isDeleted: true },
      select: { id: true },
    });
    const deletedIds = deletedProjects?.map((p) => p.id) || [];

    if (deletedIds.length > 0) {
      where.OR = [
        { projectId: null },
        { projectId: { notIn: deletedIds } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma?.note.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          uid: true,
          title: true,
          projectId: true,
          isPublic: true,
          shareToken: true,
          expiryDate: true,
          createdAt: true,
          updatedAt: true,
          isDeleted: true,
          userId: true,
          project: { select: { name: true, uid: true, id: true } },
        },
      }),
      prisma?.note.count({ where }),
    ]);

    res.json({
      data: data || [],
      total: total || 0,
    });
  } catch (err: any) {
    handleError(res, err, "Failed to fetch notes");
  }
});

router.post("/", authenticate, validate(createNoteSchema), async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { title, content, project_id, uid } = req.body;
    if (!prisma) return res.status(500).json({ error: "Database connection not available" });
    const userId = (req as any).user.id;
    const resolvedProjectId = await resolveOwnedProjectId(prisma, userId, project_id);
    const note = await prisma?.note.create({
      data: {
        title,
        content: content || "",
        projectId: resolvedProjectId,
        userId,
        ...(uid ? { uid } : {}),
      },
    });
    res.json(note);
  } catch (err: any) {
    handleError(res, err, "Failed to create note");
  }
});

router.get("/public/:uid", async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const note = await prisma?.note.findUnique({
      where: { uid: req.params.uid },
      include: { project: { select: { name: true, isDeleted: true } } },
    });

    if (!note) return res.status(404).json({ error: "Note not found" });

    if (note.project && note.project.isDeleted) {
      return res.status(404).json({ error: "Note not found (associated project deleted)" });
    }

    if (note.isDeleted) {
      return res.status(404).json({ error: "Note not found" });
    }

    if (!note.isPublic) {
      return res.status(403).json({ error: "This document is private" });
    }

    let isOwner = false;
    const sessionToken = req.cookies.token;
    if (sessionToken) {
      const { data: { user } } = await supabase.auth.getUser(sessionToken);
      if (user && user.id === note.userId) {
        isOwner = true;
      }
    }

    if (!isOwner) {
      if (note.expiryDate && new Date(note.expiryDate) < new Date()) {
        return res.status(403).json({ error: "This share link has expired" });
      }

      const providedToken = (req.headers['x-share-token'] as string) || (req.query.token as string);
      if (note.shareToken && note.shareToken !== providedToken) {
        return res.status(401).json({ error: "Invalid access token", requiresToken: true });
      }
    }

    res.json(note);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch public note");
  }
});

router.put("/:uid/share", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { uid } = req.params;
    const { is_public, share_token, expiry_date } = req.body;

    const currentNote = await prisma?.note.findFirst({
      where: uidOrIdWhere(uid, (req as any).user.id),
    });

    if (!currentNote) return res.status(404).json({ error: "Note not found" });

    const updateData: any = {
      isPublic: is_public,
      shareToken: is_public ? share_token : null,
      expiryDate: is_public ? expiry_date ? new Date(expiry_date) : null : null,
    };

    if (is_public) {
      if (!currentNote.publishedAt) {
        updateData.publishedAt = new Date();
      }
    } else {
      updateData.publishedAt = null;
    }

    const updated = await prisma?.note.update({
      where: { id: currentNote.id },
      data: updateData,
    });

    res.json(updated);
  } catch (err: any) {
    handleError(res, err, "Failed to update share settings");
  }
});

router.get("/:uid", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const note = await prisma?.note.findFirst({
      where: uidOrIdWhere(req.params.uid, (req as any).user.id),
    });
    if (!note) return res.status(404).json({ error: "Note not found" });
    res.json(note);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch note");
  }
});

router.put("/:uid", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { title, content, project_id } = req.body;
    if (!prisma) return res.status(500).json({ error: "Database connection not available" });

    const existing = await prisma?.note.findFirst({
      where: uidOrIdWhere(req.params.uid, (req as any).user.id),
    });
    if (!existing) return res.status(404).json({ error: "Note not found" });

    const userId = (req as any).user.id;
    const updateData: any = { updatedAt: new Date() };
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (project_id !== undefined) updateData.projectId = await resolveOwnedProjectId(prisma, userId, project_id);

    await prisma?.note.update({
      where: { id: existing.id },
      data: updateData,
    });

    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to update note");
  }
});

router.delete("/:uid", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const existing = await prisma?.note.findFirst({
      where: uidOrIdWhere(req.params.uid, (req as any).user.id),
    });
    if (!existing) return res.status(404).json({ error: "Note not found" });

    await prisma?.note.update({
      where: { id: existing.id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to delete note");
  }
});

router.post("/:uid/restore", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const existing = await prisma?.note.findFirst({
      where: uidOrIdWhere(req.params.uid, (req as any).user.id),
    });
    if (!existing) return res.status(404).json({ error: "Note not found" });

    await prisma?.note.update({
      where: { id: existing.id },
      data: {
        isDeleted: false,
        deletedAt: null,
      },
    });

    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to restore note");
  }
});

router.delete("/:uid/permanent", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const note = await prisma?.note.findFirst({
      where: uidOrIdWhere(req.params.uid, (req as any).user.id),
      select: { content: true, id: true },
    });

    if (!note) return res.status(404).json({ error: "Note not found" });

    if (note.content && s3Client && R2_BUCKET_NAME) {
      const regex = /<img[^>]+src="([^">]+)"/g;
      let match;
      while ((match = regex.exec(note.content)) !== null) {
        const url = match[1];
        if (url.includes('erd-builder-pro/')) {
          const key = url.substring(url.indexOf('erd-builder-pro/'));
          try {
            await s3Client.send(new DeleteObjectCommand({
              Bucket: R2_BUCKET_NAME,
              Key: key,
            }));
          } catch (err) {
            logger.error({ err: err }, "Failed to delete image from R2 during note deletion:");
          }
        }
      }
    }

    await prisma?.note.delete({
      where: { id: note.id },
    });

    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to permanently delete note");
  }
});

export default router;
