import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { publishCloudWorkspaceSync } from "../../lib/cloud-live-sync.js";
import { prisma } from "../../lib/prisma.js";
import { currentTeamScope } from "../../lib/team-scope.js";
import { handleError } from "../../lib/utils.js";

const router = Router({ mergeParams: true });
const notFound = { error: "Resource not found" };
const MAX_BODY_LENGTH = 4000;
const HISTORY_PAGE_SIZE = 50;

const featureTypeSchema = z.enum(["diagram", "note", "drawing", "flowchart"]);
const anchorTypeSchema = z.enum(["general", "table", "relationship", "block", "shape", "point"]);
const legacyAnchorTypeSchema = z.enum(["general", "table", "relationship"]);
const erdCommentAnchorTypeSchema = z.enum(["table", "relationship"]);
const collaborationContextSchema = z.object({
  type: anchorTypeSchema,
  id: z.string().trim().min(1).max(128).optional(),
  featureType: featureTypeSchema.optional(),
  fileId: z.string().trim().min(1).max(128).optional(),
}).strict();

const createThreadSchema = z.object({
  body: z.string().trim().min(1).max(MAX_BODY_LENGTH),
  context: collaborationContextSchema.optional(),
  // Keep accepting the pre-context payload while cached clients roll forward.
  anchorType: legacyAnchorTypeSchema.optional(),
  anchorId: z.string().trim().min(1).max(128).optional(),
}).strict().superRefine((value, ctx) => {
  const anchorType = value.context?.type ?? value.anchorType ?? "general";
  const anchorId = value.context?.id ?? value.anchorId;
  if (anchorType !== "general" && !anchorId) {
    ctx.addIssue({ code: "custom", message: "Context requires an anchor", path: ["context", "id"] });
  }
  if (anchorType === "general" && anchorId) {
    ctx.addIssue({ code: "custom", message: "General context does not have an anchor", path: ["context", "id"] });
  }
});

const messageSchema = z.object({ body: z.string().trim().min(1).max(MAX_BODY_LENGTH) }).strict();
const editMessageSchema = z.object({
  body: z.string().trim().min(1).max(MAX_BODY_LENGTH),
  expectedBody: z.string().max(MAX_BODY_LENGTH),
}).strict();
const deleteMessageSchema = z.object({ expectedBody: z.string().max(MAX_BODY_LENGTH) }).strict();
const statusSchema = z.object({
  status: z.enum(["open", "resolved"]),
  expectedStatus: z.enum(["open", "resolved"]).optional(),
}).strict().refine((value) => !value.expectedStatus || value.status !== value.expectedStatus);
const historyCursorSchema = z.object({
  before_created_at: z.string().datetime({ offset: true }).optional(),
  before_id: z.string().trim().min(1).max(128).optional(),
}).refine((value) => Boolean(value.before_created_at) === Boolean(value.before_id));
const resourceKindSchema = z.enum(["discussion", "comment"]);

type ResourceKind = z.infer<typeof resourceKindSchema>;
type FeatureType = z.infer<typeof featureTypeSchema>;
type AnchorType = z.infer<typeof anchorTypeSchema>;
type ScopedFile = { id: number; uid: string | null; projectId: number | bigint; label: string; featureType: FeatureType };
type ScopedResource = { projectId: number | bigint; projectName: string; currentFile: ScopedFile | null };
type DiscussionActor = { id: string; teamId: string };
type HistoryCursor = { createdAt: Date; id: string };

const tables = {
  discussion: { threads: "discussion_threads", messages: "discussion_messages", reads: "discussion_reads" },
  comment: { threads: "comment_threads", messages: "comment_messages", reads: "comment_reads" },
} as const;

const featureTables: Record<FeatureType, { table: string; label: string }> = {
  diagram: { table: "diagrams", label: "name" },
  note: { table: "notes", label: "title" },
  drawing: { table: "drawings", label: "title" },
  flowchart: { table: "flowcharts", label: "title" },
};

function discussionFileNameSql(contextAlias: string, threadAlias: string): string {
  const cases = Object.entries(featureTables).map(([type, file]) => `
      WHEN '${type}' THEN (
        SELECT f."${file.label}" FROM "${file.table}" f
        WHERE CAST(f."id" AS TEXT) = ${contextAlias}."file_id"
          AND f."project_id" = ${threadAlias}."project_id"
        LIMIT 1
      )`);
  return `CASE ${contextAlias}."feature_type"${cases.join("")} END`;
}

function resourceKind(req: Request): ResourceKind {
  const value = (req as any).collaborationResource;
  return resourceKindSchema.safeParse(value).success ? value : "discussion";
}

export function setCollaborationResource(kind: ResourceKind) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as any).collaborationResource = kind;
    next();
  };
}

function isProjectRoute(req: Request): boolean {
  return typeof (req.params as { projectId?: string }).projectId === "string";
}

function historyCursor(req: Request): { valid: boolean; cursor: HistoryCursor | null } {
  const parsed = historyCursorSchema.safeParse({
    before_created_at: typeof req.query.before_created_at === "string" ? req.query.before_created_at : undefined,
    before_id: typeof req.query.before_id === "string" ? req.query.before_id : undefined,
  });
  if (!parsed.success) return { valid: false, cursor: null };
  return {
    valid: true,
    cursor: parsed.data.before_created_at && parsed.data.before_id
      ? { createdAt: new Date(parsed.data.before_created_at), id: parsed.data.before_id }
      : null,
  };
}

function pageHistory<T extends { id: string; createdAt: Date | string }>(rows: T[]) {
  const hasMore = rows.length > HISTORY_PAGE_SIZE;
  const page = rows.slice(0, HISTORY_PAGE_SIZE);
  const oldest = page[page.length - 1];
  const timestamp = oldest?.createdAt instanceof Date
    ? oldest.createdAt.toISOString()
    : oldest ? new Date(oldest.createdAt).toISOString() : null;
  return {
    messages: page.reverse(),
    hasMore,
    nextCursor: hasMore && oldest && timestamp ? { createdAt: timestamp, id: oldest.id } : null,
  };
}

export function requireCloudDiscussionTeam(_req: Request, res: Response, next: NextFunction): void {
  const scope = currentTeamScope();
  // The same Team-scoped route serves Cloud SSO and licensed Self-host. The
  // auth middleware has already checked the instance license for Self-host.
  if (scope?.mode !== "team" || !scope.teamId) {
    res.status(404).json(notFound);
    return;
  }
  next();
}

function actorFor(req: Request): DiscussionActor | null {
  const userId = String((req as any).user?.id || "");
  const scope = currentTeamScope();
  return scope?.mode === "team" && scope.teamId && userId
    ? { id: userId, teamId: scope.teamId }
    : null;
}

async function scopedDiagramContext(uid: string, teamId: string): Promise<{ id: number; projectId: number | bigint; projectName: string; label: string; uid: string | null } | null> {
  if (!prisma) return null;
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number; projectId: number | bigint; projectName?: string; label?: string; uid?: string | null }>>(`
    SELECT d."id", d."uid", d."name" AS "label", p."id" AS "projectId", p."name" AS "projectName"
    FROM "diagrams" d
    JOIN "projects" p ON p."id" = d."project_id"
    WHERE (d."uid" = $1 OR CAST(d."id" AS TEXT) = $1)
      AND p."team_id" = $2
      AND COALESCE(d."is_deleted", false) = false
      AND COALESCE(p."is_deleted", false) = false
      AND COALESCE(d."source_type", 'blank') <> 'production_db'
    LIMIT 1
  `, uid, teamId);
  return rows[0] ? {
    ...rows[0],
    projectName: rows[0].projectName || "Project",
    label: rows[0].label || "ERD file",
    uid: rows[0].uid ?? null,
  } : null;
}

async function scopedProjectContext(projectIdValue: string, teamId: string): Promise<{ id: number; name: string } | null> {
  if (!prisma) return null;
  const projectId = Number(projectIdValue);
  if (!Number.isInteger(projectId) || projectId <= 0) return null;
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number; name: string }>>(`
    SELECT p."id", p."name"
    FROM "projects" p
    WHERE p."id" = $1 AND p."team_id" = $2 AND COALESCE(p."is_deleted", false) = false
    LIMIT 1
  `, projectId, teamId);
  return rows[0] ?? null;
}

async function scopedFeatureContext(featureType: FeatureType, fileId: string, projectId: number | bigint, teamId: string): Promise<ScopedFile | null> {
  if (!prisma) return null;
  const definition = featureTables[featureType];
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number; uid: string | null; projectId: number | bigint; label: string }>>(`
    SELECT f."id", f."uid", f."${definition.label}" AS "label", f."project_id" AS "projectId"
    FROM "${definition.table}" f
    JOIN "projects" p ON p."id" = f."project_id"
    WHERE (f."uid" = $1 OR CAST(f."id" AS TEXT) = $1)
      AND f."project_id" = $2 AND p."team_id" = $3
      AND COALESCE(f."is_deleted", false) = false
      ${featureType === "diagram" ? "AND COALESCE(f.\"source_type\", 'blank') <> 'production_db'" : ""}
    LIMIT 1
  `, fileId, projectId, teamId);
  return rows[0] ? { ...rows[0], featureType } : null;
}

async function scopedResource(req: Request, actor: DiscussionActor): Promise<ScopedResource | null> {
  if (!isProjectRoute(req)) {
    const diagram = await scopedDiagramContext((req.params as { uid: string }).uid, actor.teamId);
    if (!diagram) return null;
    return {
      projectId: diagram.projectId,
      projectName: diagram.projectName,
      currentFile: { id: diagram.id, uid: diagram.uid, projectId: diagram.projectId, label: diagram.label, featureType: "diagram" },
    };
  }

  const project = await scopedProjectContext((req.params as { projectId: string }).projectId, actor.teamId);
  if (!project) return null;
  const featureType = featureTypeSchema.safeParse(req.query.feature_type).success ? req.query.feature_type as FeatureType : null;
  const fileId = typeof req.query.file_id === "string" ? req.query.file_id : "";
  const currentFile = featureType && fileId
    ? await scopedFeatureContext(featureType, fileId, project.id, actor.teamId)
    : null;
  if (featureType && fileId && !currentFile) return null;
  return { projectId: project.id, projectName: project.name, currentFile };
}

async function actorName(userId: string, fallback: string): Promise<string> {
  if (!prisma) return fallback || "Team member";
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string | null; email: string | null }>>(
    'SELECT "name", "email" FROM "users" WHERE "id" = $1 LIMIT 1', userId,
  );
  return rows[0]?.name?.trim() || rows[0]?.email || fallback || "Team member";
}

function notifyTeam(teamId: string): void {
  void publishCloudWorkspaceSync({ teamId, eventType: "cloud.workspace.sync", revision: randomUUID() });
}

function anchorLabel(type: AnchorType): string {
  return type === "general" ? "General" : type[0].toUpperCase() + type.slice(1);
}

async function resolveAnchorLabel(file: ScopedFile | null, type: AnchorType, id: string | undefined, resource: ScopedResource): Promise<string | null> {
  if (type === "general") return "General";
  if (!file || !id) return null;
  if (file.featureType !== "diagram") return `${file.label} · ${anchorLabel(type)}`;
  if (type !== "table" && type !== "relationship") return null;
  if (!prisma) return null;
  if (type === "table") {
    const rows = await prisma.$queryRawUnsafe<Array<{ label: string }>>(
      'SELECT "name" AS "label" FROM "entities" WHERE "id" = $1 AND "diagram_id" = $2 LIMIT 1', id, file.id,
    );
    return rows[0]?.label || null;
  }
  if (type === "relationship") {
    const rows = await prisma.$queryRawUnsafe<Array<{ label: string }>>(`
      SELECT COALESCE(NULLIF(r."label", ''), NULLIF(concat_ws(' → ', source."name", target."name"), ''), 'Relationship') AS "label"
      FROM "relationships" r
      LEFT JOIN "entities" source ON source."id" = r."source_entity_id"
      LEFT JOIN "entities" target ON target."id" = r."target_entity_id"
      WHERE r."id" = $1 AND r."diagram_id" = $2
      LIMIT 1
    `, id, file.id);
    return rows[0]?.label || null;
  }
  return `${resource.projectName} · ${anchorLabel(type)}`;
}

type CreateThreadInput = z.infer<typeof createThreadSchema>;

function contextInput(req: Request, input: CreateThreadInput): { type: AnchorType; id?: string; featureType?: FeatureType; fileId?: string } {
  return {
    type: input.context?.type ?? input.anchorType ?? "general",
    id: input.context?.id ?? input.anchorId,
    featureType: input.context?.featureType ?? (featureTypeSchema.safeParse(req.query.feature_type).success ? req.query.feature_type as FeatureType : undefined),
    fileId: input.context?.fileId ?? (typeof req.query.file_id === "string" ? req.query.file_id : undefined),
  };
}

async function contextForRequest(req: Request, resource: ScopedResource, input: CreateThreadInput, kind: ResourceKind): Promise<{ file: ScopedFile | null; type: AnchorType; id?: string; label: string } | null> {
  const raw = contextInput(req, input);
  const actor = actorFor(req);
  const file = resource.currentFile || (raw.featureType && raw.fileId && actor
    ? await scopedFeatureContext(raw.featureType, raw.fileId, resource.projectId, actor.teamId)
    : null);
  if (raw.featureType && raw.fileId && !file) return null;
  if (kind === "discussion" && (raw.type !== "general" || raw.id)) return null;
  if (kind === "comment" && (!file || raw.type === "general" || !raw.id)) return null;
  if (kind === "discussion" && !isProjectRoute(req) && !file) return null;
  const label = kind === "discussion" ? file?.label || "General" : await resolveAnchorLabel(file, raw.type, raw.id, resource);
  if (!label) return null;
  return { file, type: raw.type, id: raw.id, label };
}

function listScope(req: Request, resource: ScopedResource): "file" | "project" {
  if (!isProjectRoute(req)) return "file";
  return req.query.scope === "project" ? "project" : "file";
}

function contextParams(resource: ScopedResource, _req: Request): { featureType: FeatureType; fileId: string } | null {
  const file = resource.currentFile;
  return file ? { featureType: file.featureType, fileId: String(file.id) } : null;
}

async function threadInScope(req: Request, resource: ScopedResource, actor: DiscussionActor, threadId: string, kind: ResourceKind): Promise<boolean> {
  if (!prisma) return false;
  const table = tables[kind];
  const fileParams = contextParams(resource, req);
  if (kind === "comment" && !fileParams) return false;
  const contextClause = kind === "discussion" && fileParams && !isProjectRoute(req)
    ? `AND EXISTS (SELECT 1 FROM "discussion_contexts" c WHERE c."thread_id" = t."id" AND c."feature_type" = $4 AND c."file_id" = $5)`
    : kind === "comment" && fileParams
      ? `AND t."feature_type" = $4 AND t."file_id" = $5`
      : "";
  const values = fileParams && (kind === "comment" || !isProjectRoute(req))
    ? [threadId, resource.projectId, actor.teamId, fileParams.featureType, fileParams.fileId]
    : [threadId, resource.projectId, actor.teamId];
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`
    SELECT t."id"
    FROM "${table.threads}" t
    WHERE t."id" = $1 AND t."project_id" = $2 AND t."team_id" = $3 ${contextClause}
    LIMIT 1
  `, ...values);
  return rows.length > 0;
}

function discussionContextSelect(scope: "file" | "project", params: { featureType: FeatureType; fileId: string } | null): { sql: string; values: unknown[]; actorRef: string; filter: string } {
  if (scope === "file" && params) {
    return {
      sql: `AND c."feature_type" = $3 AND c."file_id" = $4`,
      values: [params.featureType, params.fileId],
      actorRef: "$5",
      filter: `AND EXISTS (SELECT 1 FROM "discussion_contexts" cf WHERE cf."thread_id" = t."id" AND cf."feature_type" = $3 AND cf."file_id" = $4)`,
    };
  }
  return { sql: "", values: [], actorRef: "$3", filter: "" };
}

async function listDiscussions(req: Request, res: Response, resource: ScopedResource, actor: DiscussionActor): Promise<void> {
  const scope = listScope(req, resource);
  const params = contextParams(resource, req);
  if (scope === "file" && !params) { res.status(404).json(notFound); return; }
  const context = discussionContextSelect(scope, params);
  const values = [resource.projectId, actor.teamId, ...context.values, actor.id];
  const threads = await prisma!.$queryRawUnsafe<Array<Record<string, any>>>(`
    SELECT t."id", c."feature_type" AS "featureType", c."file_id" AS "fileId",
      c."fileName", t."status",
      (t."created_by" = ${context.actorRef}) AS "canDelete",
      latest."id" AS "latestMessageId", latest."body" AS "latestMessage",
      latest."author_id" AS "latestAuthorId", latest."created_at" AS "lastMessageAt",
      EXISTS (
        SELECT 1 FROM "discussion_messages" m
        LEFT JOIN "discussion_reads" rd ON rd."thread_id" = t."id" AND rd."user_id" = ${context.actorRef}
        WHERE m."thread_id" = t."id" AND m."author_id" <> ${context.actorRef}
          AND (rd."last_read_at" IS NULL OR m."created_at" > rd."last_read_at")
      ) AS "unread"
    FROM "discussion_threads" t
    LEFT JOIN LATERAL (
      SELECT c0."feature_type", c0."file_id",
        ${discussionFileNameSql("c0", "t")} AS "fileName"
      FROM "discussion_contexts" c0
      WHERE c0."thread_id" = t."id" ${context.sql.replaceAll("c.", "c0.")}
      ORDER BY c0."created_at" ASC, c0."id" ASC
      LIMIT 1
    ) c ON true
    LEFT JOIN LATERAL (
      SELECT m."id", m."body", m."author_id", m."created_at"
      FROM "discussion_messages" m WHERE m."thread_id" = t."id"
      ORDER BY m."created_at" DESC, m."id" DESC LIMIT 1
    ) latest ON true
    WHERE t."project_id" = $1 AND t."team_id" = $2 ${context.filter}
    ORDER BY t."updated_at" DESC
    LIMIT 100
  `, ...values);
  const counts = await prisma!.$queryRawUnsafe<Array<{ count: number | bigint }>>(`
    SELECT COUNT(*) AS "count" FROM "discussion_threads" t
    WHERE t."project_id" = $1 AND t."team_id" = $2 ${context.filter}
      AND EXISTS (
        SELECT 1 FROM "discussion_messages" m
        LEFT JOIN "discussion_reads" rd ON rd."thread_id" = t."id" AND rd."user_id" = ${context.actorRef}
        WHERE m."thread_id" = t."id" AND m."author_id" <> ${context.actorRef}
          AND (rd."last_read_at" IS NULL OR m."created_at" > rd."last_read_at")
      )
  `, ...values);
  res.json({ threads, unreadCount: Number(counts[0]?.count || 0), ...(isProjectRoute(req) ? { scope } : {}) });
}

async function listComments(req: Request, res: Response, resource: ScopedResource, actor: DiscussionActor): Promise<void> {
  const params = contextParams(resource, req);
  if (!params) { res.status(404).json(notFound); return; }
  const anchorTypeInput = typeof req.query.anchor_type === "string" ? req.query.anchor_type : undefined;
  const anchorIdInput = typeof req.query.anchor_id === "string" ? req.query.anchor_id : undefined;
  const parsedAnchorType = anchorTypeInput ? anchorTypeSchema.safeParse(anchorTypeInput) : null;
  if ((anchorTypeInput || anchorIdInput) && (!parsedAnchorType?.success || parsedAnchorType.data === "general" || !anchorIdInput || anchorIdInput.length > 128)) {
    res.status(400).json({ error: "Invalid comment anchor" });
    return;
  }
  const rawAnchorType = parsedAnchorType?.success ? parsedAnchorType.data : undefined;
  const rawAnchorId = anchorIdInput;
  const hasAnchor = rawAnchorType && rawAnchorType !== "general" && rawAnchorId;
  const anchorFilter = hasAnchor ? `AND t."anchor_type" = $5 AND t."anchor_id" = $6` : "";
  const values = hasAnchor
    ? [resource.projectId, actor.teamId, params.featureType, params.fileId, rawAnchorType, rawAnchorId, actor.id]
    : [resource.projectId, actor.teamId, params.featureType, params.fileId, actor.id];
  const actorRef = hasAnchor ? "$7" : "$5";
  const threads = await prisma!.$queryRawUnsafe<Array<Record<string, any>>>(`
    SELECT t."id", t."feature_type" AS "featureType", t."file_id" AS "fileId",
      t."anchor_type" AS "anchorType", t."anchor_id" AS "anchorId", t."anchor_label" AS "anchorLabel",
      t."status", latest."id" AS "latestMessageId", latest."body" AS "latestMessage",
      latest."author_id" AS "latestAuthorId", latest."created_at" AS "lastMessageAt",
      recent."previewMessages",
      EXISTS (
        SELECT 1 FROM "comment_messages" m
        LEFT JOIN "comment_reads" rd ON rd."thread_id" = t."id" AND rd."user_id" = ${actorRef}
        WHERE m."thread_id" = t."id" AND m."author_id" <> ${actorRef}
          AND (rd."last_read_at" IS NULL OR m."created_at" > rd."last_read_at")
      ) AS "unread"
    FROM "comment_threads" t
    LEFT JOIN LATERAL (
      SELECT m."id", m."body", m."author_id", m."created_at"
      FROM "comment_messages" m WHERE m."thread_id" = t."id"
      ORDER BY m."created_at" DESC, m."id" DESC LIMIT 1
    ) latest ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(json_agg(json_build_object(
        'id', recent_message."id",
        'authorId', recent_message."author_id",
        'body', recent_message."body",
        'createdAt', recent_message."created_at"
      ) ORDER BY recent_message."created_at" ASC, recent_message."id" ASC), '[]'::json) AS "previewMessages"
      FROM (
        SELECT m."id", m."author_id", m."body", m."created_at"
        FROM "comment_messages" m WHERE m."thread_id" = t."id"
        ORDER BY m."created_at" DESC, m."id" DESC LIMIT 3
      ) recent_message
    ) recent ON true
    WHERE t."project_id" = $1 AND t."team_id" = $2
      AND t."feature_type" = $3 AND t."file_id" = $4 ${anchorFilter}
    ORDER BY t."updated_at" DESC
    LIMIT 100
  `, ...values);
  const counts = await prisma!.$queryRawUnsafe<Array<{ count: number | bigint }>>(`
    SELECT COUNT(*) AS "count" FROM "comment_threads" t
    WHERE t."project_id" = $1 AND t."team_id" = $2
      AND t."feature_type" = $3 AND t."file_id" = $4 ${anchorFilter}
      AND EXISTS (
        SELECT 1 FROM "comment_messages" m
        LEFT JOIN "comment_reads" rd ON rd."thread_id" = t."id" AND rd."user_id" = ${actorRef}
        WHERE m."thread_id" = t."id" AND m."author_id" <> ${actorRef}
          AND (rd."last_read_at" IS NULL OR m."created_at" > rd."last_read_at")
      )
  `, ...values);
  res.json({ threads, unreadCount: Number(counts[0]?.count || 0) });
}

router.get("/markers", async (req, res) => {
  try {
    const actor = actorFor(req);
    if (!actor || !prisma || resourceKind(req) !== "comment") { res.status(404).json(notFound); return; }
    const resource = await scopedResource(req, actor);
    const file = resource && contextParams(resource, req);
    if (!resource || !file || file.featureType !== "diagram") { res.status(404).json(notFound); return; }
    const scope = [resource.projectId, actor.teamId, file.featureType, file.fileId];
    const markers = await prisma.$queryRawUnsafe<Array<Record<string, any>>>(`
      SELECT t."anchor_type" AS "anchorType", t."anchor_id" AS "anchorId",
        (SELECT latest."status" FROM "comment_threads" latest
          WHERE latest."project_id" = $1 AND latest."team_id" = $2
            AND latest."feature_type" = $3 AND latest."file_id" = $4
            AND latest."anchor_type" = t."anchor_type" AND latest."anchor_id" = t."anchor_id"
          ORDER BY latest."updated_at" DESC, latest."id" DESC LIMIT 1) AS "status",
        COUNT(m."id") AS "messageCount",
        SUM(CASE WHEN m."author_id" <> $5 AND (rd."last_read_at" IS NULL OR m."created_at" > rd."last_read_at") THEN 1 ELSE 0 END) AS "unreadCount"
      FROM "comment_threads" t
      JOIN "comment_messages" m ON m."thread_id" = t."id"
      LEFT JOIN "comment_reads" rd ON rd."thread_id" = t."id" AND rd."user_id" = $5
      WHERE t."project_id" = $1 AND t."team_id" = $2 AND t."feature_type" = $3 AND t."file_id" = $4
      GROUP BY t."anchor_type", t."anchor_id"
    `, ...scope, actor.id);
    const rootMessages = await prisma.$queryRawUnsafe<Array<Record<string, any>>>(`
      SELECT "anchorType", "anchorId", "authorId", "authorName", "body", "createdAt" FROM (
        SELECT t."anchor_type" AS "anchorType", t."anchor_id" AS "anchorId",
          m."author_id" AS "authorId", COALESCE(NULLIF(m."author_name", ''), 'Team member') AS "authorName", m."body", m."created_at" AS "createdAt",
          ROW_NUMBER() OVER (PARTITION BY t."anchor_type", t."anchor_id" ORDER BY m."created_at" ASC, m."id" ASC) AS "rank"
        FROM "comment_threads" t JOIN "comment_messages" m ON m."thread_id" = t."id"
        WHERE t."project_id" = $1 AND t."team_id" = $2 AND t."feature_type" = $3 AND t."file_id" = $4
      ) roots WHERE "rank" = 1
      ORDER BY "anchorType", "anchorId"
    `, ...scope);
    const rootsByAnchor = new Map(rootMessages.map((message) => [`${message.anchorType}:${message.anchorId}`, message]));
    res.json({ markers: markers.map(marker => ({
      ...marker,
      messageCount: Number(marker.messageCount), unreadCount: Number(marker.unreadCount),
      replyCount: Math.max(Number(marker.messageCount) - 1, 0),
      rootMessage: rootsByAnchor.get(`${marker.anchorType}:${marker.anchorId}`) || null,
    })) });
  } catch (error) {
    handleError(res, error, "Failed to load comment markers");
  }
});

router.get("/anchor", async (req, res) => {
  try {
    const actor = actorFor(req);
    if (!actor || !prisma || resourceKind(req) !== "comment") { res.status(404).json(notFound); return; }
    const paging = historyCursor(req);
    if (!paging.valid) { res.status(400).json({ error: "Invalid message cursor" }); return; }
    const featureType = featureTypeSchema.safeParse(req.query.feature_type).data;
    const fileId = typeof req.query.file_id === "string" ? req.query.file_id : "";
    const anchorTypeResult = erdCommentAnchorTypeSchema.safeParse(req.query.anchor_type);
    const anchorType = anchorTypeResult.success ? anchorTypeResult.data : undefined;
    const anchorId = typeof req.query.anchor_id === "string" ? req.query.anchor_id : "";
    if (!anchorType || !anchorId || anchorId.length > 128) {
      res.status(400).json({ error: "Invalid comment anchor" });
      return;
    }
    const resource = await scopedResource(req, actor);
    if (!resource || !featureType || !fileId || !contextParams(resource, req)) {
      res.status(404).json(notFound);
      return;
    }
    const scopedFile = contextParams(resource, req)!;
    if (scopedFile.featureType !== featureType) {
      res.status(404).json(notFound);
      return;
    }
    const scopedFileId = scopedFile.fileId;
    const threads = await prisma.$queryRawUnsafe<Array<Record<string, any>>>(`
      SELECT t."id", t."feature_type" AS "featureType", t."file_id" AS "fileId",
        t."anchor_type" AS "anchorType", t."anchor_id" AS "anchorId", t."anchor_label" AS "anchorLabel",
        t."status", t."created_by" AS "createdBy", t."updated_at" AS "lastMessageAt"
      FROM "comment_threads" t
      WHERE t."project_id" = $1 AND t."team_id" = $2
        AND t."feature_type" = $3 AND t."file_id" = $4
        AND t."anchor_type" = $5 AND t."anchor_id" = $6
      ORDER BY t."updated_at" DESC, t."id" DESC
    `, resource.projectId, actor.teamId, featureType, scopedFileId, anchorType, anchorId);
    const cursorClause = paging.cursor
      ? `AND (m."created_at" < $7 OR (m."created_at" = $7 AND m."id" < $8))`
      : "";
    const messageValues: unknown[] = [resource.projectId, actor.teamId, featureType, scopedFileId, anchorType, anchorId];
    if (paging.cursor) messageValues.push(paging.cursor.createdAt, paging.cursor.id);
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, any> & { id: string; createdAt: Date | string }>>(`
      SELECT m."id", m."thread_id" AS "threadId", m."author_id" AS "authorId",
        COALESCE(NULLIF(m."author_name", ''), u."name", u."email", 'Team member') AS "authorName",
        m."body", m."created_at" AS "createdAt"
      FROM "comment_messages" m
      JOIN "comment_threads" t ON t."id" = m."thread_id"
      LEFT JOIN "users" u ON u."id" = m."author_id"
      WHERE t."project_id" = $1 AND t."team_id" = $2
        AND t."feature_type" = $3 AND t."file_id" = $4
        AND t."anchor_type" = $5 AND t."anchor_id" = $6 ${cursorClause}
      ORDER BY m."created_at" DESC, m."id" DESC
      LIMIT ${HISTORY_PAGE_SIZE + 1}
    `, ...messageValues);
    const history = pageHistory(rows);
    const context = {
      featureType,
      fileId: resource.currentFile?.uid || scopedFileId,
      anchorType,
      anchorId,
      anchorLabel: threads[0]?.anchorLabel || anchorLabel(anchorType),
    };
    res.json({ threads, ...history, contexts: [context] });
  } catch (error) {
    handleError(res, error, "Failed to load anchor comments");
  }
});

router.get("/", async (req, res) => {
  try {
    const actor = actorFor(req);
    if (!actor || !prisma) { res.status(404).json(notFound); return; }
    const resource = await scopedResource(req, actor);
    if (!resource) { res.status(404).json(notFound); return; }
    if (resourceKind(req) === "comment") await listComments(req, res, resource, actor);
    else await listDiscussions(req, res, resource, actor);
  } catch (error) {
    handleError(res, error, "Failed to load collaboration threads");
  }
});

router.post("/", async (req, res) => {
  try {
    const actor = actorFor(req);
    const input = createThreadSchema.safeParse(req.body);
    if (!input.success) { res.status(400).json({ error: "Invalid collaboration thread" }); return; }
    if (!actor || !prisma) { res.status(404).json(notFound); return; }
    const kind = resourceKind(req);
    const resource = await scopedResource(req, actor);
    if (!resource) { res.status(404).json(notFound); return; }
    const context = await contextForRequest(req, resource, input.data, kind);
    if (!context) { res.status(404).json(notFound); return; }
    const name = await actorName(actor.id, String((req as any).user?.email || ""));
    const threadId = randomUUID();
    const messageId = randomUUID();
    const readTable = tables[kind].reads;
    const messageTable = tables[kind].messages;
    const created = await prisma.$transaction(async (tx) => {
      let activeThreadId: string = threadId;
      if (kind === "discussion") {
        await tx.$executeRawUnsafe(`
          INSERT INTO "discussion_threads" ("id", "project_id", "team_id", "status", "created_by")
          VALUES ($1, $2, $3, 'open', $4)
        `, threadId, resource.projectId, actor.teamId, actor.id);
        if (context.file) {
          await tx.$executeRawUnsafe(`
            INSERT INTO "discussion_contexts" ("id", "thread_id", "feature_type", "file_id")
            VALUES ($1, $2, $3, $4)
          `, randomUUID(), threadId, context.file.featureType, String(context.file.id));
        }
      } else {
        const fileTable = featureTables[context.file!.featureType].table;
        // ponytail: file-level locking keeps the write portable across SQLite and Postgres; use per-anchor locks only if contention is measured.
        const locked = await tx.$executeRawUnsafe(`
          UPDATE "${fileTable}" SET "updated_at" = "updated_at"
          WHERE "id" = $1 AND "project_id" = $2
        `, context.file!.id, resource.projectId);
        if (!Number(locked)) return null;
        const existing = await tx.$queryRawUnsafe<Array<{ id: string; status: string }>>(`
          SELECT "id", "status" FROM "comment_threads"
          WHERE "project_id" = $1 AND "team_id" = $2 AND "feature_type" = $3
            AND "file_id" = $4 AND "anchor_type" = $5 AND "anchor_id" = $6
          ORDER BY "updated_at" DESC, "id" DESC LIMIT 1
        `, resource.projectId, actor.teamId, context.file!.featureType, String(context.file!.id), context.type, context.id);
        if (existing[0]?.status === "resolved") return null;
        if (existing[0]) {
          const claimed = await tx.$executeRawUnsafe(`
            UPDATE "comment_threads" SET "updated_at" = CURRENT_TIMESTAMP
            WHERE "id" = $1 AND "project_id" = $2 AND "team_id" = $3 AND "status" = 'open'
          `, existing[0].id, resource.projectId, actor.teamId);
          if (!Number(claimed)) return null;
          activeThreadId = existing[0].id;
        } else {
          await tx.$executeRawUnsafe(`
            INSERT INTO "comment_threads" ("id", "project_id", "team_id", "feature_type", "file_id", "anchor_type", "anchor_id", "anchor_label", "status", "created_by")
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9)
          `, threadId, resource.projectId, actor.teamId, context.file!.featureType, String(context.file!.id), context.type, context.id, context.label, actor.id);
        }
      }
      await tx.$executeRawUnsafe(`
        INSERT INTO "${messageTable}" ("id", "thread_id", "author_id", "author_name", "body")
        VALUES ($1, $2, $3, $4, $5)
      `, messageId, activeThreadId, actor.id, name, input.data.body);
      await tx.$executeRawUnsafe(`
        INSERT INTO "${readTable}" ("thread_id", "user_id", "last_read_at")
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT ("thread_id", "user_id") DO UPDATE SET "last_read_at" = CURRENT_TIMESTAMP
      `, activeThreadId, actor.id);
      return activeThreadId;
    });
    if (created === null) { res.status(409).json({ error: "Reopen this thread before commenting" }); return; }
    if (!created) { res.status(404).json(notFound); return; }
    notifyTeam(actor.teamId);
    res.status(201).json({ id: created, messageId, kind, fileId: context.file ? String(context.file.id) : null });
  } catch (error) {
    handleError(res, error, "Failed to create collaboration thread");
  }
});

router.get("/:threadId", async (req, res) => {
  try {
    const actor = actorFor(req);
    if (!actor || !prisma) { res.status(404).json(notFound); return; }
    const paging = historyCursor(req);
    if (!paging.valid) { res.status(400).json({ error: "Invalid message cursor" }); return; }
    const kind = resourceKind(req);
    const resource = await scopedResource(req, actor);
    if (!resource || !(await threadInScope(req, resource, actor, req.params.threadId, kind))) { res.status(404).json(notFound); return; }
    const messageTable = tables[kind].messages;
    const cursorClause = paging.cursor
      ? `AND (m."created_at" < $2 OR (m."created_at" = $2 AND m."id" < $3))`
      : "";
    const values: unknown[] = [req.params.threadId];
    if (paging.cursor) values.push(paging.cursor.createdAt, paging.cursor.id);
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, any> & { id: string; createdAt: Date | string }>>(`
      SELECT m."id", m."author_id" AS "authorId",
        COALESCE(NULLIF(m."author_name", ''), u."name", u."email", 'Team member') AS "authorName",
        m."body", m."created_at" AS "createdAt"
      FROM "${messageTable}" m
      LEFT JOIN "users" u ON u."id" = m."author_id"
      WHERE m."thread_id" = $1 ${cursorClause}
      ORDER BY m."created_at" DESC, m."id" DESC
      LIMIT ${HISTORY_PAGE_SIZE + 1}
    `, ...values);
    const history = pageHistory(rows);
    const contexts = kind === "discussion"
      ? await prisma.$queryRawUnsafe<Array<Record<string, any>>>(`
        SELECT c."feature_type" AS "featureType", c."file_id" AS "fileId",
          ${discussionFileNameSql("c", "t")} AS "fileName"
        FROM "discussion_contexts" c
        JOIN "discussion_threads" t ON t."id" = c."thread_id"
        WHERE c."thread_id" = $1 ORDER BY c."created_at" ASC, c."id" ASC
      `, req.params.threadId)
      : await prisma.$queryRawUnsafe<Array<Record<string, any>>>(`
        SELECT "feature_type" AS "featureType", "file_id" AS "fileId", "anchor_type" AS "anchorType", "anchor_id" AS "anchorId", "anchor_label" AS "anchorLabel"
        FROM "comment_threads" WHERE "id" = $1 LIMIT 1
      `, req.params.threadId);
    res.json({ ...history, contexts });
  } catch (error) {
    handleError(res, error, "Failed to load collaboration thread");
  }
});

router.post("/:threadId/read", async (req, res) => {
  try {
    const actor = actorFor(req);
    if (!actor || !prisma) { res.status(404).json(notFound); return; }
    const resource = await scopedResource(req, actor);
    const kind = resourceKind(req);
    if (!resource || !(await threadInScope(req, resource, actor, req.params.threadId, kind))) { res.status(404).json(notFound); return; }
    await prisma.$executeRawUnsafe(`
      INSERT INTO "${tables[kind].reads}" ("thread_id", "user_id", "last_read_at")
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT ("thread_id", "user_id") DO UPDATE SET "last_read_at" = CURRENT_TIMESTAMP
    `, req.params.threadId, actor.id);
    res.json({ success: true });
  } catch (error) {
    handleError(res, error, "Failed to mark collaboration thread as read");
  }
});

router.post("/:threadId/messages", async (req, res) => {
  try {
    const actor = actorFor(req);
    const input = messageSchema.safeParse(req.body);
    if (!input.success) { res.status(400).json({ error: "Invalid message" }); return; }
    if (!actor || !prisma) { res.status(404).json(notFound); return; }
    const resource = await scopedResource(req, actor);
    const kind = resourceKind(req);
    if (!resource) { res.status(404).json(notFound); return; }
    if (kind === "comment" && !contextParams(resource, req)) { res.status(404).json(notFound); return; }
    const name = await actorName(actor.id, String((req as any).user?.email || ""));
    const messageId = randomUUID();
    const result = await prisma.$transaction(async (tx) => {
      const table = tables[kind];
      const fileParams = contextParams(resource, req);
      const contextClause = kind === "discussion" && fileParams && !isProjectRoute(req)
        ? `AND EXISTS (SELECT 1 FROM "discussion_contexts" c WHERE c."thread_id" = t."id" AND c."feature_type" = $4 AND c."file_id" = $5)`
        : kind === "comment" && fileParams
          ? `AND t."feature_type" = $4 AND t."file_id" = $5`
          : "";
      const values = fileParams && (kind === "comment" || !isProjectRoute(req))
        ? [req.params.threadId, resource.projectId, actor.teamId, fileParams.featureType, fileParams.fileId]
        : [req.params.threadId, resource.projectId, actor.teamId];
      const rows = await tx.$queryRawUnsafe<Array<{ status: string }>>(`
        SELECT t."status" FROM "${table.threads}" t
        WHERE t."id" = $1 AND t."project_id" = $2 AND t."team_id" = $3 ${contextClause}
        LIMIT 1
      `, ...values);
      if (!rows[0]) return "missing";
      if (rows[0].status !== "open") return "resolved";
      const claimed = await tx.$executeRawUnsafe(`
        UPDATE "${table.threads}" SET "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = $1 AND "project_id" = $2 AND "team_id" = $3 AND "status" = 'open'
      `, req.params.threadId, resource.projectId, actor.teamId);
      if (!Number(claimed)) return "resolved";
      await tx.$executeRawUnsafe(`
        INSERT INTO "${table.messages}" ("id", "thread_id", "author_id", "author_name", "body")
        VALUES ($1, $2, $3, $4, $5)
      `, messageId, req.params.threadId, actor.id, name, input.data.body);
      await tx.$executeRawUnsafe(`
        INSERT INTO "${table.reads}" ("thread_id", "user_id", "last_read_at")
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT ("thread_id", "user_id") DO UPDATE SET "last_read_at" = CURRENT_TIMESTAMP
      `, req.params.threadId, actor.id);
      return "created";
    });
    if (result === "missing") { res.status(404).json(notFound); return; }
    if (result === "resolved") { res.status(409).json({ error: "Reopen this thread before replying" }); return; }
    notifyTeam(actor.teamId);
    res.status(201).json({ id: messageId });
  } catch (error) {
    handleError(res, error, "Failed to reply to collaboration thread");
  }
});

router.patch("/:threadId/messages/:messageId", async (req, res) => {
  try {
    const actor = actorFor(req);
    const input = editMessageSchema.safeParse(req.body);
    if (!input.success) { res.status(400).json({ error: "Invalid message" }); return; }
    if (!actor || !prisma) { res.status(404).json(notFound); return; }
    const resource = await scopedResource(req, actor);
    const kind = resourceKind(req);
    if (!resource) { res.status(404).json(notFound); return; }
    if (kind === "comment" && !contextParams(resource, req)) { res.status(404).json(notFound); return; }
    const table = tables[kind];
    const fileParams = contextParams(resource, req);
    const constrainToFile = fileParams && (kind === "comment" || !isProjectRoute(req));
    const fileClause = constrainToFile
      ? kind === "comment"
        ? `AND t."feature_type" = $7 AND t."file_id" = $8`
        : `AND EXISTS (SELECT 1 FROM "discussion_contexts" c WHERE c."thread_id" = t."id" AND c."feature_type" = $7 AND c."file_id" = $8)`
      : "";
    const scopeFileClause = constrainToFile
      ? kind === "comment"
        ? `AND t."feature_type" = $6 AND t."file_id" = $7`
        : `AND EXISTS (SELECT 1 FROM "discussion_contexts" c WHERE c."thread_id" = t."id" AND c."feature_type" = $6 AND c."file_id" = $7)`
      : "";
    const scopeValues = constrainToFile
      ? [req.params.messageId, req.params.threadId, actor.id, resource.projectId, actor.teamId, fileParams.featureType, fileParams.fileId]
      : [req.params.messageId, req.params.threadId, actor.id, resource.projectId, actor.teamId];
    const values = constrainToFile
      ? [req.params.messageId, req.params.threadId, actor.id, input.data.body, resource.projectId, actor.teamId, fileParams.featureType, fileParams.fileId, input.data.expectedBody]
      : [req.params.messageId, req.params.threadId, actor.id, input.data.body, resource.projectId, actor.teamId, input.data.expectedBody];
    const updated = await prisma.$transaction(async (tx) => {
      const count = await tx.$executeRawUnsafe(`
        UPDATE "${table.messages}" AS m
        SET "body" = $4
        WHERE m."id" = $1 AND m."thread_id" = $2 AND m."author_id" = $3
          AND m."body" = $${values.length}
          AND EXISTS (
            SELECT 1 FROM "${table.threads}" t
            WHERE t."id" = m."thread_id" AND t."project_id" = $5 AND t."team_id" = $6 ${fileClause}
          )
      `, ...values);
      if (Number(count) > 0) {
        await tx.$executeRawUnsafe(`UPDATE "${table.threads}" SET "updated_at" = CURRENT_TIMESTAMP WHERE "id" = $1`, req.params.threadId);
        return "updated";
      }
      const existing = await tx.$queryRawUnsafe<Array<{ id: string; body: string }>>(`
        SELECT m."id", m."body" FROM "${table.messages}" m
        WHERE m."id" = $1 AND m."thread_id" = $2 AND m."author_id" = $3
          AND EXISTS (
            SELECT 1 FROM "${table.threads}" t
            WHERE t."id" = m."thread_id" AND t."project_id" = $4 AND t."team_id" = $5 ${scopeFileClause}
          )
      `, ...scopeValues);
      return existing[0] ? "conflict" : "missing";
    });
    if (updated === "missing") { res.status(404).json(notFound); return; }
    if (updated === "conflict") { res.status(409).json({ error: "This message changed. Refresh before editing it again." }); return; }
    notifyTeam(actor.teamId);
    res.json({ id: req.params.messageId, body: input.data.body });
  } catch (error) {
    handleError(res, error, "Failed to edit collaboration message");
  }
});

router.delete("/:threadId/messages/:messageId", async (req, res) => {
  try {
    if (resourceKind(req) !== "discussion") { res.status(404).json(notFound); return; }
    const input = deleteMessageSchema.safeParse(req.body);
    if (!input.success) { res.status(400).json({ error: "Invalid message" }); return; }
    const actor = actorFor(req);
    if (!actor || !prisma) { res.status(404).json(notFound); return; }
    const resource = await scopedResource(req, actor);
    if (!resource) { res.status(404).json(notFound); return; }
    const fileParams = contextParams(resource, req);
    const constrainToFile = Boolean(fileParams && !isProjectRoute(req));
    const fileClause = constrainToFile
      ? `AND EXISTS (SELECT 1 FROM "discussion_contexts" c WHERE c."thread_id" = t."id" AND c."feature_type" = $7 AND c."file_id" = $8)`
      : "";
    const scopeFileClause = constrainToFile
      ? `AND EXISTS (SELECT 1 FROM "discussion_contexts" c WHERE c."thread_id" = t."id" AND c."feature_type" = $6 AND c."file_id" = $7)`
      : "";
    const values = constrainToFile
      ? [req.params.messageId, req.params.threadId, actor.id, input.data.expectedBody, resource.projectId, actor.teamId, fileParams!.featureType, fileParams!.fileId]
      : [req.params.messageId, req.params.threadId, actor.id, input.data.expectedBody, resource.projectId, actor.teamId];
    const scopeValues = constrainToFile
      ? [req.params.messageId, req.params.threadId, actor.id, resource.projectId, actor.teamId, fileParams!.featureType, fileParams!.fileId]
      : [req.params.messageId, req.params.threadId, actor.id, resource.projectId, actor.teamId];

    const deleted = await prisma.$transaction(async (tx) => {
      const count = await tx.$executeRawUnsafe(`
        DELETE FROM "discussion_messages"
        WHERE "id" = $1 AND "thread_id" = $2 AND "author_id" = $3 AND "body" = $4
          AND EXISTS (
            SELECT 1 FROM "discussion_threads" t
            WHERE t."id" = "discussion_messages"."thread_id"
              AND t."project_id" = $5 AND t."team_id" = $6 ${fileClause}
          )
      `, ...values);
      if (Number(count) > 0) {
        await tx.$executeRawUnsafe(`
          UPDATE "discussion_threads" SET "updated_at" = CURRENT_TIMESTAMP
          WHERE "id" = $1 AND "project_id" = $2 AND "team_id" = $3
        `, req.params.threadId, resource.projectId, actor.teamId);
        return "deleted";
      }
      const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(`
        SELECT m."id" FROM "discussion_messages" m
        WHERE m."id" = $1 AND m."thread_id" = $2 AND m."author_id" = $3
          AND EXISTS (
            SELECT 1 FROM "discussion_threads" t
            WHERE t."id" = m."thread_id" AND t."project_id" = $4 AND t."team_id" = $5 ${scopeFileClause}
          )
        LIMIT 1
      `, ...scopeValues);
      return existing[0] ? "conflict" : "missing";
    });

    if (deleted === "missing") { res.status(404).json(notFound); return; }
    if (deleted === "conflict") { res.status(409).json({ error: "This message changed. Refresh before deleting it again." }); return; }
    notifyTeam(actor.teamId);
    res.json({ success: true, id: req.params.messageId });
  } catch (error) {
    handleError(res, error, "Failed to delete collaboration message");
  }
});

router.patch("/:threadId", async (req, res) => {
  try {
    const actor = actorFor(req);
    const input = statusSchema.safeParse(req.body);
    if (!input.success) { res.status(400).json({ error: "Invalid thread status" }); return; }
    if (!actor || !prisma) { res.status(404).json(notFound); return; }
    const resource = await scopedResource(req, actor);
    const kind = resourceKind(req);
    const expectedStatus = input.data.expectedStatus ?? (input.data.status === "open" ? "resolved" : "open");
    if (!resource) { res.status(404).json(notFound); return; }
    if (kind === "comment" && !contextParams(resource, req)) { res.status(404).json(notFound); return; }
    const table = tables[kind];
    const fileParams = contextParams(resource, req);
    const contextClause = kind === "discussion" && fileParams && !isProjectRoute(req)
      ? `AND EXISTS (SELECT 1 FROM "discussion_contexts" c WHERE c."thread_id" = t."id" AND c."feature_type" = $4 AND c."file_id" = $5)`
      : kind === "comment" && fileParams
        ? `AND t."feature_type" = $4 AND t."file_id" = $5`
        : "";
    const values = fileParams && (kind === "comment" || !isProjectRoute(req))
      ? [req.params.threadId, resource.projectId, actor.teamId, fileParams.featureType, fileParams.fileId]
      : [req.params.threadId, resource.projectId, actor.teamId];
    const changed = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<Array<{ status: string }>>(`
        SELECT t."status" FROM "${table.threads}" t
        WHERE t."id" = $1 AND t."project_id" = $2 AND t."team_id" = $3 ${contextClause}
        LIMIT 1
      `, ...values);
      if (!rows[0]) return null;
      if (rows[0].status !== expectedStatus) return "conflict";
      const expectedStatusIndex = values.length + 1;
      const statusIndex = values.length + 2;
      const resolvedByIndex = values.length + 3;
      const count = await tx.$executeRawUnsafe(`
        UPDATE "${table.threads}" AS t
        SET "status" = $${statusIndex}, "resolved_by" = $${resolvedByIndex}, "updated_at" = CURRENT_TIMESTAMP
        WHERE t."id" = $1 AND t."project_id" = $2 AND t."team_id" = $3 ${contextClause}
          AND t."status" = $${expectedStatusIndex}
      `, ...values, expectedStatus, input.data.status, input.data.status === "resolved" ? actor.id : null);
      if (!Number(count)) return "conflict";
      return true;
    });
    if (changed === null) { res.status(404).json(notFound); return; }
    if (changed === "conflict") { res.status(409).json({ error: "Thread status changed. Refresh before trying again." }); return; }
    if (changed) notifyTeam(actor.teamId);
    res.json({ status: input.data.status });
  } catch (error) {
    handleError(res, error, "Failed to update collaboration thread");
  }
});

router.delete("/:threadId", async (req, res) => {
  try {
    const actor = actorFor(req);
    if (!actor || !prisma) { res.status(404).json(notFound); return; }
    const resource = await scopedResource(req, actor);
    const kind = resourceKind(req);
    if (!resource) { res.status(404).json(notFound); return; }
    if (kind === "comment" && !contextParams(resource, req)) { res.status(404).json(notFound); return; }
    const table = tables[kind];
    const fileParams = contextParams(resource, req);
    const constrainToFile = fileParams && (kind === "comment" || !isProjectRoute(req));
    const fileClause = constrainToFile
      ? kind === "comment"
        ? `AND "feature_type" = $5 AND "file_id" = $6`
        : `AND EXISTS (SELECT 1 FROM "discussion_contexts" c WHERE c."thread_id" = "${table.threads}"."id" AND c."feature_type" = $5 AND c."file_id" = $6)`
      : "";
    const values = constrainToFile
      ? [req.params.threadId, resource.projectId, actor.teamId, actor.id, fileParams.featureType, fileParams.fileId]
      : [req.params.threadId, resource.projectId, actor.teamId, actor.id];
    const deleted = await prisma.$executeRawUnsafe(`
      DELETE FROM "${table.threads}"
      WHERE "id" = $1 AND "project_id" = $2 AND "team_id" = $3 AND "created_by" = $4 ${fileClause}
    `, ...values);
    if (!Number(deleted)) { res.status(404).json(notFound); return; }
    notifyTeam(actor.teamId);
    res.json({ success: true });
  } catch (error) {
    handleError(res, error, "Failed to delete collaboration thread");
  }
});

router.post("/:threadId/contexts", async (req, res) => {
  try {
    const actor = actorFor(req);
    const input = createThreadSchema.safeParse({ body: "context", context: req.body?.context });
    if (!input.success || resourceKind(req) !== "discussion" || !isProjectRoute(req)) { res.status(400).json({ error: "Invalid discussion context" }); return; }
    if (!actor || !prisma) { res.status(404).json(notFound); return; }
    const resource = await scopedResource(req, actor);
    if (!resource || !(await threadInScope(req, resource, actor, req.params.threadId, "discussion"))) { res.status(404).json(notFound); return; }
    const context = await contextForRequest(req, resource, input.data, "discussion");
    if (!context?.file) { res.status(404).json(notFound); return; }
    const found = await prisma.$transaction(async (tx) => {
      // ponytail: the thread row is the portable lock for context deduplication across SQLite and Postgres.
      const locked = await tx.$executeRawUnsafe(`
        UPDATE "discussion_threads" SET "updated_at" = "updated_at"
        WHERE "id" = $1 AND "project_id" = $2 AND "team_id" = $3 AND "status" = 'open'
      `, req.params.threadId, resource.projectId, actor.teamId);
      if (!Number(locked)) return false;
      await tx.$executeRawUnsafe(`
        INSERT INTO "discussion_contexts" ("id", "thread_id", "feature_type", "file_id")
        SELECT $1, $2, $3, $4
        WHERE NOT EXISTS (
          SELECT 1 FROM "discussion_contexts" WHERE "thread_id" = $2 AND "feature_type" = $3 AND "file_id" = $4
        )
      `, randomUUID(), req.params.threadId, context.file.featureType, String(context.file.id));
      return true;
    });
    if (!found) { res.status(409).json({ error: "Reopen this thread before adding context" }); return; }
    notifyTeam(actor.teamId);
    res.status(201).json({ success: true });
  } catch (error) {
    handleError(res, error, "Failed to add discussion context");
  }
});

export default router;
