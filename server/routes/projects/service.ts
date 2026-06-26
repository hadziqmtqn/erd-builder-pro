import { prisma } from "../../lib/prisma.js";
import { s3Client, R2_BUCKET_NAME } from "../../lib/config.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "../../lib/logger.js";
import { randomUUID } from "crypto";
import { getStorageClientForUser } from "../../lib/storage.js";

// ── List ──

export async function listProjects(
  userId: string,
  params: { limit: number; offset: number; q?: string }
) {
  const { limit, offset, q } = params;
  const searchTerm = q?.trim();

  let whereClause: Record<string, any> = { userId, isDeleted: false };

  if (searchTerm) {
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
        { name: { contains: searchTerm, mode: "insensitive" } },
        { id: { in: Array.from(matchingProjectIds) } },
      ];
    } else {
      whereClause.name = { contains: searchTerm, mode: "insensitive" };
    }
  }

  const [projects, total] = await Promise.all([
    prisma?.project.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    }) || Promise.resolve([]),
    prisma?.project.count({ where: whereClause }) || Promise.resolve(0),
  ]);

  // Uncategorized files
  const searchLower = searchTerm?.toLowerCase();
  const uncategorizedBase = { projectId: null, userId, isDeleted: false } as const;
  const uDiagramFilter: Record<string, any> = { ...uncategorizedBase };
  const uNoteFilter: Record<string, any> = { ...uncategorizedBase };
  const uDrawFilter: Record<string, any> = { ...uncategorizedBase };
  const uFlowFilter: Record<string, any> = { ...uncategorizedBase };

  if (searchLower) {
    uDiagramFilter.name = { contains: searchLower, mode: "insensitive" };
    uNoteFilter.title = { contains: searchLower, mode: "insensitive" };
    uDrawFilter.title = { contains: searchLower, mode: "insensitive" };
    uFlowFilter.title = { contains: searchLower, mode: "insensitive" };
  }

  const [uDiagrams, uNotes, uDrawings, uFlowcharts] = await Promise.all([
    prisma?.diagram.findMany({ where: uDiagramFilter, orderBy: { createdAt: "desc" }, select: { id: true, uid: true, name: true, updatedAt: true, isDeleted: true, projectId: true } }) || Promise.resolve([]),
    prisma?.note.findMany({ where: uNoteFilter, orderBy: { createdAt: "desc" }, select: { id: true, uid: true, title: true, updatedAt: true, isDeleted: true, projectId: true } }) || Promise.resolve([]),
    prisma?.drawing.findMany({ where: uDrawFilter, orderBy: { createdAt: "desc" }, select: { id: true, uid: true, title: true, updatedAt: true, isDeleted: true, projectId: true } }) || Promise.resolve([]),
    prisma?.flowchart.findMany({ where: uFlowFilter, orderBy: { createdAt: "desc" }, select: { id: true, uid: true, title: true, updatedAt: true, isDeleted: true, projectId: true } }) || Promise.resolve([]),
  ]);

  const projectsWithFiles = (projects || []).map((project: any) => ({
    ...project,
    diagrams: [], notes: [], drawings: [], flowcharts: [],
    files_count: 0,
  }));

  return {
    data: projectsWithFiles,
    uncategorized: {
      diagrams: uDiagrams || [],
      notes: uNotes || [],
      drawings: uDrawings || [],
      flowcharts: uFlowcharts || [],
    },
    total: total || 0,
  };
}

// ── Create ──

export async function createProject(name: string, userId: string) {
  const project = await prisma?.project.create({
    data: { name, userId, uid: randomUUID() },
  });
  return project || null;
}

// ── Update ──

export async function updateProject(projectId: number, userId: string, name: string) {
  await prisma?.project.updateMany({
    where: { id: projectId, userId },
    data: { name },
  });
  return { success: true };
}

// ── Soft Delete + Cascade ──

export async function softDeleteProject(projectId: number, userId: string) {
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

  return { success: true };
}

// ── Restore + Cascade ──

export async function restoreProject(projectId: number, userId: string) {
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

  return { success: true };
}

// ── Permanent Delete + Cascade + R2 cleanup ──

export async function permanentDeleteProject(projectId: number, userId: string) {
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

  // Clean up storage images embedded in notes
  const notes = await prisma?.note.findMany({
    where: { projectId, userId },
    select: { content: true },
  });
  const userStorage = await getStorageClientForUser(userId, prisma);
  const cleanupClient = userStorage?.client ?? s3Client;
  const cleanupBucket = userStorage?.bucketName ?? R2_BUCKET_NAME;
  if (notes && notes.length > 0 && cleanupClient && cleanupBucket) {
    for (const note of notes) {
      if (note.content) {
        const regex = /<img[^>]+src="([^">]+)"/g;
        let match;
        while ((match = regex.exec(note.content)) !== null) {
          const url = match[1];
          if (url.includes("erd-builder-pro/")) {
            const key = url.substring(url.indexOf("erd-builder-pro/"));
            try {
              await cleanupClient.send(new DeleteObjectCommand({ Bucket: cleanupBucket, Key: key }));
            } catch (err) {
              logger.error({ err }, "Failed to delete image from storage during project deletion:");
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

  return { success: true };
}

// ── Siblings (AI context) ──

export async function getProjectSiblings(projectId: number, userId: string) {
  if (!prisma) throw new Error("Database connection not available");

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

  return { notes, diagrams: diagramsWithEntities, flowcharts, drawings };
}

// ── Summary (per-project doc counts) ──

export async function getProjectSummary(projectId: number, userId: string) {
  if (!prisma) throw new Error("Database connection not available");

  const [notes, diagrams, flowcharts, drawings] = await Promise.all([
    prisma.note.count({ where: { projectId, userId, isDeleted: false } }),
    prisma.diagram.count({ where: { projectId, userId, isDeleted: false } }),
    prisma.flowchart.count({ where: { projectId, userId, isDeleted: false } }),
    prisma.drawing.count({ where: { projectId, userId, isDeleted: false } }),
  ]);

  return { notes, diagrams, flowcharts, drawings };
}
