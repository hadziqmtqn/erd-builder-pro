import { prisma } from "../../lib/prisma.js";

// ── Helpers ──

function uidWhere(uid: string, userId: string) {
  const id = Number(uid);
  return Number.isFinite(id)
    ? { OR: [{ uid }, { id }], userId }
    : { uid, userId };
}

function whereClause(userId: string, query: {
  projectId?: string | null;
  q?: string;
  isPublic?: boolean | null;
  sourceType?: string;
}) {
  const where: any = { isDeleted: false, userId };

  if (query.isPublic !== null && query.isPublic !== undefined) {
    where.isPublic = query.isPublic;
  }
  if (query.sourceType) {
    where.sourceType = query.sourceType;
  }
  if (query.q?.trim()) {
    where.name = { contains: query.q.trim(), mode: "insensitive" };
  }
  if (query.projectId === "null") {
    where.projectId = null;
  } else if (query.projectId && query.projectId !== "all" && !isNaN(Number(query.projectId))) {
    where.projectId = Number(query.projectId);
  }
  return where;
}

async function excludeDeletedProjectIds(): Promise<number[]> {
  const deleted = await prisma?.project.findMany({
    where: { isDeleted: true },
    select: { id: true },
  });
  return deleted?.map(p => Number(p.id)) || [];
}

async function addDeletedProjectFilter(where: any, _userId: string) {
  const deletedIds = await excludeDeletedProjectIds();
  if (deletedIds.length > 0) {
    where.OR = [
      { projectId: null },
      { projectId: { notIn: deletedIds } },
    ];
  }
}

// Exported for use by save-service
export function uidWhereClause(uid: string, userId: string) {
  return uidWhere(uid, userId);
}

const LIST_SELECT = {
  id: true, uid: true, name: true, projectId: true,
  isPublic: true, shareToken: true, expiryDate: true,
  createdAt: true, updatedAt: true, isDeleted: true, userId: true,
  sourceType: true, sourceConnectionId: true, dbmlSource: true,
  project: { select: { name: true, uid: true, id: true } },
} as const;

function dedupe<T extends { id: any }>(arr: T[], label: string): T[] {
  const seen = new Set();
  const result: T[] = [];
  for (const item of arr) {
    if (seen.has(item.id)) {
      console.warn(`[Save Warning] Duplicate ${label} id=${item.id} removed`);
      continue;
    }
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

export { dedupe };

async function upsertEntities(rows: any[], diagramId: number) {
  if (rows.length === 0 || !prisma) return;
  await prisma.$transaction(
    rows.map(e =>
      prisma!.entity.upsert({
        where: { id: e.id },
        create: {
          id: e.id, diagramId,
          name: e.name, x: e.x, y: e.y,
          color: e.color || "#6366f1",
        },
        update: {
          name: e.name, x: e.x, y: e.y,
          color: e.color || "#6366f1",
        },
      })
    ),
    { timeout: 30000 }
  );
}

export { upsertEntities };

async function upsertColumns(rows: any[]) {
  if (rows.length === 0 || !prisma) return;
  await prisma.$transaction(
    rows.map(col =>
      prisma!.column.upsert({
        where: { id: col.id },
        create: {
          id: col.id, entityId: col._entity_id,
          name: col.name, type: col.type,
          isPk: col.is_pk || false,
          isNullable: col.is_nullable !== undefined ? col.is_nullable : true,
          enumValues: col.enum_values || null,
          comment: col.comment || null,
          maxLength: col.max_length ?? null,
          numericPrecision: col.numeric_precision ?? null,
          numericScale: col.numeric_scale ?? null,
          sortOrder: col.sort_order || 0,
        },
        update: {
          entityId: col._entity_id, name: col.name, type: col.type,
          isPk: col.is_pk || false,
          isNullable: col.is_nullable !== undefined ? col.is_nullable : true,
          enumValues: col.enum_values || null,
          comment: col.comment || null,
          maxLength: col.max_length ?? null,
          numericPrecision: col.numeric_precision ?? null,
          numericScale: col.numeric_scale ?? null,
          sortOrder: col.sort_order || 0,
        },
      })
    ),
    { timeout: 30000 }
  );
}

export { upsertColumns };

async function upsertRelationships(rows: any[], diagramId: number) {
  if (rows.length === 0 || !prisma) return;
  await prisma.$transaction(
    rows.map(r =>
      prisma!.relationship.upsert({
        where: { id: r.id },
        create: {
          id: r.id, diagramId,
          sourceEntityId: r.source_entity_id,
          targetEntityId: r.target_entity_id,
          sourceColumnId: r.source_column_id || null,
          targetColumnId: r.target_column_id || null,
          sourceHandle: r.source_handle || null,
          targetHandle: r.target_handle || null,
          type: r.type || "one-to-many",
          label: r.label || null,
        },
        update: {
          diagramId,
          sourceEntityId: r.source_entity_id,
          targetEntityId: r.target_entity_id,
          sourceColumnId: r.source_column_id || null,
          targetColumnId: r.target_column_id || null,
          sourceHandle: r.source_handle || null,
          targetHandle: r.target_handle || null,
          type: r.type || "one-to-many",
          label: r.label || null,
        },
      })
    ),
    { timeout: 30000 }
  );
}

export { upsertRelationships };

// ── CRUD ──

export async function listDiagrams(
  userId: string,
  params: { limit: number; offset: number; projectId?: string; q?: string; isPublic?: boolean | null; sourceType?: string }
) {
  const where = whereClause(userId, params);
  await addDeletedProjectFilter(where, userId);

  const [data, total] = await Promise.all([
    prisma?.diagram.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: params.offset,
      take: params.limit,
      select: LIST_SELECT,
    }) || Promise.resolve([]),
    prisma?.diagram.count({ where }) || Promise.resolve(0),
  ]);
  return { data: data || [], total: total || 0 };
}

export async function createDiagram(data: {
  name: string; projectId?: number | null; userId: string; uid?: string;
}) {
  if (!prisma) throw new Error("Database connection not available");
  return prisma.diagram.create({
    data: {
      name: data.name,
      projectId: data.projectId ?? null,
      uid: data.uid || undefined,
      userId: data.userId,
    },
  });
}

export async function getDiagram(uid: string, userId: string) {
  const diagram = await prisma?.diagram.findFirst({
    where: uidWhere(uid, userId),
  });
  return diagram || null;
}

export async function updateDiagram(
  uid: string, userId: string,
  data: { name?: string; projectId?: number | null }
) {
  if (!prisma) throw new Error("Database connection not available");
  const existing = await prisma.diagram.findFirst({
    where: uidWhere(uid, userId),
  });
  if (!existing) return null;

  const updatePayload: any = {};
  if (data.name !== undefined) updatePayload.name = data.name;
  if (data.projectId !== undefined) updatePayload.projectId = data.projectId;

  await prisma.diagram.update({ where: { id: Number(existing.id) }, data: updatePayload });
  return { success: true };
}

export async function softDeleteDiagram(uid: string, userId: string) {
  const existing = await prisma?.diagram.findFirst({
    where: uidWhere(uid, userId),
  });
  if (!existing) return null;

  await prisma?.diagram.update({
    where: { id: Number(existing.id) },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  return { success: true };
}

export async function restoreDiagram(uid: string, userId: string) {
  const existing = await prisma?.diagram.findFirst({
    where: uidWhere(uid, userId),
  });
  if (!existing) return null;

  await prisma?.diagram.update({
    where: { id: Number(existing.id) },
    data: { isDeleted: false, deletedAt: null },
  });
  return { success: true };
}

export async function permanentDeleteDiagram(diagramId: number) {
  if (!prisma) return;
  await prisma.$transaction(async (tx) => {
    await tx.relationship.deleteMany({ where: { diagramId } });
    const entities = await tx.entity.findMany({
      where: { diagramId },
      select: { id: true },
    });
    const entityIds = entities.map(e => e.id);
    if (entityIds.length > 0) {
      await tx.column.deleteMany({ where: { entityId: { in: entityIds } } });
    }
    await tx.entity.deleteMany({ where: { diagramId } });
    await tx.diagram.deleteMany({ where: { id: diagramId } });
  });
}

// ── Public / Share ──

export async function getPublicDiagram(uid: string) {
  return prisma?.diagram.findUnique({
    where: { uid },
    include: { project: { select: { name: true, isDeleted: true } } },
  });
}

export async function updateDiagramShare(
  uid: string, userId: string,
  data: { isPublic: boolean; shareToken?: string | null; expiryDate?: Date | null }
) {
  const current = await prisma?.diagram.findFirst({
    where: uidWhere(uid, userId),
  });
  if (!current) return null;

  const updateData: any = {
    isPublic: data.isPublic,
    shareToken: data.isPublic ? data.shareToken ?? null : null,
    expiryDate: data.isPublic ? data.expiryDate ?? null : null,
  };

  if (data.isPublic) {
    if (!current.publishedAt) updateData.publishedAt = new Date();
  } else {
    updateData.publishedAt = null;
  }

  return prisma?.diagram.update({ where: { id: Number(current.id) }, data: updateData });
}
