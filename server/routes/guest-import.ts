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
 * - Batched Prisma operations for performance (up to 100x faster)
 * - NDJSON streaming for real-time progress feedback
 * - Returns a detailed summary of imported counts
 */

import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../lib/middleware.js";
import { logger } from "../lib/logger.js";
import crypto from "node:crypto";

const router = Router();

// ── Constants ──

/** Maximum items to process per Prisma $transaction batch */
const BATCH_SIZE = 50;

/** Safety cap on JSON payload size — reject before parsing to avoid OOM */
const MAX_PAYLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

// ── Helpers ──

function now(): Date {
  return new Date();
}

function uuid(): string {
  return crypto.randomUUID();
}

function safeDate(val: string | null | undefined, fallback: Date = now()): Date {
  if (!val) return fallback;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

// Assert Prisma is available at module level
if (!prisma) {
  throw new Error("Prisma is not available (server started without database)");
}
const _prisma: NonNullable<typeof prisma> = prisma;

/** Write an NDJSON progress line to the streaming response. */
function sendProgress(res: ExpressResponse, data: Record<string, unknown>): void {
  try {
    res.write(JSON.stringify(data) + "\n");
  } catch {
    // Client may have disconnected — ignore write errors
  }
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

// ── Import Stats ──

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

// ── Project ID Resolution ──

function resolveProjectId(
  rawProjectId: any,
  rawProjectIdAlt: any,
  nameToDbId: Map<string, number>,
  guestIdToName: Map<string, string>,
): number | null {
  const pid = rawProjectId ?? rawProjectIdAlt;
  if (pid != null) {
    const guestName = guestIdToName.get(String(pid));
    if (guestName) {
      const dbId = nameToDbId.get(guestName);
      if (dbId != null) return dbId;
    }
  }
  return null;
}

// ── Phase 1: Projects ──

async function importProjects(
  items: any[],
  userId: string,
  stats: ImportStats,
  res: ExpressResponse,
  workOffset: number,
  totalWork: number,
): Promise<{ nameToDbId: Map<string, number>; guestIdToName: Map<string, string> }> {
  const nameToDbId = new Map<string, number>();
  const guestIdToName = new Map<string, string>();
  let processed = 0;

  for (const item of items || []) {
    if (!item || !item.name) continue;

    const name = String(item.name);
    const nameLower = name.toLowerCase();
    const guestId = String(item.uid || item.id || "");

    if (guestId) {
      guestIdToName.set(guestId, nameLower);
    }

    const existing = await _prisma.project.findFirst({
      where: { name, userId, isDeleted: false },
      select: { id: true },
    });

    if (existing) {
      nameToDbId.set(nameLower, existing.id);
      stats.skipped_existing++;
    } else {
      const created = await _prisma.project.create({
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

    processed++;
    sendProgress(res, {
      type: "progress",
      current: workOffset + processed,
      total: totalWork,
      phase: "Importing projects…",
    });
  }

  return { nameToDbId, guestIdToName };
}

// ── Phase 2a: Notes ──

async function importNotes(
  items: any[],
  userId: string,
  nameToDbId: Map<string, number>,
  guestIdToName: Map<string, string>,
  stats: ImportStats,
  res: ExpressResponse,
  workOffset: number,
  totalWork: number,
): Promise<number> {
  let processed = 0;
  const validItems = (items || []).filter(item => item && item.title);

  for (let i = 0; i < validItems.length; i += BATCH_SIZE) {
    const batch = validItems.slice(i, i + BATCH_SIZE);
    const creates: any[] = [];

    for (const item of batch) {
      if (item.uid) {
        const existing = await _prisma.note.findUnique({
          where: { uid: String(item.uid) },
          select: { id: true },
        });
        if (existing) {
          stats.skipped_existing++;
          processed++;
          continue;
        }
      }

      const projectId = resolveProjectId(item.project_id, item.projectId, nameToDbId, guestIdToName);
      creates.push({
        uid: item.uid || uuid(),
        title: String(item.title),
        content: item.content || "",
        userId,
        projectId,
        isDeleted: false,
        createdAt: safeDate(item.created_at),
        updatedAt: safeDate(item.updated_at),
      });
    }

    if (creates.length > 0) {
      await _prisma.$transaction(creates.map(data => _prisma.note.create({ data })));
      stats.notes += creates.length;
    }

    processed += batch.length;
    sendProgress(res, {
      type: "progress",
      current: workOffset + processed,
      total: totalWork,
      phase: `Importing notes (${stats.notes} done)…`,
    });
  }

  return processed;
}

// ── Phase 2b: Diagrams (ERD) ──

async function importDiagrams(
  items: any[],
  userId: string,
  nameToDbId: Map<string, number>,
  guestIdToName: Map<string, string>,
  stats: ImportStats,
  res: ExpressResponse,
  workOffset: number,
  totalWork: number,
): Promise<number> {
  let processed = 0;
  const validItems = (items || []).filter(item => item && item.name);

  for (const item of validItems) {
    if (item.uid) {
      const existing = await _prisma.diagram.findUnique({
        where: { uid: String(item.uid) },
        select: { id: true },
      });
      if (existing) {
        stats.skipped_existing++;
        processed++;
        sendProgress(res, {
          type: "progress",
          current: workOffset + processed,
          total: totalWork,
          phase: `Skipping existing diagram: ${String(item.name).slice(0, 30)}`,
        });
        continue;
      }
    }

    const projectId = resolveProjectId(item.project_id, item.projectId, nameToDbId, guestIdToName);

    // Step 1: Create the diagram record
    const diagram = await _prisma.diagram.create({
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
    processed++;

    sendProgress(res, {
      type: "progress",
      current: workOffset + processed,
      total: totalWork,
      phase: `Importing ERD: ${String(item.name).slice(0, 30)}`,
    });

    const entityIdMap = new Map<string, string>();
    const columnIdMap = new Map<string, string>();
    const entities = item.entities || [];

    // Step 2: Batch-create entities
    const entityBatch: { oldId: string; newId: string; data: any }[] = [];
    for (const entity of entities) {
      if (!entity || !entity.name) continue;
      const oldId = String(entity.id || "");
      const newId = uuid();
      if (oldId) entityIdMap.set(oldId, newId);
      entityBatch.push({
        oldId,
        newId,
        data: {
          id: newId,
          diagramId: diagram.id,
          name: String(entity.name),
          x: Number(entity.x) || 0,
          y: Number(entity.y) || 0,
          color: entity.color || "#6366f1",
          createdAt: safeDate(entity.created_at),
        },
      });
    }

    for (let i = 0; i < entityBatch.length; i += BATCH_SIZE) {
      const slice = entityBatch.slice(i, i + BATCH_SIZE);
      await _prisma.$transaction(slice.map(e => _prisma.entity.create({ data: e.data })));
      stats.entities += slice.length;
      processed += slice.length;

      sendProgress(res, {
        type: "progress",
        current: workOffset + processed,
        total: totalWork,
        phase: `Importing ERD tables (${stats.entities} done)…`,
      });
    }

    // Step 3: Batch-create columns
    const columnBatch: { oldId: string; newId: string; data: any }[] = [];
    for (const entity of entities) {
      if (!entity || !entity.name) continue;
      const newEntityId = entityIdMap.get(String(entity.id || ""));
      if (!newEntityId) continue;

      const columns = entity.columns || [];
      for (const col of columns) {
        if (!col || !col.name) continue;
        const oldColId = String(col.id || "");
        const newColId = uuid();
        if (oldColId) columnIdMap.set(oldColId, newColId);
        columnBatch.push({
          oldId: oldColId,
          newId: newColId,
          data: {
            id: newColId,
            entityId: newEntityId,
            name: String(col.name),
            type: String(col.type || "TEXT"),
            isPk: col.is_pk ?? col.isPk ?? false,
            isNullable: col.is_nullable ?? col.isNullable ?? true,
            enumValues: col.enum_values ?? col.enumValues ?? null,
            sortOrder: col.sort_order ?? col.sortOrder ?? 0,
            createdAt: safeDate(col.created_at),
          },
        });
      }
    }

    for (let i = 0; i < columnBatch.length; i += BATCH_SIZE) {
      const slice = columnBatch.slice(i, i + BATCH_SIZE);
      await _prisma.$transaction(slice.map(c => _prisma.column.create({ data: c.data })));
      stats.columns += slice.length;
      processed += slice.length;

      sendProgress(res, {
        type: "progress",
        current: workOffset + processed,
        total: totalWork,
        phase: `Importing ERD columns (${stats.columns} done)…`,
      });
    }

    // Step 4: Batch-create relationships
    const relationships = item.relationships || [];
    const relBatch: any[] = [];

    for (const rel of relationships) {
      if (!rel) continue;

      const oldSourceEntityId = String(rel.source_entity_id || rel.sourceEntityId || "");
      const oldTargetEntityId = String(rel.target_entity_id || rel.targetEntityId || "");
      const oldSourceColumnId = String(rel.source_column_id || rel.sourceColumnId || "");
      const oldTargetColumnId = String(rel.target_column_id || rel.targetColumnId || "");

      const sourceEntityId = entityIdMap.get(oldSourceEntityId) || oldSourceEntityId || null;
      const targetEntityId = entityIdMap.get(oldTargetEntityId) || oldTargetEntityId || null;
      const sourceColumnId = columnIdMap.get(oldSourceColumnId) || oldSourceColumnId || null;
      const targetColumnId = columnIdMap.get(oldTargetColumnId) || oldTargetColumnId || null;

      let sourceHandle = rel.source_handle || rel.sourceHandle || null;
      let targetHandle = rel.target_handle || rel.targetHandle || null;

      if (sourceHandle && oldSourceColumnId && sourceColumnId) {
        sourceHandle = sourceHandle.replace(oldSourceColumnId, sourceColumnId);
      }
      if (targetHandle && oldTargetColumnId && targetColumnId) {
        targetHandle = targetHandle.replace(oldTargetColumnId, targetColumnId);
      }

      relBatch.push({
        id: uuid(),
        diagramId: diagram.id,
        sourceEntityId,
        targetEntityId,
        sourceColumnId,
        targetColumnId,
        type: rel.type || "one-to-many",
        sourceHandle,
        targetHandle,
        label: rel.label || null,
        createdAt: safeDate(rel.created_at),
      });
    }

    for (let i = 0; i < relBatch.length; i += BATCH_SIZE) {
      const slice = relBatch.slice(i, i + BATCH_SIZE);
      await _prisma.$transaction(slice.map(r => _prisma.relationship.create({ data: r })));
      stats.relationships += slice.length;
      processed += slice.length;

      sendProgress(res, {
        type: "progress",
        current: workOffset + processed,
        total: totalWork,
        phase: `Importing ERD relationships (${stats.relationships} done)…`,
      });
    }
  }

  return processed;
}

// ── Phase 2c: Flowcharts ──

async function importFlowcharts(
  items: any[],
  userId: string,
  nameToDbId: Map<string, number>,
  guestIdToName: Map<string, string>,
  stats: ImportStats,
  res: ExpressResponse,
  workOffset: number,
  totalWork: number,
): Promise<number> {
  let processed = 0;
  const validItems = (items || []).filter(item => item && item.title);

  for (let i = 0; i < validItems.length; i += BATCH_SIZE) {
    const batch = validItems.slice(i, i + BATCH_SIZE);
    const creates: any[] = [];

    for (const item of batch) {
      if (item.uid) {
        const existing = await _prisma.flowchart.findUnique({
          where: { uid: String(item.uid) },
          select: { id: true },
        });
        if (existing) {
          stats.skipped_existing++;
          processed++;
          continue;
        }
      }

      const projectId = resolveProjectId(item.project_id, item.projectId, nameToDbId, guestIdToName);
      creates.push({
        uid: item.uid || uuid(),
        title: String(item.title),
        data: item.data || '{"nodes":[],"edges":[]}',
        userId,
        projectId,
        isDeleted: false,
        createdAt: safeDate(item.created_at),
        updatedAt: safeDate(item.updated_at),
      });
    }

    if (creates.length > 0) {
      await _prisma.$transaction(creates.map(data => _prisma.flowchart.create({ data })));
      stats.flowcharts += creates.length;
    }

    processed += batch.length;
    sendProgress(res, {
      type: "progress",
      current: workOffset + processed,
      total: totalWork,
      phase: `Importing flowcharts (${stats.flowcharts} done)…`,
    });
  }

  return processed;
}

// ── Phase 2d: Drawings ──

async function importDrawings(
  items: any[],
  userId: string,
  nameToDbId: Map<string, number>,
  guestIdToName: Map<string, string>,
  stats: ImportStats,
  res: ExpressResponse,
  workOffset: number,
  totalWork: number,
): Promise<number> {
  let processed = 0;
  const validItems = (items || []).filter(item => item && item.title);

  for (let i = 0; i < validItems.length; i += BATCH_SIZE) {
    const batch = validItems.slice(i, i + BATCH_SIZE);
    const creates: any[] = [];

    for (const item of batch) {
      if (item.uid) {
        const existing = await _prisma.drawing.findUnique({
          where: { uid: String(item.uid) },
          select: { id: true },
        });
        if (existing) {
          stats.skipped_existing++;
          processed++;
          continue;
        }
      }

      const projectId = resolveProjectId(item.project_id, item.projectId, nameToDbId, guestIdToName);
      creates.push({
        uid: item.uid || uuid(),
        title: String(item.title),
        data: item.data || "[]",
        userId,
        projectId,
        isDeleted: false,
        createdAt: safeDate(item.created_at),
        updatedAt: safeDate(item.updated_at),
      });
    }

    if (creates.length > 0) {
      await _prisma.$transaction(creates.map(data => _prisma.drawing.create({ data })));
      stats.drawings += creates.length;
    }

    processed += batch.length;
    sendProgress(res, {
      type: "progress",
      current: workOffset + processed,
      total: totalWork,
      phase: `Importing drawings (${stats.drawings} done)…`,
    });
  }

  return processed;
}

// ── Phase 3: AI Chat ──

async function importAiChatSessions(
  sessions: any[],
  userId: string,
  nameToDbId: Map<string, number>,
  guestIdToName: Map<string, string>,
  stats: ImportStats,
  res: ExpressResponse,
  workOffset: number,
  totalWork: number,
): Promise<number> {
  let processed = 0;
  const validSessions = (sessions || []).filter(s => s);

  for (const session of validSessions) {
    if (session.uid) {
      const existing = await _prisma.aiChatSession.findUnique({
        where: { uid: String(session.uid) },
        select: { id: true },
      });
      if (existing) {
        stats.skipped_existing++;
        processed++;
        sendProgress(res, {
          type: "progress",
          current: workOffset + processed,
          total: totalWork,
          phase: "Importing AI chat…",
        });
        continue;
      }
    }

    const projectId = resolveProjectId(session.project_id, session.projectId, nameToDbId, guestIdToName);

    const created = await _prisma.aiChatSession.create({
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
    processed++;

    sendProgress(res, {
      type: "progress",
      current: workOffset + processed,
      total: totalWork,
      phase: `Importing AI chats (${stats.ai_sessions} done)…`,
    });

    // Batch-create messages
    const messages = session.messages || [];
    const msgCreates: any[] = [];

    for (const msg of messages) {
      if (!msg || !msg.role || !msg.content) continue;
      msgCreates.push({
        sessionId: created.id,
        role: String(msg.role),
        content: String(msg.content),
        selectionText: msg.selection_text || msg.selectionText || null,
        createdAt: safeDate(msg.created_at),
      });
    }

    for (let i = 0; i < msgCreates.length; i += BATCH_SIZE) {
      const slice = msgCreates.slice(i, i + BATCH_SIZE);
      await _prisma.$transaction(slice.map(m => _prisma.aiChatMessage.create({ data: m })));
      stats.ai_messages += slice.length;
      processed += slice.length;

      sendProgress(res, {
        type: "progress",
        current: workOffset + processed,
        total: totalWork,
        phase: `Importing AI messages (${stats.ai_messages} done)…`,
      });
    }
  }

  return processed;
}

// ── Work Unit Counting ──

function countWorkUnits(data: ImportPayload["data"]): number {
  if (!data) return 0;
  let total = 0;

  // Projects: 1 per project
  total += (data.projects || []).length;

  // Notes: 1 per note
  total += (data.notes || []).length;

  // Diagrams: 1 per diagram + sum of (entities + columns + relationships)
  for (const d of data.diagrams || []) {
    total += 1; // diagram itself
    const entities = d.entities || [];
    total += entities.length; // entities
    for (const e of entities) {
      total += (e.columns || []).length; // columns
    }
    total += (d.relationships || []).length; // relationships
  }

  // Flowcharts: 1 per flowchart
  total += (data.flowcharts || []).length;

  // Drawings: 1 per drawing
  total += (data.drawings || []).length;

  // AI Chat: 1 per session + sum of messages
  for (const s of data.ai_chat_sessions || []) {
    total += 1; // session
    total += (s.messages || []).length; // messages
  }

  // Minimum 1 to avoid divide-by-zero
  return Math.max(total, 1);
}

// ── Route ──

router.post("/import", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;

  // 0. Size guard — reject before JSON parsing if body is huge
  const contentLength = parseInt(req.headers["content-length"] || "0", 10);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return res.status(413).json({
      error: `Payload too large. Maximum ${MAX_PAYLOAD_BYTES / 1024 / 1024} MB allowed.`,
    });
  }

  // 1. Validate
  const validation = validatePayload(req.body);
  if (!validation.ok) {
    const errMsg = validation as { ok: false; error: string };
    return res.status(400).json({ error: errMsg.error });
  }
  const { payload } = validation;
  const data = payload.data!;

  // 2. Count total work units for progress tracking
  const totalWork = countWorkUnits(data);

  // 3. Set up NDJSON streaming response
  res.writeHead(200, {
    "Content-Type": "application/x-ndjson",
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no", // Disable nginx buffering
  });

  const stats: ImportStats = {
    projects: 0, notes: 0, diagrams: 0, entities: 0, columns: 0,
    relationships: 0, flowcharts: 0, drawings: 0,
    ai_sessions: 0, ai_messages: 0,
    skipped_existing: 0,
  };

  let workDone = 0;

  try {
    sendProgress(res, {
      type: "progress",
      current: 0,
      total: totalWork,
      phase: "Starting import…",
    });

    // Phase 1: Projects
    const { nameToDbId, guestIdToName } = await importProjects(
      data.projects || [], userId, stats, res, workDone, totalWork,
    );
    workDone += (data.projects || []).length;

    // Phase 2a: Notes
    workDone += await importNotes(
      data.notes || [], userId, nameToDbId, guestIdToName, stats, res, workDone, totalWork,
    );

    // Phase 2b: Diagrams (ERD) — the heavy phase
    workDone += await importDiagrams(
      data.diagrams || [], userId, nameToDbId, guestIdToName, stats, res, workDone, totalWork,
    );

    // Phase 2c: Flowcharts
    workDone += await importFlowcharts(
      data.flowcharts || [], userId, nameToDbId, guestIdToName, stats, res, workDone, totalWork,
    );

    // Phase 2d: Drawings
    workDone += await importDrawings(
      data.drawings || [], userId, nameToDbId, guestIdToName, stats, res, workDone, totalWork,
    );

    // Phase 3: AI Chat
    workDone += await importAiChatSessions(
      data.ai_chat_sessions || [], userId, nameToDbId, guestIdToName, stats, res, workDone, totalWork,
    );

    // Send final progress (100%)
    sendProgress(res, {
      type: "progress",
      current: totalWork,
      total: totalWork,
      phase: "Import complete!",
    });

    // Send completion
    sendProgress(res, {
      type: "complete",
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

    res.end();
  } catch (err: any) {
    logger.error({ err }, "Guest import error");

    // Try to send error through the stream if possible
    try {
      sendProgress(res, {
        type: "error",
        error: "Import failed. Some data may have been partially imported.",
        partial_summary: stats,
      });
      res.end();
    } catch {
      // Stream already closed — can't recover
    }
  }
});

export default router;
