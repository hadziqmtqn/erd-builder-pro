import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase, s3Client, R2_BUCKET_NAME } from "../lib/config.js";
import { authenticate } from "../lib/middleware.js";
import { validate, createDrawingSchema } from "../lib/validation.js";
import { handleError, getSafeUpdate } from "../lib/utils.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

router.get("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;
    const projectId = req.query.project_id as string;
    const q = req.query.q as string;
    const isPublic = req.query.is_public === 'true' ? true : req.query.is_public === 'false' ? false : null;

    const where: any = { isDeleted: false, userId: (req as any).user.id };

    if (isPublic !== null) {
      where.isPublic = isPublic;
    }

    if (q && q.trim()) {
      where.title = { contains: q.trim(), mode: 'insensitive' };
    }

    if (projectId === "null") {
      where.projectId = null;
    } else if (projectId && projectId !== "all" && !isNaN(parseInt(projectId))) {
      where.projectId = Number(projectId);
    }

    const deletedProjects = await prisma?.project.findMany({
      where: { isDeleted: true },
      select: { id: true },
    });
    const deletedIds = deletedProjects?.map(p => p.id) || [];

    if (deletedIds.length > 0) {
      where.OR = [
        { projectId: null },
        { projectId: { notIn: deletedIds } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma?.drawing.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: { project: true },
      }) || Promise.resolve([]),
      prisma?.drawing.count({ where }) || Promise.resolve(0),
    ]);

    res.json({ data, total });
  } catch (err: any) {
    handleError(res, err, "Failed to fetch drawings");
  }
});

router.post("/", authenticate, validate(createDrawingSchema), async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { title, data, project_id } = req.body;
    const drawing = await prisma?.drawing.create({
      data: {
        title,
        data: data || "[]",
        projectId: project_id != null ? Number(project_id) : null,
        userId: (req as any).user.id,
      },
    });
    res.json(drawing);
  } catch (err: any) {
    handleError(res, err, "Failed to create drawing");
  }
});

router.get("/public/:uid", async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const drawing = await prisma?.drawing.findUnique({
      where: { uid: req.params.uid },
      include: { project: { select: { name: true, isDeleted: true } } },
    });

    if (!drawing) return res.status(404).json({ error: "Drawing not found" });

    if (drawing.project && drawing.project.isDeleted) {
      return res.status(404).json({ error: "Drawing not found (associated project deleted)" });
    }

    if (drawing.isDeleted) {
      return res.status(404).json({ error: "Drawing not found" });
    }

    if (!drawing.isPublic) {
      return res.status(403).json({ error: "This document is private" });
    }

    let isOwner = false;
    const sessionToken = req.cookies.token;
    if (sessionToken) {
      const { data: { user } } = await supabase.auth.getUser(sessionToken);
      if (user && user.id === drawing.userId) {
        isOwner = true;
      }
    }

    if (!isOwner) {
      if (drawing.expiryDate && new Date(drawing.expiryDate) < new Date()) {
        return res.status(403).json({ error: "This share link has expired" });
      }

      const providedToken = (req.headers['x-share-token'] as string) || (req.query.token as string);
      if (drawing.shareToken && drawing.shareToken !== providedToken) {
        return res.status(401).json({ error: "Invalid access token", requiresToken: true });
      }
    }

    res.json(drawing);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch public drawing");
  }
});

router.put("/:uid/share", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { uid } = req.params;
    const { is_public, share_token, expiry_date } = req.body;

    const currentDrawing = await prisma?.drawing.findFirst({
      where: { uid, userId: (req as any).user.id },
    });

    if (!currentDrawing) return res.status(404).json({ error: "Drawing not found" });

    const updateData: any = {
      isPublic: is_public,
      shareToken: is_public ? share_token : null,
      expiryDate: is_public ? (expiry_date ? new Date(expiry_date) : null) : null,
    };

    if (is_public) {
      if (!currentDrawing.publishedAt) {
        updateData.publishedAt = new Date();
      }
    } else {
      updateData.publishedAt = null;
    }

    const data = await prisma?.drawing.update({
      where: { uid },
      data: updateData,
    });

    res.json(data);
  } catch (err: any) {
    handleError(res, err, "Failed to update share settings");
  }
});

router.get("/:uid", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const drawing = await prisma?.drawing.findFirst({
      where: { uid: req.params.uid, userId: (req as any).user.id },
    });
    if (!drawing) return res.status(404).json({ error: "Drawing not found" });
    res.json(drawing);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch drawing");
  }
});

router.put("/:uid", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { title, data, project_id } = req.body;
    const userId = (req as any).user.id;

    const updateData: any = { updatedAt: new Date() };
    if (title !== undefined) updateData.title = title;
    if (data !== undefined) updateData.data = data;
    if (project_id !== undefined) updateData.projectId = project_id != null ? Number(project_id) : null;

    const existing = await prisma?.drawing.findFirst({
      where: { uid: req.params.uid, userId },
    });
    if (!existing) return res.status(404).json({ error: "Drawing not found" });

    await prisma?.drawing.update({
      where: { id: existing.id },
      data: updateData,
    });

    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to update drawing");
  }
});

router.delete("/:uid", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const userId = (req as any).user.id;
    const existing = await prisma?.drawing.findFirst({
      where: { uid: req.params.uid, userId },
    });
    if (!existing) return res.status(404).json({ error: "Drawing not found" });

    const safeUpdate = getSafeUpdate(true);
    await prisma?.drawing.update({
      where: { id: existing.id },
      data: {
        isDeleted: safeUpdate.is_deleted,
        deletedAt: safeUpdate.deleted_at ? new Date(safeUpdate.deleted_at) : null,
      },
    });
    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to delete drawing");
  }
});

router.post("/:uid/restore", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const userId = (req as any).user.id;
    const existing = await prisma?.drawing.findFirst({
      where: { uid: req.params.uid, userId },
    });
    if (!existing) return res.status(404).json({ error: "Drawing not found" });

    const safeUpdate = getSafeUpdate(false);
    await prisma?.drawing.update({
      where: { id: existing.id },
      data: {
        isDeleted: safeUpdate.is_deleted,
        deletedAt: null,
      },
    });
    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to restore drawing");
  }
});

router.delete("/:uid/permanent", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const drawing = await prisma?.drawing.findFirst({
      where: { uid: req.params.uid, userId: (req as any).user.id },
      select: { data: true },
    });

    if (drawing && drawing.data && s3Client && R2_BUCKET_NAME) {
      try {
        const parsedData = JSON.parse(drawing.data);
        const files = parsedData.files || {};

        const r2Keys: string[] = [];
        for (const fileId in files) {
          const dataURL = files[fileId].dataURL;
          if (typeof dataURL === "string" && dataURL.includes("erd-builder-pro/")) {
            const key = dataURL.substring(dataURL.indexOf("erd-builder-pro/"));
            r2Keys.push(key);
          }
        }

        if (r2Keys.length > 0) {
          logger.info(`Deleting ${r2Keys.length} images from R2 for drawing ${req.params.uid}`);
          const client = s3Client;
          await Promise.all(r2Keys.map(key =>
            client!.send(new DeleteObjectCommand({
              Bucket: R2_BUCKET_NAME,
              Key: key,
            })).catch(err => {
              logger.error({ err }, `Failed to delete R2 object ${key}`);
            })
          ));
        }
      } catch (e) {
        logger.error({ err: e }, "Failed to parse drawing data for R2 cleanup");
      }
    }

    await prisma?.drawing.deleteMany({
      where: { uid: req.params.uid, userId: (req as any).user.id },
    });

    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to permanently delete drawing");
  }
});

export default router;
