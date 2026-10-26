import { createHash, randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { captureEntityRevisionSafely, deleteEntityRevisions } from "../../lib/entity-history.js";
import { isDesktopMode, isLocalPostgres } from "../../lib/config.js";
import { createPersonalFile } from "../../lib/personal-file-quota.js";
import { commentableFileIdentifierWhere, creatorFileIdentifierWhere, editableFileIdentifierWhere, fileIdentifierWhere, fileScopeWhere, projectScopeWhere } from "../../lib/team-scope.js";
import { isForeignProjectMove } from "../../lib/project-access.js";
import { replacePrivateStorageUrls } from "../../lib/storage-access.js";
import { versionedWhere } from "../../lib/versioned-write.js";

// Helper: build uid-or-id where clause that works with both UUIDs and numeric IDs
// Prisma's @prisma/adapter-pg throws "Argument id is missing" when id is NaN
function uidWhere(uid: string, userId: string) {
  return fileIdentifierWhere(uid, userId);
}

function creatorUidWhere(uid: string, userId: string) {
  return creatorFileIdentifierWhere(uid, userId);
}

// ── Shared helpers ──

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
  user: { select: { name: true, email: true } },
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
  return createPersonalFile("notes", data.userId, (db) => db.note.create({
    data: {
      title: data.title,
      content: replacePrivateStorageUrls(data.content || "", {}),
      projectId: data.projectId ?? null,
      userId: data.userId,
      uid: data.uid ?? randomUUID(),
    },
  }));
}

export async function getNote(uid: string, userId: string) {
  const note = await prisma?.note.findFirst({
    where: uidWhere(uid, userId),
    include: { user: { select: { name: true, email: true } } },
  });
  return note || null;
}

export async function updateNote(
  uid: string, userId: string,
  data: { title?: string; content?: string; projectId?: number | null; historySource?: "autosave" | "manual" | "mcp"; expectedContentHash?: string; expectedContent?: string; expectedVersion?: number }
) {
  if (!prisma) throw new Error("Database connection not available");
  const existing = await prisma.note.findFirst({
    where: uidWhere(uid, userId),
  });
  if (!existing) return null;

  const existingContent = replacePrivateStorageUrls(existing.content ?? "", {});
  const content = data.content === undefined ? undefined : replacePrivateStorageUrls(data.content, {});
  if (existing.userId !== userId) {
    // Full access or an Editor grant writes the Note (COL-004). Everyone else except a Viewer may only add a comment anchor (DATA-004).
    const editable = await prisma.note.count({ where: editableFileIdentifierWhere(uid, userId) }) > 0;
    if (!editable) {
      if (!isCommentAnchorOnlyChange(existingContent, content, data)) return null;
      if (await prisma.note.count({ where: commentableFileIdentifierWhere(uid, userId) }) === 0) return null;
    }
  }
  if (isForeignProjectMove(existing, userId, data.projectId)) return null;

  const updatePayload: any = { updatedAt: new Date() };
  if (isDesktopMode() || isLocalPostgres()) updatePayload.version = (data.expectedVersion ?? existing.version ?? 0) + 1;
  if (data.title !== undefined) updatePayload.title = data.title;
  if (content !== undefined) updatePayload.content = content;
  if (data.projectId !== undefined) updatePayload.projectId = data.projectId;

  const revision = () => captureEntityRevisionSafely({
    entityType: "notes",
    entityId: existing.id,
    userId,
    snapshot: { title: existing.title, content: existing.content ?? "", project_id: existing.projectId ?? null },
    source: data.historySource,
    force: data.historySource === "mcp",
  });

  if (data.expectedContentHash !== undefined || data.expectedContent !== undefined) {
    const matchesExpectedContent = data.expectedContentHash !== undefined
      ? createHash("sha256").update(existingContent).digest("hex") === data.expectedContentHash
      : existingContent === replacePrivateStorageUrls(data.expectedContent ?? "", {});
    if (!matchesExpectedContent) return { success: false, conflict: true };
    if (existingContent === content) {
      return { success: true, version: existing.version, updatedAt: existing.updatedAt };
    }
    // A comment anchor is not an edit: bumping the version would refuse the creator's next autosave (BUG-020).
    if (isCommentAnchorOnlyChange(existingContent, content, data)) delete updatePayload.version;

    const result = await prisma.note.updateMany({
      where: {
        id: existing.id,
        content: existing.content,
        projectId: existing.projectId,
        userId: existing.userId,
        isDeleted: existing.isDeleted,
      },
      data: updatePayload,
    });
    if (result.count !== 1) return { success: false, conflict: true };
    await revision();

    const updated = await prisma.note.findUnique({ where: { id: existing.id }, select: { version: true, updatedAt: true } });
    return { success: true, version: updated?.version, updatedAt: updated?.updatedAt };
  }

  // Anchors other members added are missing from this writer's copy; keep them on blocks that still match (BUG-020).
  // The content guard catches an anchor saved after the read (it does not bump the version); one retry re-applies it.
  let storedContent = existing.content;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (content !== undefined) updatePayload.content = restoreCommentAnchors(replacePrivateStorageUrls(storedContent ?? "", {}), content);
    const result = await prisma.note.updateMany({
      where: { ...versionedWhere(existing.id, data.expectedVersion), content: storedContent },
      data: updatePayload,
    });
    if (result.count === 1) {
      await revision();
      const updated = await prisma.note.findUnique({ where: { id: existing.id }, select: { version: true, updatedAt: true } });
      return { success: true, version: updated?.version, updatedAt: updated?.updatedAt };
    }
    const latest = await prisma.note.findUnique({ where: { id: existing.id }, select: { version: true, content: true } });
    if (attempt === 1 || !latest || latest.content === storedContent) {
      return { success: false, conflict: true, currentVersion: latest?.version ?? null };
    }
    storedContent = latest.content;
  }
  return { success: false, conflict: true, currentVersion: null };
}

const COMMENT_ANCHOR_ATTRIBUTE = /\sdata-comment-anchor-id="([^"]*)"/g;

// Same normalization as normalizeNoteHtml in useNoteCommentPersistence: the editor drops whitespace at block edges on load (BUG-019).
function withoutCommentAnchors(html: string) {
  return html.replace(COMMENT_ANCHOR_ATTRIBUTE, "").replace(/\s*class=""\s*/g, "").replace(/<p><\/p>/g, "").replace(/\s+/g, " ").replace(/>\s+/g, ">").replace(/\s+</g, "<").trim();
}

const TEXT_BLOCK = /<(p|h[1-6])\b([^>]*)>([\s\S]*?)<\/\1>/gi;
const ANCHOR_ID = /\sdata-comment-anchor-id="([^"]*)"/;

/**
 * Puts stored comment anchors that the incoming HTML lacks back on the block with the same text, matched by the
 * occurrence of that text. An anchor whose block was edited or removed is dropped and its thread becomes orphaned.
 */
export function restoreCommentAnchors(storedHtml: string, incomingHtml: string) {
  const present = new Set(Array.from(incomingHtml.matchAll(COMMENT_ANCHOR_ATTRIBUTE), match => match[1]));
  const missing = new Map<string, string[]>();
  const storedSeen = new Map<string, number>();
  for (const [, , attrs, inner] of storedHtml.matchAll(TEXT_BLOCK)) {
    const text = withoutCommentAnchors(inner);
    const occurrence = storedSeen.get(text) ?? 0;
    storedSeen.set(text, occurrence + 1);
    const id = attrs.match(ANCHOR_ID)?.[1];
    if (!id || present.has(id)) continue;
    const ids = missing.get(text) ?? [];
    ids[occurrence] = id;
    missing.set(text, ids);
  }
  if (missing.size === 0) return incomingHtml;

  const incomingSeen = new Map<string, number>();
  return incomingHtml.replace(TEXT_BLOCK, (whole, tag: string, attrs: string, inner: string) => {
    const text = withoutCommentAnchors(inner);
    const occurrence = incomingSeen.get(text) ?? 0;
    incomingSeen.set(text, occurrence + 1);
    const id = missing.get(text)?.[occurrence];
    if (!id || ANCHOR_ID.test(attrs)) return whole;
    return `<${tag}${attrs} data-comment-anchor-id="${id}">${inner}</${tag}>`;
  });
}

/** True when the request only adds comment anchors to an unchanged Note, guarded by the comment path's content check. */
export function isCommentAnchorOnlyChange(
  existingContent: string,
  content: string | undefined,
  data: { title?: string; projectId?: number | null; expectedContentHash?: string; expectedContent?: string },
) {
  if (content === undefined || data.title !== undefined || data.projectId !== undefined) return false;
  if (data.expectedContentHash === undefined && data.expectedContent === undefined) return false;
  if (withoutCommentAnchors(existingContent) !== withoutCommentAnchors(content)) return false;
  const kept = new Set(Array.from(content.matchAll(COMMENT_ANCHOR_ATTRIBUTE), match => match[1]));
  return Array.from(existingContent.matchAll(COMMENT_ANCHOR_ATTRIBUTE)).every(match => kept.has(match[1]));
}

export async function softDeleteNote(uid: string, userId: string) {
  const existing = await prisma?.note.findFirst({
    where: creatorUidWhere(uid, userId),
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
    where: creatorUidWhere(uid, userId),
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
    where: creatorUidWhere(uid, userId),
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
  await deleteEntityRevisions("notes", [id]);
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
    where: creatorUidWhere(uid, userId),
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
