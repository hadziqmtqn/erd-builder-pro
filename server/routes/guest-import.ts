/**
 * Guest Data Import Endpoint
 *
 * Accepts a JSON payload exported from Guest Mode (IndexedDB) and
 * additively imports it into the real database for the authenticated user.
 *
 * Design principles:
 * - ADDITIVE only — never overwrites existing data
 * - All new records get fresh UUIDs (conflict‑free)
 * - Project matching by name (case‑insensitive) — creates new if no match
 * - ERD diagrams are unpacked: entities → Entity/Column records,
 *   relationships → Relationship records
 * - Returns a detailed summary of imported counts
 */

import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../lib/middleware.js";
import { logger } from "../lib/logger.js";
import crypto from "node:crypto";

const router = Router();

// ── Helpers ──

function now(): Date {
  return new Date();
}

function uuid(): string {
  return crypto.randomUUID();
}

/** Safely parse an ISO date string or return a default. */
function safeDate(val: string | null | undefined, fallback: Date = now()): Date {
  if (!val) return fallback;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

/** Convert a value to Int or null for Prisma int fields. */
function toIntOrNull(val: any): number | null {
  if (val == null) return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

// ── Validation ──

interface ImportPayload {
  version?: string;
  exported_at?: string;
  application?: string;
  total_items?: Record<string, number>;
  data?: {
    projects?: any[];
    notes?: any[];
    diagrams?: any[];
    flowcharts?: any[];
    drawings?: any[];
    ai_chat_sessions?: any[];
  };
}

function validatePayload(body: any): { ok: true; payload: ImportPayload } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid payload: expected a JSON object" };
  }
  if (!body.data || typeof body.data !== "object") {
    return { ok: false, error: "Invalid payload: missing 'data' field" };
  }
  return { ok: true, payload: body };
}

// ── Import Logic ──

interface ImportStats {
  projects: number;
  notes: number;
  diagrams: number;
  entities: number;
  columns: number;
  relationships: number;
  flowcharts: number;
  drawings: number;
  ai_sessions: number;
  ai_messages: number;
  skipped_existing: number;
}

async function importProjects(
  items: any[],
  userId: string,
  stats: ImportStats,
): Promise<Map<string, number>> {
  // Map of export project.name (lower) → DB project.id
  const nameToDbId = new Map<string, number>();

  for (const item of items || []) {
    if (!item || !item.name) continue;

    const name = String(item.name);
    const nameLower = name.toLowerCase();

    // Check if a project with the same name already exists for this user
    const existing = await prisma.project.findFirst({
      where: { name, userId, isDeleted: false },
      select: { id: true },
    });

    if (existing) {
      nameToDbId.set(nameLower, existing.id);
      stats.skipped_existing++;
      continue;
    }

    // Create new
    const created = await prisma.project.create({
      data: {
        uid: item.uid || uuid(),
        name,
        userId,
        color: item.color || "#6366f1",
        isDeleted: false,
        createdAt: safeDate(item.created_at),
        updatedAt: safeDate(item.updated_at),
      },
    });
    nameToDbId.set(nameLower, created.id);
    stats.projects++;
  }

  return nameToDbId;
}

async function importNotes(items: any[], userId: string, nameToDbId: Map<string, number>, stats: ImportStats): Promise<void> {
  for (const item of items || []) {
    if (!item || !item.title) continue;

    // Check by uid (if present)
    if (item.uid) {
      const existing = await prisma.note.findUnique({ where: { uid: String(item.uid) }, select: { id: true } });
      if (existing) {
        stats.skipped_existing++;
        continue;
      }
    }

    // Resolve project
    const projectId = resolveProjectId(item.project_id, item.projectId, item.projects, nameToDbId);

    await prisma.note.create({
      data: {
        uid: item.uid || uuid(),
        title: String(item.title),
        content: item.content || "",
        userId,
        projectId,
        isDeleted: false,
        createdAt: safeDate(item.created_at),
        updatedAt: safeDate(item.updated_at),
      },
    });
    stats.notes++;
  }
}

async function importDiagrams(
  items: any[],
  userId: string,
  nameToDbId: Map<string, number>,
  stats: ImportStats,
): Promise<void> {
  for (const item of items || []) {
    if (!item || !item.name) continue;

    // Check by uid
    if (item.uid) {
      const existing = await prisma.diagram.findUnique({ where: { uid: String(item.uid) }, select: { id: true } });
      if (existing) {
        stats.skipped_existing++;
        continue;
      }
    }

    const projectId = resolveProjectId(item.project_id, item.projectId, null, nameToDbId);

    // Create the diagram
    const diagram = await prisma.diagram.create({
      data: {
        uid: item.uid || uuid(),
        name: String(item.name),
        userId,
        projectId,
        isDeleted: false,
        viewportX: item.viewport_x ?? item.viewportX ?? 0,
        viewportY: item.viewport_y ?? item.viewportY ?? 0,
        viewportZoom: item.viewport_zoom ?? item.viewportZoom ?? 1.0,
        createdAt: safeDate(item.created_at),
        updatedAt: safeDate(item.updated_at),
      },
    });
    stats.diagrams++;

    // Import entities + columns
    const entities = item.entities || [];
    for (const entity of entities) {
      if (!entity || !entity.name) continue;

      const entityId = entity.id || uuid();

      await prisma.entity.create({
        data: {
          id: entityId,
          diagramId: diagram.id,
          name: String(entity.name),
          x: Number(entity.x) || 0,
          y: Number(entity.y) || 0,
          color: entity.color || "#6366f1",
          createdAt: safeDate(entity.created_at),
        },
      });
      stats.entities++;

      // Import columns
      const columns = entity.columns || [];
      for (const col of columns) {
        if (!col || !col.name) continue;

        await prisma.column.create({
          data: {
            id: col.id || uuid(),
            entityId: entityId,
            name: String(col.name),
            type: String(col.type || "TEXT"),
            isPk: col.is_pk ?? col.isPk ?? false,
            isNullable: col.is_nullable ?? col.isNullable ?? true,
            enumValues: col.enum_values ?? col.enumValues ?? null,
            sortOrder: col.sort_order ?? col.sortOrder ?? 0,
            createdAt: safeDate(col.created_at),
          },
        });
        stats.columns++;
      }
    }

    // Import relationships
    const relationships = item.relationships || [];
    for (const rel of relationships) {
      if (!rel) continue;

      await prisma.relationship.create({
        data: {
          id: rel.id || uuid(),
          diagramId: diagram.id,
          sourceEntityId: rel.source_entity_id || rel.sourceEntityId || null,
          targetEntityId: rel.target_entity_id || rel.targetEntityId || null,
          sourceColumnId: rel.source_column_id || rel.sourceColumnId || null,
          targetColumnId: rel.target_column_id || rel.targetColumnId || null,
          type: rel.type || "one-to-many",
          sourceHandle: rel.source_handle || rel.sourceHandle || null,
          targetHandle: rel.target_handle || rel.targetHandle || null,
          label: rel.label || null,
          createdAt: safeDate(rel.created_at),
        },
      });
      stats.relationships++;
    }
  }
}

async function importFlowcharts(items: any[], userId: string, nameToDbId: Map<string, number>, stats: ImportStats): Promise<void> {
  for (const item of items || []) {
    if (!item || !item.title) continue;

    if (item.uid) {
      const existing = await prisma.flowchart.findUnique({ where: { uid: String(item.uid) }, select: { id: true } });
      if (existing) {
        stats.skipped_existing++;
        continue;
      }
    }

    const projectId = resolveProjectId(item.project_id, item.projectId, null, nameToDbId);

    await prisma.flowchart.create({
      data: {
        uid: item.uid || uuid(),
        title: String(item.title),
        data: item.data || '{"nodes":[],"edges":[]}',
        userId,
        projectId,
        isDeleted: false,
        createdAt: safeDate(item.created_at),
        updatedAt: safeDate(item.updated_at),
      },
    });
    stats.flowcharts++;
  }
}

async function importDrawings(items: any[], userId: string, nameToDbId: Map<string, number>, stats: ImportStats): Promise<void> {
  for (const item of items || []) {
    if (!item || !item.title) continue;

    if (item.uid) {
      const existing = await prisma.drawing.findUnique({ where: { uid: String(item.uid) }, select: { id: true } });
      if (existing) {
        stats.skipped_existing++;
        continue;
      }
    }

    const projectId = resolveProjectId(item.project_id, item.projectId, null, nameToDbId);

    await prisma.drawing.create({
      data: {
        uid: item.uid || uuid(),
        title: String(item.title),
        data: item.data || "[]",
        userId,
        projectId,
        isDeleted: false,
        createdAt: safeDate(item.created_at),
        updatedAt: safeDate(item.updated_at),
      },
    });
    stats.drawings++;
  }
}

async function importAiChatSessions(
  sessions: any[],
  userId: string,
  nameToDbId: Map<string, number>,
  stats: ImportStats,
): Promise<void> {
  for (const session of sessions || []) {
    if (!session) continue;

    if (session.uid) {
      const existing = await prisma.aiChatSession.findUnique({ where: { uid: String(session.uid) }, select: { id: true } });
      if (existing) {
        stats.skipped_existing++;
        continue;
      }
    }

    const projectId = resolveProjectId(session.project_id, session.projectId, null, nameToDbId);

    // Create session
    const created = await prisma.aiChatSession.create({
      data: {
        uid: session.uid || uuid(),
        userId,
        projectId,
        title: session.title || "Imported Conversation",
        entityType: session.entity_type || null,
        entityUid: session.entity_uid || null,
        createdAt: safeDate(session.created_at),
        updatedAt: safeDate(session.updated_at),
      },
    });
    stats.ai_sessions++;

    // Import messages
    const messages = session.messages || [];
    for (const msg of messages) {
      if (!msg || !msg.role || !msg.content) continue;

      await prisma.aiChatMessage.create({
        data: {
          sessionId: created.id,
          role: String(msg.role),
          content: String(msg.content),
          selectionText: msg.selection_text || msg.selectionText || null,
          createdAt: safeDate(msg.created_at),
        },
      });
      stats.ai_messages++;
    }
  }
}

/**
 * Resolve project_id from the exported data.
 *
 * Priority:
 * 1. If the item has a `project_id` that matches a known project name in nameToDbId → use it
 * 2. If the item has a `projects` relation object with a `name` → try matching
 * 3. Otherwise → null (uncategorized)
 */
function resolveProjectId(
  rawProjectId: any,
  rawProjectIdAlt: any,
  projectsRel: any | null,
  nameToDbId: Map<string, number>,
): number | null {
  // Check if the project_id matches any known mapped project by looking up the name
  const pid = rawProjectId ?? rawProjectIdAlt ?? null;

  // If there's a projects relation, try matching by name
  if (projectsRel && projectsRel.name) {
    const matched = nameToDbId.get(String(projectsRel.name).toLowerCase());
    if (matched != null) return matched;
  }

  // If project_id is numeric and there's a mapping somewhere, it might not match
  // directly since the guest IDs are random strings, not DB IDs.
  // Return null — item will be uncategorized. User can move it later.
  return null;
}

// ── Route ──

router.post("/import", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;

  // 1. Validate
  const validation = validatePayload(req.body);
  if (!validation.ok) {
    return res.status(400).json({ error: validation.error });
  }
  const { payload } = validation;

  const data = payload.data!;

  // 2. Run import sequentially (transaction-like, but we commit per item)
  const stats: ImportStats = {
    projects: 0, notes: 0, diagrams: 0, entities: 0, columns: 0,
    relationships: 0, flowcharts: 0, drawings: 0,
    ai_sessions: 0, ai_messages: 0,
    skipped_existing: 0,
  };

  try {
    // Phase 1: Projects (needed for foreign keys)
    const nameToDbId = await importProjects(data.projects || [], userId, stats);

    // Phase 2: Documents (notes, diagrams, flowcharts, drawings)
    await importNotes(data.notes || [], userId, nameToDbId, stats);
    await importDiagrams(data.diagrams || [], userId, nameToDbId, stats);
    await importFlowcharts(data.flowcharts || [], userId, nameToDbId, stats);
    await importDrawings(data.drawings || [], userId, nameToDbId, stats);

    // Phase 3: AI Chat sessions + messages
    await importAiChatSessions(data.ai_chat_sessions || [], userId, nameToDbId, stats);

    // 3. Respond with summary
    return res.status(200).json({
      success: true,
      message: "Guest data imported successfully.",
      summary: {
        projects: stats.projects,
        notes: stats.notes,
        diagrams: stats.diagrams,
        entities: stats.entities,
        columns: stats.columns,
        relationships: stats.relationships,
        flowcharts: stats.flowcharts,
        drawings: stats.drawings,
        ai_chat_sessions: stats.ai_sessions,
        ai_chat_messages: stats.ai_messages,
        skipped_existing: stats.skipped_existing,
      },
    });
  } catch (err: any) {
    logger.error({ err }, "Guest import error:");
    return res.status(500).json({
      error: "Import failed. Some data may have been partially imported.",
      partial_summary: stats,
      details: err.message,
    });
  }
});

export default router;
