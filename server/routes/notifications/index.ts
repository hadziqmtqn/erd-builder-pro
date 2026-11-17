import { createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";
import type { Notification } from "@prisma/client";
import { isLocalPostgres } from "../../lib/config.js";
import { isUuid } from "../../lib/erd-column-id-migration.js";
import { logger } from "../../lib/logger.js";
import { authenticate } from "../../lib/middleware.js";
import { notificationStore } from "../../lib/notifications.js";
import { prisma } from "../../lib/prisma.js";
import { canAccessTeam } from "../teams/service.js";

/**
 * NOT-001.1 notification API. The recipient is always the session user and the list covers every workspace; the
 * browser never supplies a user or Team id. Items from a Team the user can no longer open keep only the Team name and
 * the event type, and a link is never proof of access because every target route re-authorizes.
 */
const router = Router();
const notFound = (res: Response) => res.status(404).json({ error: "Resource not found" });
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

type SessionUser = { id: string; isSuperAdmin?: boolean };
type Lookup = { accessibleTeams: ReadonlySet<string>; teamNames: ReadonlyMap<string, string>; actorNames: ReadonlyMap<string, string | null> };

function parsePayload(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function presentNotification(row: Notification, lookup: Lookup) {
  const accessible = !row.teamId || lookup.accessibleTeams.has(row.teamId);
  return {
    id: row.id,
    type: row.type,
    scopeType: row.scopeType,
    teamId: row.teamId,
    teamName: row.teamId ? lookup.teamNames.get(row.teamId) ?? null : null,
    accessible,
    projectId: accessible ? row.projectId : null,
    featureType: accessible ? row.featureType : null,
    fileId: accessible ? row.fileId : null,
    entityType: accessible ? row.entityType : null,
    entityId: accessible ? row.entityId : null,
    // A Team the user left shows no details, but its replies still group like the unread count (BUG-081).
    groupKey: row.groupKey && !accessible ? `hidden:${createHash("sha256").update(row.groupKey).digest("hex").slice(0, 16)}` : row.groupKey,
    link: accessible ? row.link : null,
    actor: accessible && row.actorUserId ? { id: row.actorUserId, name: lookup.actorNames.get(row.actorUserId) ?? null } : null,
    payload: accessible ? parsePayload(row.payload) : {},
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

export function listLimit(value: unknown): number {
  const limit = Math.floor(Number(value));
  return Number.isFinite(limit) && limit > 0 ? Math.min(limit, MAX_LIMIT) : DEFAULT_LIMIT;
}

/** BUG-081: unread bell items as the bell shows them, one per thread (group key) and one per notification without a key. */
async function unreadItemCount(store: NonNullable<ReturnType<typeof notificationStore>>, recipientUserId: string): Promise<number> {
  const [single, groups] = await Promise.all([
    store.count({ where: { recipientUserId, readAt: null, groupKey: null } }),
    store.groupBy({ by: ["groupKey"], where: { recipientUserId, readAt: null, groupKey: { not: null } } }),
  ]);
  return single + groups.length;
}

router.get("/notifications", authenticate, async (req: Request, res: Response) => {
  const store = notificationStore();
  if (!store || !prisma) return notFound(res);
  try {
    const user = (req as any).user as SessionUser;
    const [rows, unreadCount] = await Promise.all([
      store.findMany({
        where: { recipientUserId: user.id, ...(req.query.unread === "true" ? { readAt: null } : {}) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: listLimit(req.query.limit),
      }),
      unreadItemCount(store, user.id),
    ]);
    const teamIds = [...new Set(rows.flatMap((row) => (row.teamId ? [row.teamId] : [])))];
    const actorIds = [...new Set(rows.flatMap((row) => (row.actorUserId ? [row.actorUserId] : [])))];
    const [access, teams, actors] = await Promise.all([
      Promise.all(teamIds.map(async (id) => ((await canAccessTeam(id, user.id, Boolean(user.isSuperAdmin))) ? id : null))),
      teamIds.length ? prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } }) : [],
      actorIds.length ? prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [],
    ]);
    const lookup: Lookup = {
      accessibleTeams: new Set(access.filter((id): id is string => id !== null)),
      teamNames: new Map(teams.map((team): [string, string] => [team.id, team.name])),
      actorNames: new Map(actors.map((actor): [string, string | null] => [actor.id, actor.name])),
    };
    res.setHeader("Cache-Control", "private, no-store");
    // `live` tells the bell whether /api/notifications/live exists; attachCloudLiveSync uses the same condition (NOT-001.5).
    res.json({ notifications: rows.map((row) => presentNotification(row, lookup)), unreadCount, live: isLocalPostgres() });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : error }, "[Notifications] list failed");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/notifications/read-all", authenticate, async (req: Request, res: Response) => {
  const store = notificationStore();
  if (!store) return notFound(res);
  try {
    const userId = ((req as any).user as SessionUser).id;
    const updated = await store.updateMany({ where: { recipientUserId: userId, readAt: null }, data: { readAt: new Date() } });
    res.json({ success: true, updated: updated.count });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : error }, "[Notifications] read-all failed");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/notifications/:id/read", authenticate, async (req: Request, res: Response) => {
  const store = notificationStore();
  const id = String(req.params.id);
  if (!store || !isUuid(id)) return notFound(res);
  try {
    const userId = ((req as any).user as SessionUser).id;
    const row = await store.findFirst({ where: { id, recipientUserId: userId }, select: { groupKey: true } });
    // Someone else's id gets the same answer as a missing one; reading an already read notification is fine.
    if (!row) return notFound(res);
    // BUG-081: one bell item stands for its whole group, such as every reply in a thread, so reading it reads them all.
    await store.updateMany({ where: { recipientUserId: userId, readAt: null, ...(row.groupKey ? { groupKey: row.groupKey } : { id }) }, data: { readAt: new Date() } });
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : error }, "[Notifications] read failed");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
