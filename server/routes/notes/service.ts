import { prisma } from "../../lib/prisma.js";
import { captureEntityRevisionSafely } from "../../lib/entity-history.js";
import { isDesktopMode, isLocalPostgres } from "../../lib/config.js";

// Helper: build uid-or-id where clause that works with both UUIDs and numeric IDs
// Prisma's @prisma/adapter-pg throws "Argument id is missing" when id is NaN
function uidWhere(uid: string, userId: string) {
  const id = Number(uid);
  return Number.isFinite(id)
    ? { OR: [{ uid }, { id }], userId }
    : { uid, userId };
}

// ── Shared helpers ──

function whereClause(userId: string, query: {
  projectId?: string | null;
  q?: string;
  isPublic?: boolean | null;
}) {
  const where: any = { isDeleted: false, userId };

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
    where: { userId, isDeleted: true },
    select: { id: true },
  });
  return deleted?.map(p => p.id) || [];
}

async function addDeletedProjectFilter(where: any, userId: string) {
  const deletedIds = await excludeDeletedProjects(userId);
  if (deletedIds.length > 0) {
    where.OR = [
      { projectId: null },
      { projectId: { notIn: deletedIds } },
    ];
  }
}

const LIST_SELECT = {
  id: true, uid: true, title: true, projectId: true,
  isPublic: true, shareToken: true, expiryDate: true,
  createdAt: true, updatedAt: true, isDeleted: true, userId: true,
  project: { select: { name: true, uid: true, id: true } },
} as const;

// ── Notes ──

export async function listNotes(
  userId: string,
  params: { limit: number; offset: number; projectId?: string; q?: string; isPublic?: boolean | null }
) {
  const where = whereClause(userId, params);
  await addDeletedProjectFilter(where, userId);

  const [data, total] = await Promise.all([
    prisma?.note.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: params.offset,
      take: params.limit,
      select: LIST_SELECT,
    }),
    prisma?.note.count({ where }),
  ]);
  return { data: data || [], total: total || 0 };
}

export async function createNote(data: {
  title: string; content?: string; projectId?: number | null; userId: string; uid?: string;
}) {
  if (!prisma) throw new Error("Database connection not available");
  return prisma.note.create({
    data: {
      title: data.title,
      content: data.content || "",
      projectId: data.projectId ?? null,
      userId: data.userId,
      ...(data.uid ? { uid: data.uid } : {}),
    },
  });
}

export async function getNote(uid: string, userId: string) {
  const note = await prisma?.note.findFirst({
    where: uidWhere(uid, userId),
  });
  return note || null;
}

export async function updateNote(
  uid: string, userId: string,
  data: { title?: string; content?: string; projectId?: number | null; historySource?: "autosave" | "manual" | "mcp" }
) {
  if (!prisma) throw new Error("Database connection not available");
  const existing = await prisma.note.findFirst({
    where: uidWhere(uid, userId),
  });
  if (!existing) return null;

  await captureEntityRevisionSafely({
    entityType: "notes",
    entityId: existing.id,
    userId,
    snapshot: { title: existing.title, content: existing.content ?? "", project_id: existing.projectId ?? null },
    source: data.historySource,
    force: data.historySource === "mcp",
  });

  const updatePayload: any = { updatedAt: new Date() };
  if (isDesktopMode() || isLocalPostgres()) updatePayload.version = (existing.version ?? 0) + 1;
  if (data.title !== undefined) updatePayload.title = data.title;
  if (data.content !== undefined) updatePayload.content = data.content;
  if (data.projectId !== undefined) updatePayload.projectId = data.projectId;

  const updated = await prisma.note.update({ where: { id: existing.id }, data: updatePayload, select: { version: true, updatedAt: true } });
  return { success: true, version: updated.version, updatedAt: updated.updatedAt };
}

export async function softDeleteNote(uid: string, userId: string) {
  const existing = await prisma?.note.findFirst({
    where: uidWhere(uid, userId),
  });
  if (!existing) return null;

  await prisma?.note.update({
    where: { id: existing.id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  return { success: true };
}

export async function restoreNote(uid: string, userId: string) {
  const existing = await prisma?.note.findFirst({
    where: uidWhere(uid, userId),
  });
  if (!existing) return null;

  await prisma?.note.update({
    where: { id: existing.id },
    data: { isDeleted: false, deletedAt: null },
  });
  return { success: true };
}

/**
 * Permanently delete a note and clean up its R2 images.
 * Returns the note id so the caller can proceed with deletion, or null if not found.
 */
export async function getNoteForPermanentDelete(uid: string, userId: string) {
  const note = await prisma?.note.findFirst({
    where: uidWhere(uid, userId),
    select: { content: true, id: true },
  });
  return note || null;
}

export function extractR2KeysFromContent(content: string): string[] {
  const regex = /<img[^>]+src="([^">]+)"/g;
  const keys: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    const url = match[1];
    if (url.includes("erd-builder-pro/")) {
      keys.push(url.substring(url.indexOf("erd-builder-pro/")));
    }
  }
  return keys;
}

export async function permanentDeleteNote(id: number) {
  await prisma?.note.delete({ where: { id } });
}

// ── Public / Share ──

export async function getPublicNote(uid: string) {
  return prisma?.note.findUnique({
    where: { uid },
    include: { project: { select: { name: true, isDeleted: true } } },
  });
}

export async function updateNoteShare(
  uid: string, userId: string,
  data: { isPublic: boolean; shareToken?: string | null; expiryDate?: Date | null }
) {
  const current = await prisma?.note.findFirst({
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

  return prisma?.note.update({ where: { id: current.id }, data: updateData });
}
