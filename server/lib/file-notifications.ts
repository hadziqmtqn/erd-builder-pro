import { publishUserNotification } from "./cloud-live-sync.js";
import { logger } from "./logger.js";
import { createNotifications, type NotificationInput } from "./notifications.js";
import { prisma } from "./prisma.js";
import { currentTeamScope } from "./team-scope.js";

/**
 * NOT-001.6 `file.deleted` (moved to the Trash) and `file.restored` for one Team file. Only the file's creator can do
 * either, so the notice goes to the other people who run the Project. Personal and Desktop files have one user and get
 * none.
 */

type Feature = "diagram" | "note" | "drawing" | "flowchart";
// The file routes and the file tables share these names.
const FEATURE_PATHS: Record<Feature, string> = { diagram: "diagrams", note: "notes", drawing: "drawings", flowchart: "flowcharts" };

export type TrashedFile = { id: number | bigint; uid?: string | null; projectId?: number | null; name?: string | null; title?: string | null };

/**
 * Active Team members whose effective role on the Project is owner, manager or editor (COL-004, COL-007), without the
 * actor: the Project creator unless a Manager limited them, every Team Manager, and every Editor grant.
 */
export async function projectEditors(projectId: number, teamId: string, actorId: string): Promise<string[]> {
  if (!prisma) return [];
  const rows = await prisma.$queryRawUnsafe<Array<{ userId: string }>>(`
    SELECT DISTINCT r."user_id" AS "userId"
    FROM (
      SELECT p."user_id" FROM "projects" p
      WHERE p."id" = $1 AND p."team_id" = $2 AND NOT EXISTS (
        SELECT 1 FROM "project_access_grants" lg
        WHERE lg."project_id" = p."id" AND lg."user_id" = p."user_id" AND lg."role" IN ('viewer', 'commenter')
      )
      UNION
      SELECT m."user_id" FROM "team_members" m WHERE m."team_id" = $2 AND m."role" = 'manager'
      UNION
      SELECT g."user_id" FROM "project_access_grants" g WHERE g."project_id" = $1 AND g."role" = 'editor'
    ) r
    JOIN "team_members" tm ON tm."user_id" = r."user_id" AND tm."team_id" = $2 AND tm."status" = 'active'
    WHERE r."user_id" <> $3
  `, projectId, teamId, actorId);
  return rows.map((row) => row.userId);
}

/**
 * Call after the Trash state really changed, so a repeated request never sends a second notice. Only names go into the
 * payload. A failure is logged and never fails the file action; returns the users notified.
 */
export async function notifyFileTrash(type: "file.deleted" | "file.restored", featureType: Feature, file: TrashedFile, actorId: string): Promise<string[]> {
  const scope = currentTeamScope();
  if (scope?.mode !== "team" || !scope.teamId || file.projectId == null || !prisma) return [];
  const teamId = scope.teamId;
  try {
    const projectId = Number(file.projectId);
    const recipients = await projectEditors(projectId, teamId, actorId);
    if (!recipients.length) return [];
    const project = await prisma.$queryRawUnsafe<Array<{ name: string | null }>>('SELECT "name" FROM "projects" WHERE "id" = $1 LIMIT 1', projectId);
    const fileKey = file.uid ?? String(file.id);
    // Nobody but its creator can open a file in the Trash, so that notice points to the Project instead.
    const link = type === "file.restored" ? `/${FEATURE_PATHS[featureType]}/${encodeURIComponent(fileKey)}` : `/projects/${projectId}`;
    const inputs: NotificationInput[] = recipients.map((recipientUserId) => ({
      recipientUserId,
      actorUserId: actorId,
      scopeType: "file",
      teamId,
      projectId,
      featureType,
      fileId: fileKey,
      type,
      entityType: "file",
      entityId: fileKey,
      groupKey: `file:${featureType}:${fileKey}`,
      link,
      payload: { fileName: file.name ?? file.title ?? null, projectName: project[0]?.name ?? null },
    }));
    await createNotifications(inputs);
    await publishUserNotification(recipients);
    return recipients;
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : error, type, featureType }, "[Notifications] file notice failed");
    return [];
  }
}
