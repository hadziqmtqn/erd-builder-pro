import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { prisma } from "../lib/prisma.js";
import { s3Client, R2_BUCKET_NAME } from "../lib/config.js";
import { authenticate } from "../lib/middleware.js";
import { handleError, getSafeUpdate } from "../lib/utils.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "../lib/logger.js";

const router = Router();

router.get("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;
    const q = req.query.q as string;
    const userId = (req as any).user.id;
    const searchLower = q?.trim().toLowerCase();

    const childSelect = {
      id: true, uid: true, updatedAt: true, createdAt: true, isDeleted: true, projectId: true,
    } as const;

    let whereClause: Record<string, any> = { userId, isDeleted: false };

    if (q && q.trim()) {
      const searchTerm = q.trim();
      const containsFilter = (value: string) => ({ contains: value } as any);

      const [dMatches, nMatches, drMatches, fMatches] = await Promise.all([
        prisma?.diagram.findMany({
          where: { name: containsFilter(searchTerm), userId, projectId: { not: null }, isDeleted: false },
          select: { projectId: true },
        }),
        prisma?.note.findMany({
          where: { title: containsFilter(searchTerm), userId, projectId: { not: null }, isDeleted: false },
          select: { projectId: true },
        }),
        prisma?.drawing.findMany({
          where: { title: containsFilter(searchTerm), userId, projectId: { not: null }, isDeleted: false },
          select: { projectId: true },
        }),
        prisma?.flowchart.findMany({
          where: { title: containsFilter(searchTerm), userId, projectId: { not: null }, isDeleted: false },
          select: { projectId: true },
        }),
      ]);

      const matchingProjectIds = new Set<number>([
        ...(dMatches || []).map(m => Number(m.projectId)).filter(n => !isNaN(n)),
        ...(nMatches || []).map(m => Number(m.projectId)).filter(n => !isNaN(n)),
        ...(drMatches || []).map(m => Number(m.projectId)).filter(n => !isNaN(n)),
        ...(fMatches || []).map(m => Number(m.projectId)).filter(n => !isNaN(n)),
      ]);

      if (matchingProjectIds.size > 0) {
        whereClause.OR = [
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { id: { in: Array.from(matchingProjectIds) } },
        ];
      } else {
        whereClause.name = { contains: searchTerm, mode: 'insensitive' };
      }
    }

    const [projects, total] = await Promise.all([
      prisma?.project.findMany({
        where: whereClause,
        include: {
          diagrams: {
            where: { isDeleted: false },
            orderBy: { createdAt: 'desc' },
            select: { ...childSelect, name: true },
          },
          notes: {
            where: { isDeleted: false },
            orderBy: { createdAt: 'desc' },
            select: { ...childSelect, title: true, content: true },
          },
          drawings: {
            where: { isDeleted: false },
            orderBy: { createdAt: 'desc' },
            select: { ...childSelect, title: true },
          },
          flowcharts: {
            where: { isDeleted: false },
            orderBy: { createdAt: 'desc' },
            select: { ...childSelect, title: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma?.project.count({ where: whereClause }),
    ]);

    const projectsWithFiles = (projects || []).map((project: any) => {
      let diagrams = project.diagrams || [];
      let notes = project.notes || [];
      let drawings = project.drawings || [];
      let flowcharts = project.flowcharts || [];

      if (searchLower) {
        diagrams = diagrams.filter((f: any) => f.name?.toLowerCase().includes(searchLower));
        notes = notes.filter((f: any) => f.title?.toLowerCase().includes(searchLower));
        drawings = drawings.filter((f: any) => f.title?.toLowerCase().includes(searchLower));
        flowcharts = flowcharts.filter((f: any) => f.title?.toLowerCase().includes(searchLower));
      }

      return {
        ...project,
        diagrams,
        notes,
        drawings,
        flowcharts,
        files_count: diagrams.length + notes.length + drawings.length + flowcharts.length,
      };
    });

    const uncategorizedBase = { projectId: null, userId, isDeleted: false } as const;
    const uDiagramFilter: Record<string, any> = { ...uncategorizedBase };
    const uNoteFilter: Record<string, any> = { ...uncategorizedBase };
    const uDrawFilter: Record<string, any> = { ...uncategorizedBase };
    const uFlowFilter: Record<string, any> = { ...uncategorizedBase };

    if (searchLower) {
      uDiagramFilter.name = { contains: searchLower, mode: 'insensitive' };
      uNoteFilter.title = { contains: searchLower, mode: 'insensitive' };
      uDrawFilter.title = { contains: searchLower, mode: 'insensitive' };
      uFlowFilter.title = { contains: searchLower, mode: 'insensitive' };
    }

    const [uDiagrams, uNotes, uDrawings, uFlowcharts] = await Promise.all([
      prisma?.diagram.findMany({ where: uDiagramFilter, orderBy: { createdAt: 'desc' }, select: { id: true, uid: true, name: true, updatedAt: true, isDeleted: true, projectId: true } }),
      prisma?.note.findMany({ where: uNoteFilter, orderBy: { createdAt: 'desc' }, select: { id: true, uid: true, title: true, updatedAt: true, isDeleted: true, projectId: true } }),
      prisma?.drawing.findMany({ where: uDrawFilter, orderBy: { createdAt: 'desc' }, select: { id: true, uid: true, title: true, updatedAt: true, isDeleted: true, projectId: true } }),
      prisma?.flowchart.findMany({ where: uFlowFilter, orderBy: { createdAt: 'desc' }, select: { id: true, uid: true, title: true, updatedAt: true, isDeleted: true, projectId: true } }),
    ]);

    res.json({
      data: projectsWithFiles,
      uncategorized: {
        diagrams: uDiagrams || [],
        notes: uNotes || [],
        drawings: uDrawings || [],
        flowcharts: uFlowcharts || [],
      },
      total: total || 0,
    });
  } catch (err: any) {
    handleError(res, err, "Failed to fetch projects");
  }
});

router.post("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { name } = req.body;
    const userId = (req as any).user.id;
    const project = await prisma?.project.create({
      data: { name, userId },
    });
    if (!project) return res.status(500).json({ error: "Failed to create project" });
    res.json(project);
  } catch (err: any) {
    handleError(res, err, "Failed to create project");
  }
});

router.put("/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { name } = req.body;
    await prisma?.project.updateMany({
      where: { id: Number(req.params.id), userId: (req as any).user.id },
      data: { name },
    });
    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to update project");
  }
});

router.delete("/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const projectId = Number(req.params.id);
    const userId = (req as any).user.id;
    const now = new Date();

    await prisma?.project.updateMany({
      where: { id: projectId, userId },
      data: { isDeleted: true, deletedAt: now },
    });

    try {
      await Promise.all([
        prisma?.diagram.updateMany({ where: { projectId, userId }, data: { isDeleted: true, deletedAt: now } }),
        prisma?.note.updateMany({ where: { projectId, userId }, data: { isDeleted: true, deletedAt: now } }),
        prisma?.drawing.updateMany({ where: { projectId, userId }, data: { isDeleted: true, deletedAt: now } }),
        prisma?.flowchart.updateMany({ where: { projectId, userId }, data: { isDeleted: true, deletedAt: now } }),
      ]);
    } catch (err) {
      logger.error({ err }, "Cascading soft delete failed:");
    }

    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to delete project");
  }
});

router.post("/:id/restore", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const projectId = Number(req.params.id);
    const userId = (req as any).user.id;

    await prisma?.project.updateMany({
      where: { id: projectId, userId },
      data: { isDeleted: false, deletedAt: null },
    });

    try {
      await Promise.all([
        prisma?.diagram.updateMany({ where: { projectId, userId }, data: { isDeleted: false, deletedAt: null } }),
        prisma?.note.updateMany({ where: { projectId, userId }, data: { isDeleted: false, deletedAt: null } }),
        prisma?.drawing.updateMany({ where: { projectId, userId }, data: { isDeleted: false, deletedAt: null } }),
        prisma?.flowchart.updateMany({ where: { projectId, userId }, data: { isDeleted: false, deletedAt: null } }),
      ]);
    } catch (err) {
      logger.error({ err }, "Cascading restore failed:");
    }

    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to restore project");
  }
});

router.delete("/:id/permanent", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const projectId = Number(req.params.id);
    const userId = (req as any).user.id;

    const diagrams = await prisma?.diagram.findMany({
      where: { projectId, userId },
      select: { id: true },
    });
    const diagramIds = diagrams?.map(d => d.id) || [];

    if (diagramIds.length > 0) {
      await prisma?.relationship.deleteMany({ where: { diagramId: { in: diagramIds } } });
      const entities = await prisma?.entity.findMany({
        where: { diagramId: { in: diagramIds } },
        select: { id: true },
      });
      const entityIds = entities?.map(e => e.id) || [];
      if (entityIds.length > 0) {
        await prisma?.column.deleteMany({ where: { entityId: { in: entityIds } } });
      }
      await prisma?.entity.deleteMany({ where: { diagramId: { in: diagramIds } } });
      await prisma?.diagram.deleteMany({ where: { id: { in: diagramIds } } });
    }

    const notes = await prisma?.note.findMany({
      where: { projectId, userId },
      select: { content: true },
    });
    if (notes && notes.length > 0 && s3Client && R2_BUCKET_NAME) {
      for (const note of notes) {
        if (note.content) {
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
                logger.error({ err }, "Failed to delete image from R2 during project deletion:");
              }
            }
          }
        }
      }
    }

    await prisma?.note.deleteMany({ where: { projectId, userId } });
    await prisma?.drawing.deleteMany({ where: { projectId, userId } });
    await prisma?.flowchart.deleteMany({ where: { projectId, userId } });
    await prisma?.project.deleteMany({ where: { id: projectId, userId } });

    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to permanently delete project");
  }
});

// ── Siblings endpoint — returns all project files for AI context ──
router.get("/:id/siblings", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const projectId = Number(req.params.id);
    const userId = (req as any).user.id;
    if (!prisma) return res.status(500).json({ error: "Database connection not available" });

    const [notes, diagrams, flowcharts, drawings] = await Promise.all([
      prisma.note.findMany({
        where: { projectId, userId, isDeleted: false },
        select: { uid: true, title: true, content: true, updatedAt: true },
      }),
      prisma.diagram.findMany({
        where: { projectId, userId, isDeleted: false },
        select: { id: true, uid: true, name: true, updatedAt: true },
      }),
      prisma.flowchart.findMany({
        where: { projectId, userId, isDeleted: false },
        select: { uid: true, title: true, data: true, updatedAt: true },
      }),
      prisma.drawing.findMany({
        where: { projectId, userId, isDeleted: false },
        select: { uid: true, title: true, updatedAt: true },
      }),
    ]);

    // Fetch entities + columns for all diagrams
    const diagramIds = diagrams.map(d => d.id);
    const entities = diagramIds.length > 0
      ? await prisma.entity.findMany({ where: { diagramId: { in: diagramIds } } })
      : [];
    const entityIds = entities.map(e => e.id);
    const columns = entityIds.length > 0
      ? await prisma.column.findMany({ where: { entityId: { in: entityIds } } })
      : [];

    const colsByEntity: Record<string, typeof columns> = {};
    for (const col of columns) {
      if (!colsByEntity[col.entityId!]) colsByEntity[col.entityId!] = [];
      colsByEntity[col.entityId!].push(col);
    }

    const diagramsWithEntities = diagrams.map(d => ({
      ...d,
      entities: entities
        .filter(e => e.diagramId === d.id)
        .map(e => ({
          ...e,
          columns: colsByEntity[e.id] || [],
        })),
    }));

    res.json({ notes, diagrams: diagramsWithEntities, flowcharts, drawings });
  } catch (err: any) {
    handleError(res, err, "Failed to fetch siblings");
  }
});

export default router;
