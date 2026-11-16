import { publishUserNotification } from "./cloud-live-sync.js";
import { logger } from "./logger.js";
import { createNotifications, type NotificationInput } from "./notifications.js";
import { prisma } from "./prisma.js";

/**
 * NOT-001.9: Self-host Team membership changes. The member hears about it, and so do the Team's other active Managers.
 * Cloud members come from SaaS (NOT-002) and Cloud refuses these mutations, so Cloud never gets these rows from the
 * runtime. Each change happens once (only a non-active membership is activated, only an active one removed), so no
 * source event id is needed.
 */
export type MemberChange = { type: "team.member_added" | "team.member_removed"; teamId: string; userId: string; actorId: string };

/** Only the member's name goes into the payload. A failure is logged and never fails the Team change; returns the users notified. */
export async function notifyTeamMember(change: MemberChange): Promise<string[]> {
  if (!prisma) return [];
  try {
    const db = prisma as any;
    const [managers, member] = await Promise.all([
      db.teamMember.findMany({ where: { teamId: change.teamId, role: "manager", status: "active" }, select: { userId: true } }),
      db.user.findUnique({ where: { id: change.userId }, select: { name: true, email: true } }),
    ]);
    const recipients = [...new Set([change.userId, ...(managers as Array<{ userId: string }>).map((row) => row.userId)])]
      .filter((id) => id !== change.actorId);
    if (!recipients.length) return [];
    const memberName = member?.name?.trim() || member?.email || null;
    const inputs: NotificationInput[] = recipients.map((recipientUserId) => {
      const isMember = recipientUserId === change.userId;
      return {
        recipientUserId,
        actorUserId: change.actorId,
        scopeType: "team",
        teamId: change.teamId,
        type: change.type,
        entityType: "team_member",
        entityId: change.userId,
        groupKey: `team:${change.teamId}:members`,
        // A removed member can no longer open the Team; an added one lands on its dashboard, Managers on its member list.
        link: isMember ? (change.type === "team.member_added" ? "/" : null) : `/teams/${change.teamId}`,
        payload: isMember ? {} : { memberName },
      };
    });
    await createNotifications(inputs);
    await publishUserNotification(recipients);
    return recipients;
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : error, type: change.type }, "[Notifications] Team member notice failed");
    return [];
  }
}
