import { prisma } from "../../lib/prisma.js";
import { s3Client, R2_BUCKET_NAME } from "../../lib/config.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "../../lib/logger.js";
import { randomUUID } from "crypto";
import { getStorageClientForUser } from "../../lib/storage.js";
import { isDesktopMode } from "../../lib/config.js";
import { currentTeamScope, fileScopeWhere, projectScopeWhere } from "../../lib/team-scope.js";

// ── List ──

export async function listProjects(
  userId: string,
  params: { limit: number; offset: number; q?: string }
) {
  const { limit, offset, q } = params;
  const searchTerm = q?.trim();

  let whereClause: Record<string, any> = { ...projectScopeWhere(userId), isDeleted: false };
  const fileScope = fileScopeWhere(userId);

  if (searchTerm) {
    const containsFilter = (value: string) => ({ contains: value } as any);

    const [dMatches, nMatches, drMatches, fMatches, cMatches] = await Promise.all([
      prisma?.diagram.findMany({
        where: { name: containsFilter(searchTerm), ...fileScope, projectId: { not: null }, isDeleted: false, AND: [{ OR: [{ sourceType: null }, { sourceType: { not: "production_db" } }] }] },
        select: { projectId: true },
      }),
      prisma?.note.findMany({
        where: { title: containsFilter(searchTerm), ...fileScope, projectId: { not: null }, isDeleted: false },
        select: { projectId: true },
      }),
      prisma?.drawing.findMany({
        where: { title: containsFilter(searchTerm), ...fileScope, projectId: { not: null }, isDeleted: false },
        select: { projectId: true },
      }),
      prisma?.flowchart.findMany({
        where: { title: containsFilter(searchTerm), ...fileScope, projectId: { not: null }, isDeleted: false },
        select: { projectId: true },
      }),
      isDesktopMode() ? (prisma as any)?.dbClient.findMany({
        where: { name: containsFilter(searchTerm), userId, projectId: { not: null }, isDeleted: false },
        select: { projectId: true },
      }) : Promise.resolve([]),
    ]);

    const matchingProjectIds = new Set<number>([
      ...(dMatches || []).map(m => Number(m.projectId)).filter(n => !isNaN(n)),
      ...(nMatches || []).map(m => Number(m.projectId)).filter(n => !isNaN(n)),
      ...(drMatches || []).map(m => Number(m.projectId)).filter(n => !isNaN(n)),
      ...(fMatches || []).map(m => Number(m.projectId)).filter(n => !isNaN(n)),
      ...(cMatches || []).map((m: any) => Number(m.projectId)).filter((n: number) => !isNaN(n)),
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
  const uncategorizedBase = { ...fileScope, projectId: null, isDeleted: false } as const;
  const uDiagramFilter: Record<string, any> = { ...uncategorizedBase, OR: [{ sourceType: null }, { sourceType: { not: "production_db" } }] };
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
  const scope = currentTeamScope();
  const project = await prisma?.project.create({
    data: { name, userId, uid: randomUUID(), ...(scope?.mode === "team" ? { teamId: scope.teamId } : {}) },
  });
  return project || null;
}

// ── Update ──

export async function updateProject(projectId: number, userId: string, name: string) {
  await prisma?.project.updateMany({
    where: { id: projectId, ...projectScopeWhere(userId) },
    data: { name },
  });
  return { success: true };
}

// ── Soft Delete + Cascade ──

export async function softDeleteProject(projectId: number, userId: string) {
  const now = new Date();

  const project = await prisma?.project.findFirst({ where: { id: projectId, ...projectScopeWhere(userId) }, select: { id: true } });
  if (!project) return { success: false };
  await prisma?.project.updateMany({
    where: { id: projectId },
    data: { isDeleted: true, deletedAt: now },
  });

  try {
    await Promise.all([
      prisma?.diagram.updateMany({ where: { projectId }, data: { isDeleted: true, deletedAt: now } }),
      prisma?.note.updateMany({ where: { projectId }, data: { isDeleted: true, deletedAt: now } }),
      prisma?.drawing.updateMany({ where: { projectId }, data: { isDeleted: true, deletedAt: now } }),
      prisma?.flowchart.updateMany({ where: { projectId }, data: { isDeleted: true, deletedAt: now } }),
      isDesktopMode() ? (prisma as any).dbClient.updateMany({ where: { projectId, userId }, data: { isDeleted: true, deletedAt: now } }) : Promise.resolve(),
    ]);
  } catch (err) {
    logger.error({ err }, "Cascading soft delete failed:");
  }

  return { success: true };
}

// ── Restore + Cascade ──

export async function restoreProject(projectId: number, userId: string) {
  const project = await prisma?.project.findFirst({ where: { id: projectId, ...projectScopeWhere(userId) }, select: { id: true } });
  if (!project) return { success: false };
  await prisma?.project.updateMany({
    where: { id: projectId },
    data: { isDeleted: false, deletedAt: null },
  });

  try {
    await Promise.all([
      prisma?.diagram.updateMany({ where: { projectId }, data: { isDeleted: false, deletedAt: null } }),
      prisma?.note.updateMany({ where: { projectId }, data: { isDeleted: false, deletedAt: null } }),
      prisma?.drawing.updateMany({ where: { projectId }, data: { isDeleted: false, deletedAt: null } }),
      prisma?.flowchart.updateMany({ where: { projectId }, data: { isDeleted: false, deletedAt: null } }),
      isDesktopMode() ? (prisma as any).dbClient.updateMany({ where: { projectId, userId }, data: { isDeleted: false, deletedAt: null } }) : Promise.resolve(),
    ]);
  } catch (err) {
    logger.error({ err }, "Cascading restore failed:");
  }

  return { success: true };
}

// ── Permanent Delete + Cascade + R2 cleanup ──

export async function permanentDeleteProject(projectId: number, userId: string) {
  const project = await prisma?.project.findFirst({ where: { id: projectId, ...projectScopeWhere(userId) }, select: { id: true } });
  if (!project) return { success: false };
  if (isDesktopMode()) {
    await (prisma as any)?.dbClient.deleteMany({ where: { projectId, userId } });
  }
  const diagrams = await prisma?.diagram.findMany({
    where: { projectId },
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
    where: { projectId },
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

  await prisma?.note.deleteMany({ where: { projectId } });
  await prisma?.drawing.deleteMany({ where: { projectId } });
  await prisma?.flowchart.deleteMany({ where: { projectId } });
  await prisma?.project.deleteMany({ where: { id: projectId } });

  return { success: true };
}

// ── Siblings (AI context) ──

export async function getProjectSiblings(projectId: number, userId: string) {
  if (!prisma) throw new Error("Database connection not available");

  const project = await prisma.project.findFirst({ where: { id: projectId, ...projectScopeWhere(userId), isDeleted: false }, select: { id: true } });
  if (!project) return { notes: [], diagrams: [], flowcharts: [] };
  const [notes, diagrams, flowcharts] = await Promise.all([
    prisma.note.findMany({
      where: { projectId, isDeleted: false },
      select: { uid: true, title: true, content: true, updatedAt: true },
    }),
    prisma.diagram.findMany({
      where: { projectId, isDeleted: false, OR: [{ sourceType: null }, { sourceType: { not: "production_db" } }] },
      select: { id: true, uid: true, name: true, sourceType: true, updatedAt: true },
    }),
    prisma.flowchart.findMany({
      where: { projectId, isDeleted: false },
      select: { uid: true, title: true, data: true, updatedAt: true },
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

  return { notes, diagrams: diagramsWithEntities, flowcharts };
}

// ── Summary (per-project doc counts) ──

export async function getProjectSummary(projectId: number, userId: string, includeDbClient = true) {
  if (!prisma) throw new Error("Database connection not available");

  const project = await prisma.project.findFirst({ where: { id: projectId, ...projectScopeWhere(userId), isDeleted: false }, select: { id: true } });
  if (!project) return { notes: 0, diagrams: 0, flowcharts: 0, drawings: 0, dbClients: 0 };
  const diagramWhere = { projectId, isDeleted: false, OR: [{ sourceType: { not: "production_db" } }, { sourceType: null }] };
  const [notes, diagrams, flowcharts, drawings, dbClients] = await Promise.all([
    prisma.note.count({ where: { projectId, isDeleted: false } }),
    prisma.diagram.count({ where: diagramWhere }),
    prisma.flowchart.count({ where: { projectId, isDeleted: false } }),
    prisma.drawing.count({ where: { projectId, isDeleted: false } }),
    includeDbClient && isDesktopMode()
      ? (prisma as any).dbClient.count({ where: { projectId, userId, isDeleted: false } })
      : Promise.resolve(0),
  ]);

  return { notes, diagrams, flowcharts, drawings, dbClients };
}

export async function listProjectFiles(projectId: number, userId: string, includeDbClient = true) {
  if (!prisma) throw new Error("Database connection not available");

  const where = { projectId, isDeleted: false };
  const [project, notes, diagrams, flowcharts, drawings, dbClients] = await Promise.all([
    prisma.project.findFirst({ where: { id: projectId, ...projectScopeWhere(userId), isDeleted: false }, select: { id: true } }),
    prisma.note.findMany({ where, select: { id: true, uid: true, title: true, createdAt: true } }),
    prisma.diagram.findMany({ where: { ...where, OR: [{ sourceType: null }, { sourceType: { not: "production_db" } }] }, select: { id: true, uid: true, name: true, createdAt: true } }),
    prisma.flowchart.findMany({ where, select: { id: true, uid: true, title: true, createdAt: true } }),
    prisma.drawing.findMany({ where, select: { id: true, uid: true, title: true, createdAt: true } }),
    includeDbClient && isDesktopMode()
      ? (prisma as any).dbClient.findMany({ where, select: { id: true, uid: true, name: true, createdAt: true } })
      : Promise.resolve([]),
  ]);
  if (!project) return { data: [] };

  const files = [
    ...notes.map(file => ({ type: "notes", uid: String(file.uid ?? file.id), title: file.title, createdAt: file.createdAt })),
    ...diagrams.map(file => ({ type: "erd", uid: String(file.uid ?? file.id), title: file.name, createdAt: file.createdAt })),
    ...flowcharts.map(file => ({ type: "flowchart", uid: String(file.uid ?? file.id), title: file.title, createdAt: file.createdAt })),
    ...drawings.map(file => ({ type: "drawings", uid: String(file.uid ?? file.id), title: file.title, createdAt: file.createdAt })),
    ...(dbClients as any[]).map(file => ({ type: "db-client", uid: String(file.uid ?? file.id), title: file.name, createdAt: file.createdAt })),
  ];

  return { data: files.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) };
}
