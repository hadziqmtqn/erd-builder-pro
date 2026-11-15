import { publishCloudUserNotification } from "../../lib/cloud-live-sync.js";
import { logger } from "../../lib/logger.js";
import { createNotifications, type NotificationInput } from "../../lib/notifications.js";
import { prisma } from "../../lib/prisma.js";

/**
 * Notifications for a committed collaboration message: `discussion.reply` (NOT-001.3) for a discussion reply and
 * `comment.created` (NOT-001.4) for a new comment or a comment reply.
 */

type Feature = "diagram" | "note" | "drawing" | "flowchart";
export type ThreadKind = "discussion" | "comment";
// The file routes and the file tables share these names.
const FEATURE_PATHS: Record<Feature, string> = { diagram: "diagrams", note: "notes", drawing: "drawings", flowchart: "flowcharts" };
const KINDS = {
  discussion: { type: "discussion.reply", threads: "discussion_threads", messages: "discussion_messages", linkParam: "thread" },
  comment: { type: "comment.created", threads: "comment_threads", messages: "comment_messages", linkParam: "comment" },
} as const;

export type ThreadNotice = {
  kind: ThreadKind;
  threadId: string;
  messageId: string;
  actorId: string;
  teamId: string;
  projectId: number;
  projectName: string;
  /** The file the thread belongs to, already checked against the Project and Team; null for a Project-only discussion. */
  file: { featureType: Feature; id: number; uid: string | null; label: string } | null;
};

/** The thread creator, earlier authors and, for a comment, the file's creator, who are still active Team members, without the actor. */
export async function threadRecipients(notice: Pick<ThreadNotice, "kind" | "threadId" | "teamId" | "actorId" | "file">): Promise<string[]> {
  if (!prisma) return [];
  const { threads, messages } = KINDS[notice.kind];
  const values: unknown[] = [notice.threadId, notice.teamId, notice.actorId];
  let fileOwner = "";
  if (notice.kind === "comment" && notice.file) {
    fileOwner = `UNION SELECT fo."user_id" AS "user_id" FROM "${FEATURE_PATHS[notice.file.featureType]}" fo WHERE fo."id" = $4`;
    values.push(notice.file.id);
  }
  const rows = await prisma.$queryRawUnsafe<Array<{ userId: string }>>(`
    SELECT DISTINCT p."user_id" AS "userId"
    FROM (
      SELECT t."created_by" AS "user_id" FROM "${threads}" t WHERE t."id" = $1
      UNION
      SELECT m."author_id" AS "user_id" FROM "${messages}" m WHERE m."thread_id" = $1
      ${fileOwner}
    ) p
    JOIN "team_members" tm ON tm."user_id" = p."user_id" AND tm."team_id" = $2 AND tm."status" = 'active'
    WHERE p."user_id" <> $3
  `, ...values);
  return rows.map((row) => row.userId);
}

/** The thread's file with `?thread=` or `?comment=`, which DiscussionsPanel opens; a Project-only discussion opens the Project page. */
export function threadLink(notice: Pick<ThreadNotice, "kind" | "threadId" | "projectId" | "file">): string {
  if (!notice.file) return `/projects/${notice.projectId}`;
  const fileKey = notice.file.uid ?? String(notice.file.id);
  return `/${FEATURE_PATHS[notice.file.featureType]}/${encodeURIComponent(fileKey)}?${KINDS[notice.kind].linkParam}=${encodeURIComponent(notice.threadId)}`;
}

async function commentAnchorLabel(threadId: string): Promise<string | null> {
  const rows = await prisma!.$queryRawUnsafe<Array<{ anchorLabel: string | null }>>(
    'SELECT "anchor_label" AS "anchorLabel" FROM "comment_threads" WHERE "id" = $1 LIMIT 1', threadId,
  );
  return rows[0]?.anchorLabel ?? null;
}

/**
 * Stores one row per recipient (the message id makes a retry idempotent) and wakes their sockets that are open for
 * another Team. Only names go into the payload, never the message. A failure is logged and never fails the write.
 * Returns the recipients so the caller can tell which users were notified.
 */
export async function notifyThreadMessage(notice: ThreadNotice): Promise<string[]> {
  try {
    const recipients = await threadRecipients(notice);
    if (!recipients.length) return [];
    const { type } = KINDS[notice.kind];
    const link = threadLink(notice);
    const fileId = notice.file ? notice.file.uid ?? String(notice.file.id) : null;
    const payload: Record<string, unknown> = { fileName: notice.file?.label ?? null, projectName: notice.projectName };
    if (notice.kind === "comment") payload.anchorLabel = await commentAnchorLabel(notice.threadId);
    const inputs: NotificationInput[] = recipients.map((recipientUserId) => ({
      recipientUserId,
      actorUserId: notice.actorId,
      scopeType: notice.file ? "file" : "project",
      teamId: notice.teamId,
      projectId: notice.projectId,
      featureType: notice.file?.featureType ?? null,
      fileId,
      type,
      entityType: notice.kind,
      entityId: notice.threadId,
      groupKey: `${notice.kind}:${notice.threadId}`,
      link,
      sourceEventId: `${type}:${notice.messageId}`,
      payload,
    }));
    await createNotifications(inputs);
    await publishCloudUserNotification(recipients, notice.teamId);
    return recipients;
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : error, kind: notice.kind, threadId: notice.threadId }, "[Notifications] thread notice failed");
    return [];
  }
}
