import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase } from "../lib/config.js";
import { authenticate } from "../lib/middleware.js";
import { validate, createFlowchartSchema } from "../lib/validation.js";
import { handleError, getSafeUpdate } from "../lib/utils.js";
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

    const conditions: any[] = [
      { isDeleted: false },
      { userId: (req as any).user.id },
    ];

    if (isPublic !== null) {
      conditions.push({ isPublic });
    }

    if (q && q.trim()) {
      conditions.push({ title: { contains: q.trim(), mode: 'insensitive' } });
    }

    if (projectId === "null") {
      conditions.push({ projectId: null });
    } else if (projectId && projectId !== "all" && !isNaN(parseInt(projectId))) {
      conditions.push({ projectId: BigInt(parseInt(projectId)) });
    }

    // Filter out flowcharts belonging to deleted projects
    const deletedProjects = await prisma?.project.findMany({
      where: { isDeleted: true },
      select: { id: true },
    });
    const deletedIds = deletedProjects?.map(p => p.id) || [];

    if (deletedIds.length > 0) {
      conditions.push({
        OR: [
          { projectId: null },
          { projectId: { notIn: deletedIds } },
        ],
      });
    }

    const where = { AND: conditions };

    const [data, total] = await Promise.all([
      prisma?.flowchart.findMany({
        where,
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
          project: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma?.flowchart.count({ where }),
    ]);

    res.json({
      data: data || [],
      total: total || 0,
    });
  } catch (err: any) {
    handleError(res, err, "Failed to fetch flowcharts");
  }
});

router.post("/", authenticate, validate(createFlowchartSchema), async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { title, data, project_id } = req.body;
    if (!prisma) return res.status(500).json({ error: "Database connection not available" });
    const userId = (req as any).user.id;
    const resolvedProjectId = await resolveOwnedProjectId(prisma, userId, project_id);
    const inserted = await prisma?.flowchart.create({
      data: {
        title,
        data: data || '{"nodes":[], "edges":[]}',
        projectId: resolvedProjectId,
        userId,
      },
    });
    res.json(inserted);
  } catch (err: any) {
    handleError(res, err, "Failed to create flowchart");
  }
});

router.get("/public/:uid", async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const flowchart = await prisma?.flowchart.findFirst({
      where: { uid: req.params.uid },
      include: { project: { select: { name: true, isDeleted: true } } },
    });

    if (!flowchart) return res.status(404).json({ error: "Flowchart not found" });

    // Security Check: Is the project deleted?
    if (flowchart.project && flowchart.project.isDeleted) {
      return res.status(404).json({ error: "Flowchart not found (associated project deleted)" });
    }

    // Security Check: Is the flowchart itself deleted?
    if (flowchart.isDeleted) {
      return res.status(404).json({ error: "Flowchart not found" });
    }

    // Security Check: Is it public?
    if (!flowchart.isPublic) {
      return res.status(403).json({ error: "This document is private" });
    }

    // Owner Bypass: Only the document owner can bypass share_token
    let isOwner = false;
    const sessionToken = req.cookies.token;
    if (sessionToken) {
      const { data: { user } } = await supabase.auth.getUser(sessionToken);
      if (user && user.id === flowchart.userId) {
        isOwner = true;
      }
    }

    if (!isOwner) {
      // Security Check: Is it expired?
      if (flowchart.expiryDate && new Date(flowchart.expiryDate) < new Date()) {
        return res.status(403).json({ error: "This share link has expired" });
      }

      // Security Check: Token matching (if required)
      const providedToken = (req.headers['x-share-token'] as string) || (req.query.token as string);
      if (flowchart.shareToken && flowchart.shareToken !== providedToken) {
        return res.status(401).json({ error: "Invalid access token", requiresToken: true });
      }
    }

    res.json(flowchart);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch public flowchart");
  }
});

router.put("/:uid/share", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { uid } = req.params;
    const { is_public, share_token, expiry_date } = req.body;

    const currentFlowchart = await prisma?.flowchart.findFirst({
      where: { uid, userId: (req as any).user.id },
    });

    if (!currentFlowchart) return res.status(404).json({ error: "Flowchart not found" });

    const updateData: any = {
      isPublic: is_public,
      shareToken: is_public ? share_token : null,
      expiryDate: is_public ? (expiry_date ? new Date(expiry_date) : null) : null,
    };

    if (is_public) {
      if (!currentFlowchart.publishedAt) {
        updateData.publishedAt = new Date();
      }
    } else {
      updateData.publishedAt = null;
    }

    const updated = await prisma?.flowchart.update({
      where: { id: currentFlowchart.id },
      data: updateData,
    });

    res.json(updated);
  } catch (err: any) {
    handleError(res, err, "Failed to update share settings");
  }
});

router.get("/:uid", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const flowchart = await prisma?.flowchart.findFirst({
      where: { uid: req.params.uid, userId: (req as any).user.id },
    });
    if (!flowchart) return res.status(404).json({ error: "Flowchart not found" });
    res.json(flowchart);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch flowchart");
  }
});

router.put("/:uid", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { uid } = req.params;
    const { title, data, project_id } = req.body;
    if (!prisma) return res.status(500).json({ error: "Database connection not available" });

    const updateData: any = { updatedAt: new Date() };
    if (title !== undefined) updateData.title = title;
    if (data !== undefined) updateData.data = data;
    if (project_id !== undefined) {
      updateData.projectId = await resolveOwnedProjectId(prisma, (req as any).user.id, project_id);
    }

    const existing = await prisma?.flowchart.findFirst({
      where: { uid, userId: (req as any).user.id },
    });
    if (!existing) return res.status(404).json({ error: "Flowchart not found" });

    await prisma?.flowchart.update({
      where: { id: existing.id },
      data: updateData,
    });

    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to update flowchart");
  }
});

router.delete("/:uid", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const existing = await prisma?.flowchart.findFirst({
      where: { uid: req.params.uid, userId: (req as any).user.id },
    });
    if (!existing) return res.status(404).json({ error: "Flowchart not found" });

    await prisma?.flowchart.update({
      where: { id: existing.id },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to delete flowchart");
  }
});

router.post("/:uid/restore", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const existing = await prisma?.flowchart.findFirst({
      where: { uid: req.params.uid, userId: (req as any).user.id },
    });
    if (!existing) return res.status(404).json({ error: "Flowchart not found" });

    await prisma?.flowchart.update({
      where: { id: existing.id },
      data: { isDeleted: false, deletedAt: null },
    });

    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to restore flowchart");
  }
});

router.delete("/:uid/permanent", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const existing = await prisma?.flowchart.findFirst({
      where: { uid: req.params.uid, userId: (req as any).user.id },
    });
    if (!existing) return res.status(404).json({ error: "Flowchart not found" });

    await prisma?.flowchart.delete({
      where: { id: existing.id },
    });

    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to permanently delete flowchart");
  }
});

export default router;
