import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { publishCloudWorkspaceSync } from "../../lib/cloud-live-sync.js";
import { isSsoAuthMode } from "../../lib/config.js";
import { prisma } from "../../lib/prisma.js";
import { currentTeamScope } from "../../lib/team-scope.js";
import { handleError } from "../../lib/utils.js";

const router = Router({ mergeParams: true });
const notFound = { error: "Resource not found" };
const MAX_BODY_LENGTH = 4000;

const createThreadSchema = z.object({
  body: z.string().trim().min(1).max(MAX_BODY_LENGTH),
  anchorType: z.enum(["general", "table", "relationship"]),
  anchorId: z.string().trim().min(1).max(128).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.anchorType !== "general" && !value.anchorId) {
    ctx.addIssue({ code: "custom", message: "Choose an ERD anchor", path: ["anchorId"] });
  }
  if (value.anchorType === "general" && value.anchorId) {
    ctx.addIssue({ code: "custom", message: "General discussions do not have an anchor", path: ["anchorId"] });
  }
});

const messageSchema = z.object({ body: z.string().trim().min(1).max(MAX_BODY_LENGTH) }).strict();
const statusSchema = z.object({ status: z.enum(["open", "resolved"]) }).strict();

type ScopedDiagram = { id: number; projectId: number | bigint | null };
type DiscussionActor = { id: string; teamId: string };

function diagramUid(req: Request): string {
  return (req.params as { uid: string }).uid;
}

export function requireCloudDiscussionTeam(_req: Request, res: Response, next: NextFunction): void {
  const scope = currentTeamScope();
  if (!isSsoAuthMode() || scope?.mode !== "team" || !scope.teamId) {
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

async function scopedDiagramContext(uid: string, teamId: string): Promise<ScopedDiagram | null> {
  if (!prisma) return null;
  const rows = await prisma.$queryRawUnsafe<ScopedDiagram[]>(`
    SELECT d."id", p."id" AS "projectId"
    FROM "diagrams" d
    JOIN "projects" p ON p."id" = d."project_id"
    WHERE (d."uid" = $1 OR CAST(d."id" AS TEXT) = $1)
      AND p."team_id" = $2
      AND COALESCE(d."is_deleted", false) = false
      AND COALESCE(p."is_deleted", false) = false
      AND COALESCE(d."source_type", 'blank') <> 'production_db'
    LIMIT 1
  `, uid, teamId);
  return rows[0] ?? null;
}

async function scopedThreadExists(threadId: string, projectId: number | bigint, diagramId: number, teamId: string): Promise<boolean> {
  if (!prisma) return false;
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`
    SELECT t."id"
    FROM "discussion_threads" t
    JOIN "discussion_contexts" c ON c."thread_id" = t."id"
    WHERE t."id" = $1 AND t."project_id" = $2 AND t."team_id" = $3
      AND c."feature_type" = 'diagram' AND c."file_id" = $4
    LIMIT 1
  `, threadId, projectId, teamId, String(diagramId));
  return rows.length > 0;
}

async function actorName(userId: string, fallback: string): Promise<string> {
  if (!prisma) return fallback || "Team member";
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string | null; email: string | null }>>(
    'SELECT "name", "email" FROM "users" WHERE "id" = $1 LIMIT 1', userId,
  );
  return rows[0]?.name?.trim() || rows[0]?.email || fallback || "Team member";
}

function notifyTeam(teamId: string): void {
  void publishCloudWorkspaceSync({
    teamId,
    eventType: "cloud.workspace.sync",
    revision: randomUUID(),
  });
}

router.get("/", async (req, res) => {
  try {
    const actor = actorFor(req);
    if (!actor) { res.status(404).json(notFound); return; }
    const diagram = await scopedDiagramContext(diagramUid(req), actor.teamId);
    if (!diagram || diagram.projectId === null || !prisma) { res.status(404).json(notFound); return; }

    const threads = await prisma.$queryRawUnsafe<Array<Record<string, any>>>(`
      SELECT t."id", c."anchor_type" AS "anchorType", c."anchor_id" AS "anchorId",
        c."anchor_label" AS "anchorLabel", t."status", t."created_by" AS "createdBy",
        t."created_at" AS "createdAt", t."updated_at" AS "updatedAt",
        latest."id" AS "latestMessageId", latest."body" AS "latestMessage",
        latest."author_id" AS "latestAuthorId", latest."created_at" AS "lastMessageAt",
        EXISTS (
          SELECT 1 FROM "discussion_messages" m
          LEFT JOIN "discussion_reads" rd
            ON rd."thread_id" = t."id" AND rd."user_id" = $4
          WHERE m."thread_id" = t."id" AND m."author_id" <> $4
            AND (rd."last_read_at" IS NULL OR m."created_at" > rd."last_read_at")
        ) AS "unread"
      FROM "discussion_threads" t
      JOIN "discussion_contexts" c
        ON c."thread_id" = t."id" AND c."feature_type" = 'diagram' AND c."file_id" = $1
      LEFT JOIN LATERAL (
        SELECT m."id", m."body", m."author_id", m."created_at"
        FROM "discussion_messages" m
        WHERE m."thread_id" = t."id"
        ORDER BY m."created_at" DESC, m."id" DESC
        LIMIT 1
      ) latest ON true
      WHERE t."project_id" = $2 AND t."team_id" = $3
      ORDER BY t."updated_at" DESC
      LIMIT 100
    `, String(diagram.id), diagram.projectId, actor.teamId, actor.id);
    const counts = await prisma.$queryRawUnsafe<Array<{ count: number | bigint }>>(`
      SELECT COUNT(*) AS "count"
      FROM "discussion_threads" t
      JOIN "discussion_contexts" c
        ON c."thread_id" = t."id" AND c."feature_type" = 'diagram' AND c."file_id" = $1
      WHERE t."project_id" = $2 AND t."team_id" = $3
        AND EXISTS (
          SELECT 1 FROM "discussion_messages" m
          LEFT JOIN "discussion_reads" rd
            ON rd."thread_id" = t."id" AND rd."user_id" = $4
          WHERE m."thread_id" = t."id" AND m."author_id" <> $4
            AND (rd."last_read_at" IS NULL OR m."created_at" > rd."last_read_at")
        )
    `, String(diagram.id), diagram.projectId, actor.teamId, actor.id);
    res.json({ threads, unreadCount: Number(counts[0]?.count || 0) });
  } catch (error) {
    handleError(res, error, "Failed to load discussions");
  }
});

router.post("/", async (req, res) => {
  try {
    const actor = actorFor(req);
    const input = createThreadSchema.safeParse(req.body);
    if (!input.success) { res.status(400).json({ error: "Invalid discussion" }); return; }
    if (!actor) { res.status(404).json(notFound); return; }
    const diagram = await scopedDiagramContext(diagramUid(req), actor.teamId);
    if (!diagram || diagram.projectId === null || !prisma) { res.status(404).json(notFound); return; }
    const diagramId = diagram.id;

    const fallbackName = String((req as any).user?.email || "");
    const name = await actorName(actor.id, fallbackName);
    const threadId = randomUUID();
    const messageId = randomUUID();
    const contextId = randomUUID();
    const created = await prisma.$transaction(async (tx) => {
      let anchorLabel = "General";
      if (input.data.anchorType === "table") {
        const rows = await tx.$queryRawUnsafe<Array<{ label: string }>>(
          'SELECT "name" AS "label" FROM "entities" WHERE "id" = $1 AND "diagram_id" = $2 LIMIT 1',
          input.data.anchorId, diagramId,
        );
        if (!rows[0]) return false;
        anchorLabel = rows[0].label;
      } else if (input.data.anchorType === "relationship") {
        const rows = await tx.$queryRawUnsafe<Array<{ label: string }>>(`
          SELECT COALESCE(NULLIF(r."label", ''),
            NULLIF(concat_ws(' → ', source."name", target."name"), ''), 'Relationship') AS "label"
          FROM "relationships" r
          LEFT JOIN "entities" source ON source."id" = r."source_entity_id"
          LEFT JOIN "entities" target ON target."id" = r."target_entity_id"
          WHERE r."id" = $1 AND r."diagram_id" = $2
          LIMIT 1
        `, input.data.anchorId, diagramId);
        if (!rows[0]) return false;
        anchorLabel = rows[0].label;
      }

      await tx.$executeRawUnsafe(`
        INSERT INTO "discussion_threads"
          ("id", "project_id", "team_id", "status", "created_by")
        VALUES ($1, $2, $3, 'open', $4)
      `, threadId, diagram.projectId, actor.teamId, actor.id);
      await tx.$executeRawUnsafe(`
        INSERT INTO "discussion_contexts"
          ("id", "thread_id", "feature_type", "file_id", "anchor_type", "anchor_id", "anchor_label")
        VALUES ($1, $2, 'diagram', $3, $4, $5, $6)
      `, contextId, threadId, String(diagramId), input.data.anchorType, input.data.anchorId ?? null, anchorLabel);
      await tx.$executeRawUnsafe(`
        INSERT INTO "discussion_messages" ("id", "thread_id", "author_id", "author_name", "body")
        VALUES ($1, $2, $3, $4, $5)
      `, messageId, threadId, actor.id, name, input.data.body);
      await tx.$executeRawUnsafe(`
        INSERT INTO "discussion_reads" ("thread_id", "user_id", "last_read_at")
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT ("thread_id", "user_id") DO UPDATE SET "last_read_at" = CURRENT_TIMESTAMP
      `, threadId, actor.id);
      return true;
    });

    if (!created) { res.status(404).json(notFound); return; }
    notifyTeam(actor.teamId);
    res.status(201).json({ id: threadId, messageId });
  } catch (error) {
    handleError(res, error, "Failed to create discussion");
  }
});

router.get("/:threadId", async (req, res) => {
  try {
    const actor = actorFor(req);
    if (!actor) { res.status(404).json(notFound); return; }
    const diagram = await scopedDiagramContext(diagramUid(req), actor.teamId);
    if (!diagram || diagram.projectId === null || !prisma || !(await scopedThreadExists(req.params.threadId, diagram.projectId, diagram.id, actor.teamId))) {
      res.status(404).json(notFound);
      return;
    }
    const messages = await prisma.$queryRawUnsafe<Array<Record<string, any>>>(`
      SELECT m."id", m."author_id" AS "authorId",
        COALESCE(NULLIF(m."author_name", ''), u."name", u."email", 'Team member') AS "authorName",
        m."body", m."created_at" AS "createdAt"
      FROM "discussion_messages" m
      LEFT JOIN "users" u ON u."id" = m."author_id"
      WHERE m."thread_id" = $1
      ORDER BY m."created_at" DESC, m."id" DESC
      LIMIT 500
    `, req.params.threadId);
    res.json({ messages: messages.reverse() });
  } catch (error) {
    handleError(res, error, "Failed to load discussion");
  }
});

router.post("/:threadId/read", async (req, res) => {
  try {
    const actor = actorFor(req);
    if (!actor) { res.status(404).json(notFound); return; }
    const diagram = await scopedDiagramContext(diagramUid(req), actor.teamId);
    if (!diagram || diagram.projectId === null || !prisma || !(await scopedThreadExists(req.params.threadId, diagram.projectId, diagram.id, actor.teamId))) {
      res.status(404).json(notFound);
      return;
    }
    await prisma.$executeRawUnsafe(`
      INSERT INTO "discussion_reads" ("thread_id", "user_id", "last_read_at")
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT ("thread_id", "user_id") DO UPDATE SET "last_read_at" = CURRENT_TIMESTAMP
    `, req.params.threadId, actor.id);
    res.json({ success: true });
  } catch (error) {
    handleError(res, error, "Failed to mark discussion as read");
  }
});

router.post("/:threadId/messages", async (req, res) => {
  try {
    const actor = actorFor(req);
    const input = messageSchema.safeParse(req.body);
    if (!input.success) { res.status(400).json({ error: "Invalid message" }); return; }
    if (!actor) { res.status(404).json(notFound); return; }
    const diagram = await scopedDiagramContext(diagramUid(req), actor.teamId);
    if (!diagram || diagram.projectId === null || !prisma) { res.status(404).json(notFound); return; }
    const name = await actorName(actor.id, String((req as any).user?.email || ""));
    const messageId = randomUUID();
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<Array<{ status: string }>>(`
        SELECT t."status"
        FROM "discussion_threads" t
        JOIN "discussion_contexts" c ON c."thread_id" = t."id"
        WHERE t."id" = $1 AND t."project_id" = $2 AND t."team_id" = $3
          AND c."feature_type" = 'diagram' AND c."file_id" = $4
        LIMIT 1
      `, req.params.threadId, diagram.projectId, actor.teamId, String(diagram.id));
      if (!rows[0]) return "missing";
      if (rows[0].status !== "open") return "resolved";
      await tx.$executeRawUnsafe(`
        INSERT INTO "discussion_messages" ("id", "thread_id", "author_id", "author_name", "body")
        VALUES ($1, $2, $3, $4, $5)
      `, messageId, req.params.threadId, actor.id, name, input.data.body);
      await tx.$executeRawUnsafe(
        'UPDATE "discussion_threads" SET "updated_at" = CURRENT_TIMESTAMP WHERE "id" = $1',
        req.params.threadId,
      );
      await tx.$executeRawUnsafe(`
        INSERT INTO "discussion_reads" ("thread_id", "user_id", "last_read_at")
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT ("thread_id", "user_id") DO UPDATE SET "last_read_at" = CURRENT_TIMESTAMP
      `, req.params.threadId, actor.id);
      return "created";
    });

    if (result === "missing") { res.status(404).json(notFound); return; }
    if (result === "resolved") { res.status(409).json({ error: "Reopen this discussion before replying" }); return; }
    notifyTeam(actor.teamId);
    res.status(201).json({ id: messageId });
  } catch (error) {
    handleError(res, error, "Failed to reply to discussion");
  }
});

router.patch("/:threadId", async (req, res) => {
  try {
    const actor = actorFor(req);
    const input = statusSchema.safeParse(req.body);
    if (!input.success) { res.status(400).json({ error: "Invalid discussion status" }); return; }
    if (!actor) { res.status(404).json(notFound); return; }
    const diagram = await scopedDiagramContext(diagramUid(req), actor.teamId);
    if (!diagram || diagram.projectId === null || !prisma) { res.status(404).json(notFound); return; }
    const changed = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<Array<{ status: string }>>(`
        SELECT t."status"
        FROM "discussion_threads" t
        JOIN "discussion_contexts" c ON c."thread_id" = t."id"
        WHERE t."id" = $1 AND t."project_id" = $2 AND t."team_id" = $3
          AND c."feature_type" = 'diagram' AND c."file_id" = $4
        LIMIT 1
      `, req.params.threadId, diagram.projectId, actor.teamId, String(diagram.id));
      if (!rows[0]) return null;
      if (rows[0].status === input.data.status) return false;
      await tx.$executeRawUnsafe(`
        UPDATE "discussion_threads"
        SET "status" = $4, "resolved_by" = $5, "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = $1 AND "project_id" = $2 AND "team_id" = $3
          AND EXISTS (
            SELECT 1 FROM "discussion_contexts" c
            WHERE c."thread_id" = "discussion_threads"."id"
              AND c."feature_type" = 'diagram' AND c."file_id" = $6
          )
      `, req.params.threadId, diagram.projectId, actor.teamId, input.data.status,
      input.data.status === "resolved" ? actor.id : null, String(diagram.id));
      return true;
    });

    if (changed === null) { res.status(404).json(notFound); return; }
    if (changed) notifyTeam(actor.teamId);
    res.json({ status: input.data.status });
  } catch (error) {
    handleError(res, error, "Failed to update discussion");
  }
});

export default router;
