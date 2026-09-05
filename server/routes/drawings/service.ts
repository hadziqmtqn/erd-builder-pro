import { prisma } from "../../lib/prisma.js";
import { captureEntityRevisionSafely } from "../../lib/entity-history.js";
import { isDesktopMode, isLocalPostgres } from "../../lib/config.js";
import { fileIdentifierWhere, fileScopeWhere, projectScopeWhere } from "../../lib/team-scope.js";

// Helper: build uid-or-id where clause that works with both UUIDs and numeric IDs
// Prisma's @prisma/adapter-pg throws "Argument id is missing" when id is NaN
function uidWhere(uid: string, userId: string) {
  return fileIdentifierWhere(uid, userId);
}

// Shared helpers (same pattern as notes)
function whereClause(userId: string, query: {
  projectId?: string | null;
  q?: string;
  isPublic?: boolean | null;
}) {
  const where: any = { isDeleted: false, AND: [fileScopeWhere(userId)] };

  if (query.isPublic !== null && query.isPublic !== undefined) {
    where.isPublic = query.isPublic;
  }
  if (query.q?.trim()) {
    where.title = { contains: query.q.trim(), mode: "insensitive" };
  }
  if (query.projectId === "null") {
    where.projectId = null;
  } else if (query.projectId && query.projectId !== "all" && !isNaN(Number(query.projectId))) {
    where.projectId = Number(query.projectId);
  }
  return where;
}

async function excludeDeletedProjects(userId: string): Promise<any[]> {
  const deleted = await prisma?.project.findMany({
    where: { ...projectScopeWhere(userId), isDeleted: true },
    select: { id: true },
  });
  return deleted?.map(p => p.id) || [];
}

async function addDeletedProjectFilter(where: any, userId: string) {
  const deletedIds = await excludeDeletedProjects(userId);
  if (deletedIds.length > 0) {
    where.AND.push({ OR: [
      { projectId: null },
      { projectId: { notIn: deletedIds } },
    ] });
  }
}

const LIST_SELECT = {
  id: true, uid: true, title: true, projectId: true,
  isPublic: true, shareToken: true, expiryDate: true,
  createdAt: true, updatedAt: true, isDeleted: true, userId: true,
  project: { select: { name: true, uid: true, id: true } },
} as const;

// ── Drawings ──

export async function listDrawings(
  userId: string,
  params: { limit: number; offset: number; projectId?: string; q?: string; isPublic?: boolean | null }
) {
  const where = whereClause(userId, params);
  await addDeletedProjectFilter(where, userId);

  const [data, total] = await Promise.all([
    prisma?.drawing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: params.offset,
      take: params.limit,
      select: LIST_SELECT,
    }) || Promise.resolve([]),
    prisma?.drawing.count({ where }) || Promise.resolve(0),
  ]);
  return { data, total };
}

export async function createDrawing(data: {
  title: string; drawingData?: string; projectId?: number | null; userId: string; uid?: string;
}) {
  if (!prisma) throw new Error("Database connection not available");
  return prisma.drawing.create({
    data: {
      title: data.title,
      data: data.drawingData || "[]",
      projectId: data.projectId ?? null,
      userId: data.userId,
      ...(data.uid ? { uid: data.uid } : {}),
    },
  });
}

export async function getDrawing(uid: string, userId: string) {
  const drawing = await prisma?.drawing.findFirst({
    where: uidWhere(uid, userId),
  });
  return drawing || null;
}

export async function updateDrawing(
  uid: string, userId: string,
  data: { title?: string; drawingData?: string; projectId?: number | null }
) {
  if (!prisma) throw new Error("Database connection not available");
  const existing = await prisma.drawing.findFirst({
    where: uidWhere(uid, userId),
  });
  if (!existing) return null;

  await captureEntityRevisionSafely({
    entityType: "drawings",
    entityId: existing.id,
    userId,
    snapshot: { title: existing.title, data: existing.data ?? "", project_id: existing.projectId ?? null },
  });

  const updatePayload: any = { updatedAt: new Date() };
  if (isDesktopMode() || isLocalPostgres()) updatePayload.version = (existing.version ?? 0) + 1;
  if (data.title !== undefined) updatePayload.title = data.title;
  if (data.drawingData !== undefined) updatePayload.data = data.drawingData;
  if (data.projectId !== undefined) updatePayload.projectId = data.projectId;

  const updated = await prisma.drawing.update({ where: { id: existing.id }, data: updatePayload, select: { version: true, updatedAt: true } });
  return { success: true, version: updated.version, updatedAt: updated.updatedAt };
}

export async function softDeleteDrawing(uid: string, userId: string) {
  const existing = await prisma?.drawing.findFirst({
    where: uidWhere(uid, userId),
  });
  if (!existing) return null;

  await prisma?.drawing.update({
    where: { id: existing.id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  return { success: true };
}

export async function restoreDrawing(uid: string, userId: string) {
  const existing = await prisma?.drawing.findFirst({
    where: uidWhere(uid, userId),
  });
  if (!existing) return null;

  await prisma?.drawing.update({
    where: { id: existing.id },
    data: { isDeleted: false, deletedAt: null },
  });
  return { success: true };
}

/** Returns drawing id + parsed data for R2 cleanup */
export async function getDrawingForPermanentDelete(uid: string, userId: string) {
  const drawing = await prisma?.drawing.findFirst({
    where: uidWhere(uid, userId),
    select: { data: true, id: true },
  });
  return drawing || null;
}

/** Extract R2 keys from Excalidraw drawing data (files[].dataURL) */
export function extractR2KeysFromDrawingData(rawData: string): string[] {
  try {
    const parsed = JSON.parse(rawData);
    const files = parsed.files || {};
    const keys: string[] = [];
    for (const fileId in files) {
      const dataURL = files[fileId].dataURL;
      if (typeof dataURL === "string" && dataURL.includes("erd-builder-pro/")) {
        keys.push(dataURL.substring(dataURL.indexOf("erd-builder-pro/")));
      }
    }
    return keys;
  } catch {
    return [];
  }
}

export async function permanentDeleteDrawing(drawingId: number) {
  // Use deleteMany to avoid Prisma "record not found" error when id is numeric but uid sent
  await prisma?.drawing.deleteMany({
    where: { id: drawingId },
  });
}

// ── Public / Share ──

export async function getPublicDrawing(uid: string) {
  return prisma?.drawing.findUnique({
    where: { uid },
    include: { project: { select: { name: true, isDeleted: true } } },
  });
}

export async function updateDrawingShare(
  uid: string, userId: string,
  data: { isPublic: boolean; shareToken?: string | null; expiryDate?: Date | null }
) {
  const current = await prisma?.drawing.findFirst({
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

  return prisma?.drawing.update({ where: { id: current.id }, data: updateData });
}
