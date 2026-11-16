import { publishUserNotification } from "./cloud-live-sync.js";
import { logger } from "./logger.js";
import { createNotifications, type NotificationInput } from "./notifications.js";
import { prisma } from "./prisma.js";

/**
 * NOT-001.8: a member's explicit Project role was set, changed or cleared (COL-004). The member hears about it, and so
 * does the Project creator when someone else made the change. There is no `project.access_revoked`: an active member
 * never drops below the default Commenter, so real loss of access only comes with leaving the Team.
 */
export type AccessChange = {
  projectId: number;
  teamId: string;
  actorId: string;
  targetId: string;
  ownerId: string | null;
  /** The stored role after the change; null when it was cleared back to the default. */
  role: string | null;
  /** The stored role before the change; null when the member had none. */
  previousRole: string | null;
  auditId: string;
};

/** Only names and roles go into the payload. A failure is logged and never fails the access change; returns the users notified. */
export async function notifyProjectAccess(change: AccessChange): Promise<string[]> {
  if (!prisma) return [];
  try {
    const candidates = [...new Set([change.targetId, change.ownerId])].filter((id): id is string => Boolean(id) && id !== change.actorId);
    if (!candidates.length) return [];
    const db = prisma as any;
    const [active, project, member] = await Promise.all([
      db.teamMember.findMany({ where: { teamId: change.teamId, userId: { in: candidates }, status: "active" }, select: { userId: true } }),
      db.project.findUnique({ where: { id: change.projectId }, select: { name: true } }),
      db.user.findUnique({ where: { id: change.targetId }, select: { name: true, email: true } }),
    ]);
    const activeIds = new Set((active as Array<{ userId: string }>).map((row) => row.userId));
    const recipients = candidates.filter((id) => activeIds.has(id));
    if (!recipients.length) return [];
    const type = change.previousRole === null ? "project.access_granted" : "project.role_changed";
    const inputs: NotificationInput[] = recipients.map((recipientUserId) => ({
      recipientUserId,
      actorUserId: change.actorId,
      scopeType: "project",
      teamId: change.teamId,
      projectId: change.projectId,
      type,
      entityType: "project",
      entityId: String(change.projectId),
      groupKey: `project:${change.projectId}:access`,
      link: `/projects/${change.projectId}`,
      sourceEventId: `project_access_changed:${change.auditId}`,
      payload: {
        projectName: project?.name ?? null,
        role: change.role,
        previousRole: change.previousRole,
        // The creator reads about someone else's role; the member reads about their own.
        ...(recipientUserId === change.targetId ? {} : { memberName: member?.name?.trim() || member?.email || null }),
      },
    }));
    await createNotifications(inputs);
    await publishUserNotification(recipients);
    return recipients;
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : error, projectId: change.projectId }, "[Notifications] project access notice failed");
    return [];
  }
}
