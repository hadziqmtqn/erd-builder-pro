import { publishUserNotification } from "./cloud-live-sync.js";
import { logger } from "./logger.js";
import { createNotifications, type NotificationInput } from "./notifications.js";
import { prisma } from "./prisma.js";
import { currentTeamScope } from "./team-scope.js";

/**
 * File notifications for one Team file: NOT-001.6 `file.deleted` (moved to the Trash) and `file.restored`, and NOT-001.7
 * `file.moved`. Only the file's creator can do any of these, so the notice goes to the other people who run the
 * Project. Personal and Desktop files have one user and get none.
 */

type Feature = "diagram" | "note" | "drawing" | "flowchart";
type FileEvent = "file.deleted" | "file.restored" | "file.moved";
// The file routes and the file tables share these names.
const FEATURE_PATHS: Record<Feature, string> = { diagram: "diagrams", note: "notes", drawing: "drawings", flowchart: "flowcharts" };

export type FileRef = { id: number | bigint; uid?: string | null; projectId?: number | null; name?: string | null; title?: string | null };

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
 * One metadata-only row per editor of these Projects (the file's Project after the event comes last), then their
 * sockets wake. Only names go into the payload. A failure is logged and never fails the file action.
 */
async function sendFileNotice(type: FileEvent, featureType: Feature, file: FileRef, actorId: string, projectIds: number[]): Promise<string[]> {
  const scope = currentTeamScope();
  if (scope?.mode !== "team" || !scope.teamId || !prisma) return [];
  const teamId = scope.teamId;
  try {
    const recipients = [...new Set((await Promise.all(projectIds.map((id) => projectEditors(id, teamId, actorId)))).flat())];
    if (!recipients.length) return [];
    const placeholders = projectIds.map((_, index) => "$" + (index + 1)).join(", ");
    const rows = await prisma.$queryRawUnsafe<Array<{ id: number; name: string | null }>>(
      `SELECT "id", "name" FROM "projects" WHERE "id" IN (${placeholders})`, ...projectIds,
    );
    const names = new Map(rows.map((row): [number, string | null] => [Number(row.id), row.name]));
    const projectId = projectIds[projectIds.length - 1];
    const fileKey = file.uid ?? String(file.id);
    // Nobody but its creator can open a file in the Trash, so that notice points to the Project instead.
    const link = type === "file.deleted" ? `/projects/${projectId}` : `/${FEATURE_PATHS[featureType]}/${encodeURIComponent(fileKey)}`;
    const payload: Record<string, unknown> = { fileName: file.name ?? file.title ?? null, projectName: names.get(projectId) ?? null };
    if (type === "file.moved") payload.fromProjectName = names.get(projectIds[0]) ?? null;
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
      payload,
    }));
    await createNotifications(inputs);
    await publishUserNotification(recipients);
    return recipients;
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : error, type, featureType }, "[Notifications] file notice failed");
    return [];
  }
}

/** Call after the Trash state really changed, so a repeated request never sends a second notice. */
export function notifyFileTrash(type: "file.deleted" | "file.restored", featureType: Feature, file: FileRef, actorId: string): Promise<string[]> {
  return file.projectId == null ? Promise.resolve([]) : sendFileNotice(type, featureType, file, actorId, [Number(file.projectId)]);
}

/**
 * Call after a successful write with the Project it asked for. Autosave sends the Project on every save, so only a
 * real change notifies, and the editors of both Projects hear about it.
 */
export function notifyFileMoved(featureType: Feature, file: FileRef, toProjectId: number | null | undefined, actorId: string): Promise<string[]> {
  if (file.projectId == null || toProjectId == null || Number(file.projectId) === Number(toProjectId)) return Promise.resolve([]);
  return sendFileNotice("file.moved", featureType, file, actorId, [Number(file.projectId), Number(toProjectId)]);
}
