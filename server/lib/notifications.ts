import { prisma } from "./prisma.js";

/**
 * NOT-001 notification rows: one per recipient, created after the main mutation commits. Producers pass only metadata
 * that is safe to show (no message or document content); the API in routes/notifications re-checks Team access.
 */

export const NOTIFICATION_TYPES = [
  "discussion.reply",
  "comment.created",
  "file.deleted",
  "file.restored",
  "file.moved",
  "project.role_changed",
  "project.access_granted",
  "project.access_revoked",
  "team.member_added",
  "team.member_removed",
  "sync.conflict",
] as const;
const SCOPE_TYPES = ["account", "team", "project", "file"] as const;
const FEATURE_TYPES = ["diagram", "note", "flowchart", "drawing"] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationInput = {
  recipientUserId: string;
  actorUserId?: string | null;
  scopeType: (typeof SCOPE_TYPES)[number];
  /** A Team id, or null for the Personal Workspace: canAccessTeam never accepts a personal Team row. */
  teamId?: string | null;
  projectId?: number | null;
  featureType?: (typeof FEATURE_TYPES)[number] | null;
  fileId?: string | null;
  type: NotificationType;
  entityType: string;
  entityId: string;
  groupKey?: string | null;
  link?: string | null;
  sourceEventId?: string | null;
  payload?: Record<string, unknown>;
};

/** The legacy Supabase client has no notifications table, so callers get null there instead of a crash. */
export function notificationStore(): NonNullable<typeof prisma>["notification"] | null {
  return (prisma as any)?.notification ?? null;
}

/** Keeps an app-relative path with an optional query; an absolute or protocol-relative URL could leave the app. */
export function safeNotificationLink(link: string | null | undefined): string | null {
  if (!link || link.length > 512 || !link.startsWith("/") || link.startsWith("//") || /[\\\s]/.test(link)) return null;
  return link;
}

/**
 * Stores notifications and returns how many rows were new. A repeated source_event_id for the same recipient is
 * skipped by the unique index, and an actor never notifies themselves.
 */
export async function createNotifications(inputs: NotificationInput[]): Promise<number> {
  const store = notificationStore();
  if (!store) return 0;
  let created = 0;
  for (const input of inputs) {
    if (!NOTIFICATION_TYPES.includes(input.type) || !SCOPE_TYPES.includes(input.scopeType)
      || (input.featureType != null && !FEATURE_TYPES.includes(input.featureType))) {
      throw new Error(`Unsupported notification ${input.type} (${input.scopeType})`);
    }
    if (input.actorUserId && input.actorUserId === input.recipientUserId) continue;
    try {
      await store.create({
        data: {
          recipientUserId: input.recipientUserId,
          actorUserId: input.actorUserId ?? null,
          scopeType: input.scopeType,
          teamId: input.teamId ?? null,
          projectId: input.projectId ?? null,
          featureType: input.featureType ?? null,
          fileId: input.fileId ?? null,
          type: input.type,
          entityType: input.entityType,
          entityId: input.entityId,
          groupKey: input.groupKey ?? null,
          link: safeNotificationLink(input.link),
          sourceEventId: input.sourceEventId ?? null,
          payload: JSON.stringify(input.payload ?? {}),
        },
      });
      created++;
    } catch (error) {
      if ((error as { code?: string } | null)?.code !== "P2002") throw error;
    }
  }
  return created;
}

/** BUG-081: marks a recipient's unread notifications of one group, such as every reply in a thread, as read. */
export async function readNotificationGroup(recipientUserId: string, groupKey: string): Promise<number> {
  const store = notificationStore();
  if (!store) return 0;
  const updated = await store.updateMany({ where: { recipientUserId, groupKey, readAt: null }, data: { readAt: new Date() } });
  return updated.count;
}

const DAY_MS = 86_400_000;
function retentionDays(variable: string, fallback: number): number {
  const days = Number(process.env[variable]);
  return Number.isFinite(days) && days > 0 ? Math.floor(days) : fallback;
}

/** Same defaults in Cloud and Self-host; an operator can change them through the environment. */
export const notificationRetention = () => ({
  readDays: retentionDays("NOTIFICATION_READ_RETENTION_DAYS", 90),
  allDays: retentionDays("NOTIFICATION_RETENTION_DAYS", 180),
});

/** Deletes read notifications older than readDays and every notification older than allDays, by creation time. */
export async function purgeExpiredNotifications(now = new Date()): Promise<number> {
  const store = notificationStore();
  if (!store) return 0;
  const { readDays, allDays } = notificationRetention();
  const removed = await store.deleteMany({
    where: {
      OR: [
        { readAt: { not: null }, createdAt: { lt: new Date(now.getTime() - readDays * DAY_MS) } },
        { createdAt: { lt: new Date(now.getTime() - allDays * DAY_MS) } },
      ],
    },
  });
  return removed.count;
}
