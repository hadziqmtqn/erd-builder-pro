import { isSsoAuthMode } from "./config.js";
import { deleteEntityRevisions } from "./entity-history.js";
import { logger } from "./logger.js";
import { purgeExpiredNotifications } from "./notifications.js";
import { prisma } from "./prisma.js";
import { buildS3Client, deleteFromS3, getEnvStorageConfig, objectExists } from "./storage.js";
import { OBJECT_GRACE_DAYS, storageTrackingEnabled } from "./storage-usage.js";
import { runWithTeamScope } from "./team-scope.js";

/**
 * Background maintenance for CLD-010 in PostgreSQL modes: document byte recompute, two-phase object cleanup (H1)
 * with a dangling-reference report (H4), Trash retention (Q19) and revision retention (Q20). The daily run also applies
 * notification retention (NOT-001.1).
 * Every step is idempotent and logs counts only, never document content.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const USAGE_INTERVAL_MS = 15 * 60 * 1000;
const DAILY_INTERVAL_MS = DAY_MS;
const PENDING_SETTLE_MS = 10 * 60 * 1000;
/** A Team that becomes active again gets this many extra days before its old Trash is purged (Q19). */
const REACTIVATION_GRACE_DAYS = 7;
const BATCH = 500;
const STORAGE_KEY_PATTERN = /erd-builder-pro\/[^?#"'\s<>\\)]+/g;

let usageTimer: ReturnType<typeof setInterval> | null = null;
let dailyTimer: ReturnType<typeof setInterval> | null = null;

function retentionDays(variable: string): number {
  const configured = process.env[variable];
  if (configured !== undefined && configured.trim() !== "") {
    const days = Number(configured);
    return Number.isFinite(days) && days > 0 ? Math.floor(days) : 0;
  }
  // Cloud purges after 30 days; Self-host keeps office data unless the operator opts in (Q19, Q20).
  return isSsoAuthMode() ? 30 : 0;
}

export const trashRetentionDays = () => retentionDays("TRASH_RETENTION_DAYS");
export const revisionRetentionDays = () => retentionDays("REVISION_RETENTION_DAYS");

const FILE_SCOPE = (alias: string) => `CASE WHEN p."team_id" IS NOT NULL THEN 'team' ELSE 'user' END AS scope_type,
  COALESCE(p."team_id", ${alias}."user_id") AS scope_id`;
const ERD_STRUCTURE = `COALESCE((SELECT SUM(pg_column_size(e.*)) FROM "entities" e WHERE e."diagram_id" = g."id"), 0)
  + COALESCE((SELECT SUM(pg_column_size(c.*)) FROM "columns" c JOIN "entities" e ON e."id" = c."entity_id" WHERE e."diagram_id" = g."id"), 0)
  + COALESCE((SELECT SUM(pg_column_size(r.*)) FROM "relationships" r WHERE r."diagram_id" = g."id"), 0)
  + COALESCE((SELECT SUM(pg_column_size(tc.*)) FROM "table_constraints" tc JOIN "entities" e ON e."id" = tc."entity_id" WHERE e."diagram_id" = g."id"), 0)
  + COALESCE((SELECT SUM(pg_column_size(ti.*)) FROM "table_indexes" ti JOIN "entities" e ON e."id" = ti."entity_id" WHERE e."diagram_id" = g."id"), 0)`;
const REVISIONS = (types: string) => `COALESCE((SELECT SUM(octet_length(ec."changes"::text)) FROM "entity_changes" ec
  WHERE ec."entity_id" = f."id"::text AND ec."entity_type" IN (${types})), 0)`;

/**
 * Recomputes document and revision bytes per scope. Document bytes cover what users create, including Trash and the
 * ERD structure tables; revisions are reported but never counted toward the quota (Q2, Q20).
 */
export async function recomputeDocumentBytes(): Promise<number> {
  if (!storageTrackingEnabled()) return 0;
  const rows = `
    SELECT ${FILE_SCOPE("f")}, octet_length(COALESCE(f."title", '')) + octet_length(COALESCE(f."content", '')) AS doc,
           ${REVISIONS("'notes', 'note'")} AS rev
      FROM "notes" f LEFT JOIN "projects" p ON p."id" = f."project_id"
    UNION ALL
    SELECT ${FILE_SCOPE("f")}, octet_length(COALESCE(f."title", '')) + octet_length(COALESCE(f."data", '')),
           ${REVISIONS("'drawings', 'drawing'")}
      FROM "drawings" f LEFT JOIN "projects" p ON p."id" = f."project_id"
    UNION ALL
    SELECT ${FILE_SCOPE("f")}, octet_length(COALESCE(f."title", '')) + octet_length(COALESCE(f."data", '')),
           ${REVISIONS("'flowcharts', 'flowchart'")}
      FROM "flowcharts" f LEFT JOIN "projects" p ON p."id" = f."project_id"
    UNION ALL
    SELECT ${FILE_SCOPE("g")}, octet_length(COALESCE(g."name", '')) + octet_length(COALESCE(g."data", ''))
             + octet_length(COALESCE(g."dbml_source", '')) + ${ERD_STRUCTURE},
           COALESCE((SELECT SUM(octet_length(ec."changes"::text)) FROM "entity_changes" ec
             WHERE ec."entity_id" = g."id"::text AND ec."entity_type" IN ('diagrams', 'diagram')), 0)
      FROM "diagrams" g LEFT JOIN "projects" p ON p."id" = g."project_id"`;
  const [, inserted] = await (prisma as any).$transaction([
    (prisma as any).$executeRawUnsafe(`DELETE FROM "storage_usage"`),
    (prisma as any).$executeRawUnsafe(`
      INSERT INTO "storage_usage" ("scope_type", "scope_id", "document_bytes", "revision_bytes", "updated_at")
      SELECT scope_type, scope_id, SUM(doc), SUM(rev), CURRENT_TIMESTAMP
        FROM (${rows}) AS files
       WHERE scope_id IS NOT NULL
       GROUP BY scope_type, scope_id`),
  ]);
  return Number(inserted);
}

async function forEachBatch<T extends { id: number }>(
  load: (afterId: number) => Promise<T[]>,
  visit: (row: T) => void,
): Promise<void> {
  let afterId = 0;
  for (;;) {
    const rows = await load(afterId);
    rows.forEach(visit);
    if (rows.length < BATCH) return;
    afterId = rows[rows.length - 1].id;
  }
}

/** Keys referenced by any document (including Trash) or any surviving revision, in every scope (H1). */
export async function collectReferencedKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  const scan = (text: unknown) => {
    if (typeof text === "string") for (const match of text.matchAll(STORAGE_KEY_PATTERN)) keys.add(match[0]);
  };
  const db = prisma as any;
  const page = (afterId: number) => ({ where: { id: { gt: afterId } }, orderBy: { id: "asc" }, take: BATCH });
  await forEachBatch((afterId) => db.note.findMany({ ...page(afterId), select: { id: true, content: true } }), (row: any) => scan(row.content));
  await forEachBatch((afterId) => db.drawing.findMany({ ...page(afterId), select: { id: true, data: true } }), (row: any) => scan(row.data));
  await forEachBatch(
    (afterId) => db.entityChange.findMany({
      ...page(afterId),
      where: { id: { gt: afterId }, entityType: { in: ["notes", "note", "drawings", "drawing"] } },
      select: { id: true, changes: true },
    }),
    (row: any) => scan(typeof row.changes === "string" ? row.changes : JSON.stringify(row.changes)),
  );
  return keys;
}

export type SweepResult = { marked: number; cleared: number; deleted: number; settled: number; dangling: number };

/**
 * Two-phase object cleanup (H1): unreferenced objects are marked, a marked object referenced again is cleared, and only
 * objects unreferenced for the whole grace (longer than the database backup retention) are removed from the bucket.
 */
export async function sweepStorageObjects(now = new Date()): Promise<SweepResult> {
  const result: SweepResult = { marked: 0, cleared: 0, deleted: 0, settled: 0, dangling: 0 };
  if (!storageTrackingEnabled()) return result;
  const db = prisma as any;
  const config = getEnvStorageConfig();
  const s3 = config ? buildS3Client(config) : null;

  // Uploads whose PutObject outcome was never recorded: keep what the bucket has, release the rest.
  const pending = await db.storageObject.findMany({ where: { status: "pending", createdAt: { lt: new Date(now.getTime() - PENDING_SETTLE_MS) } }, select: { key: true } });
  if (s3 && config) {
    for (const { key } of pending) {
      const stored = await objectExists(s3 as any, config, key).catch(() => null);
      if (stored === null) continue;
      await (stored
        ? db.storageObject.update({ where: { key }, data: { status: "committed" } })
        : db.storageObject.deleteMany({ where: { key, status: "pending" } }));
      result.settled++;
    }
  }

  const referenced = await collectReferencedKeys();
  const tracked = new Set<string>();
  const toMark: string[] = [];
  const toClear: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const rows = await db.storageObject.findMany({
      where: { status: { in: ["committed", "deleted"] } },
      orderBy: { key: "asc" },
      take: BATCH,
      ...(cursor ? { cursor: { key: cursor }, skip: 1 } : {}),
      select: { key: true, status: true, unreferencedSince: true },
    });
    for (const row of rows) {
      tracked.add(row.key);
      if (referenced.has(row.key)) {
        if (row.unreferencedSince || row.status === "deleted") toClear.push(row.key);
      } else if (!row.unreferencedSince) {
        toMark.push(row.key);
      }
    }
    if (rows.length < BATCH) break;
    cursor = rows[rows.length - 1].key;
  }
  if (toMark.length) result.marked = (await db.storageObject.updateMany({ where: { key: { in: toMark } }, data: { unreferencedSince: now } })).count;
  // A document or revision that uses an object again undoes any earlier delete request.
  if (toClear.length) result.cleared = (await db.storageObject.updateMany({ where: { key: { in: toClear } }, data: { unreferencedSince: null, status: "committed", deletedAt: null } })).count;

  const cutoff = new Date(now.getTime() - OBJECT_GRACE_DAYS * DAY_MS);
  const expired = await db.storageObject.findMany({
    where: { status: { in: ["committed", "deleted"] }, unreferencedSince: { lt: cutoff } },
    select: { key: true },
  });
  if (s3 && config) {
    for (const { key } of expired) {
      if (referenced.has(key)) continue;
      try {
        await deleteFromS3(s3 as any, config, key);
        await db.storageObject.delete({ where: { key } });
        result.deleted++;
      } catch (err) {
        logger.warn({ reason: err instanceof Error ? err.message : "unknown error" }, "Storage cleanup could not delete an object");
      }
    }
  }

  // H4: keys in the scoped layout that documents use but that have no record point at lost or foreign objects.
  const dangling = [...referenced].filter((key) => /^erd-builder-pro\/(team|user)\//.test(key) && !tracked.has(key));
  const known = dangling.length ? await db.storageObject.findMany({ where: { key: { in: dangling } }, select: { key: true } }) : [];
  const knownKeys = new Set(known.map((row: { key: string }) => row.key));
  const missing = dangling.filter((key) => !knownKeys.has(key));
  result.dangling = missing.length;
  if (missing.length) logger.warn({ count: missing.length, sample: missing.slice(0, 5) }, "Documents reference storage objects with no record");
  return result;
}

/** Permanently deletes Trash items older than the retention, skipping inactive Teams and recently reactivated ones (Q19). */
export async function purgeExpiredTrash(now = new Date()): Promise<number> {
  const days = trashRetentionDays();
  if (!days || !storageTrackingEnabled()) return 0;
  const db = prisma as any;
  const deletedBefore = new Date(now.getTime() - days * DAY_MS);
  const reactivatedBefore = new Date(now.getTime() - REACTIVATION_GRACE_DAYS * DAY_MS);
  // Team.updatedAt moves when a Team is reactivated, so a recently changed Team waits the extra grace.
  const purgeable = {
    OR: [
      { projectId: null },
      { project: { teamId: null } },
      { project: { team: { status: "active", updatedAt: { lt: reactivatedBefore } } } },
    ],
  };
  const expired = { isDeleted: true, deletedAt: { lt: deletedBefore } };
  let purged = 0;

  const projects = await db.project.findMany({
    where: { ...expired, OR: [{ teamId: null }, { team: { status: "active", updatedAt: { lt: reactivatedBefore } } }] },
    select: { id: true, userId: true, teamId: true },
  });
  const { permanentDeleteProject } = await import("../routes/projects/service.js");
  for (const project of projects) {
    const scope = project.teamId ? { mode: "team" as const, teamId: project.teamId } : { mode: "personal" as const, teamId: null };
    const outcome = await runWithTeamScope(scope, () => permanentDeleteProject(project.id, project.userId));
    if (outcome?.success) purged++;
  }

  const notes = await db.note.findMany({ where: { ...expired, ...purgeable }, select: { id: true } });
  if (notes.length) {
    await db.note.deleteMany({ where: { id: { in: notes.map((row: any) => row.id) } } });
    await deleteEntityRevisions("notes", notes.map((row: any) => row.id));
  }
  const drawings = await db.drawing.findMany({ where: { ...expired, ...purgeable }, select: { id: true } });
  if (drawings.length) {
    await db.drawing.deleteMany({ where: { id: { in: drawings.map((row: any) => row.id) } } });
    await deleteEntityRevisions("drawings", drawings.map((row: any) => row.id));
  }
  const flowcharts = await db.flowchart.findMany({ where: { ...expired, ...purgeable }, select: { id: true } });
  if (flowcharts.length) {
    await db.flowchart.deleteMany({ where: { id: { in: flowcharts.map((row: any) => row.id) } } });
    await deleteEntityRevisions("flowcharts", flowcharts.map((row: any) => row.id));
  }
  const diagrams = await db.diagram.findMany({ where: { ...expired, ...purgeable }, select: { id: true } });
  const { permanentDeleteDiagram } = await import("../routes/diagrams/service.js");
  for (const diagram of diagrams) await permanentDeleteDiagram(diagram.id);

  purged += notes.length + drawings.length + flowcharts.length + diagrams.length;
  return purged;
}

/** Deletes revisions older than the retention window, every revision type alike (Q20). */
export async function pruneRevisions(now = new Date()): Promise<number> {
  const days = revisionRetentionDays();
  if (!days || !storageTrackingEnabled()) return 0;
  const removed = await (prisma as any).entityChange.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - days * DAY_MS) } } });
  return removed.count;
}

async function runSafely(label: string, task: () => Promise<unknown>) {
  try {
    const outcome = await task();
    logger.info({ task: label, outcome }, "Storage maintenance finished");
  } catch (err) {
    logger.warn({ task: label, reason: err instanceof Error ? err.message : "unknown error" }, "Storage maintenance failed");
  }
}

export async function runDailyStorageMaintenance(): Promise<void> {
  // Trash first so purged documents stop referencing their objects before the sweep marks them.
  await runSafely("trash", () => purgeExpiredTrash());
  await runSafely("revisions", () => pruneRevisions());
  await runSafely("notifications", () => purgeExpiredNotifications());
  await runSafely("sweep", () => sweepStorageObjects());
  await runSafely("usage", () => recomputeDocumentBytes());
}

export function startStorageMaintenance(): void {
  if (!storageTrackingEnabled() || usageTimer) return;
  void runSafely("usage", () => recomputeDocumentBytes());
  usageTimer = setInterval(() => { void runSafely("usage", () => recomputeDocumentBytes()); }, USAGE_INTERVAL_MS);
  usageTimer.unref?.();
  // First daily run a few minutes after boot, so a deploy does not wait a day and boot is not slowed.
  setTimeout(() => { void runDailyStorageMaintenance(); }, 10 * 60 * 1000).unref?.();
  dailyTimer = setInterval(() => { void runDailyStorageMaintenance(); }, DAILY_INTERVAL_MS);
  dailyTimer.unref?.();
}
