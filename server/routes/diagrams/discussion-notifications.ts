import { publishCloudUserNotification } from "../../lib/cloud-live-sync.js";
import { logger } from "../../lib/logger.js";
import { createNotifications, type NotificationInput } from "../../lib/notifications.js";
import { prisma } from "../../lib/prisma.js";

/** NOT-001.3 `discussion.reply`: after a reply is committed, its thread's other participants get a notification. */

type Feature = "diagram" | "note" | "drawing" | "flowchart";
const FEATURE_ROUTES: Record<Feature, string> = { diagram: "diagrams", note: "notes", drawing: "drawings", flowchart: "flowcharts" };

export type ReplyNotice = {
  threadId: string;
  messageId: string;
  actorId: string;
  teamId: string;
  projectId: number;
  projectName: string;
  /** The file the thread belongs to, already checked against the Project and Team; null for a Project-only thread. */
  file: { featureType: Feature; id: number; uid: string | null; label: string } | null;
};

/** The thread creator and earlier authors who are still active members of the Team, without the replier. */
export async function discussionReplyRecipients(threadId: string, teamId: string, actorId: string): Promise<string[]> {
  if (!prisma) return [];
  const rows = await prisma.$queryRawUnsafe<Array<{ userId: string }>>(`
    SELECT DISTINCT p."user_id" AS "userId"
    FROM (
      SELECT t."created_by" AS "user_id" FROM "discussion_threads" t WHERE t."id" = $1
      UNION
      SELECT m."author_id" AS "user_id" FROM "discussion_messages" m WHERE m."thread_id" = $1
    ) p
    JOIN "team_members" tm ON tm."user_id" = p."user_id" AND tm."team_id" = $2 AND tm."status" = 'active'
    WHERE p."user_id" <> $3
  `, threadId, teamId, actorId);
  return rows.map((row) => row.userId);
}

/** The thread's file with `?thread=`, which DiscussionsPanel opens; a Project-only thread opens the Project page. */
export function discussionReplyLink(notice: Pick<ReplyNotice, "threadId" | "projectId" | "file">): string {
  if (!notice.file) return `/projects/${notice.projectId}`;
  const fileKey = notice.file.uid ?? String(notice.file.id);
  return `/${FEATURE_ROUTES[notice.file.featureType]}/${encodeURIComponent(fileKey)}?thread=${encodeURIComponent(notice.threadId)}`;
}

/**
 * Stores one row per recipient (the message id makes a retry idempotent) and wakes their sockets that are open for
 * another Team. Only names go into the payload, never the message. A failure is logged and never fails the reply.
 * Returns the recipients so the caller can tell which users were notified.
 */
export async function notifyDiscussionReply(notice: ReplyNotice): Promise<string[]> {
  try {
    const recipients = await discussionReplyRecipients(notice.threadId, notice.teamId, notice.actorId);
    if (!recipients.length) return [];
    const link = discussionReplyLink(notice);
    const fileId = notice.file ? notice.file.uid ?? String(notice.file.id) : null;
    const inputs: NotificationInput[] = recipients.map((recipientUserId) => ({
      recipientUserId,
      actorUserId: notice.actorId,
      scopeType: notice.file ? "file" : "project",
      teamId: notice.teamId,
      projectId: notice.projectId,
      featureType: notice.file?.featureType ?? null,
      fileId,
      type: "discussion.reply",
      entityType: "discussion",
      entityId: notice.threadId,
      groupKey: `discussion:${notice.threadId}`,
      link,
      sourceEventId: `discussion.reply:${notice.messageId}`,
      payload: { fileName: notice.file?.label ?? null, projectName: notice.projectName },
    }));
    await createNotifications(inputs);
    await publishCloudUserNotification(recipients, notice.teamId);
    return recipients;
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : error, threadId: notice.threadId }, "[Notifications] discussion reply notice failed");
    return [];
  }
}
