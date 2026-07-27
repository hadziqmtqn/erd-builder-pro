import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { validatePayload, sendProgress, countWorkUnits, MAX_PAYLOAD_BYTES } from "./helpers.js";
import type { ImportStats } from "./helpers.js";
import { importProjects } from "./importers.js";
import { importNotes } from "./importers.js";
import { importDiagrams } from "./diagram-importer.js";
import { importFlowcharts } from "./importers.js";
import { importDrawings } from "./importers.js";
import { importAiChatSessions } from "./importers.js";

// Assert Prisma is available at module level
if (!prisma) {
  throw new Error("Prisma is not available (server started without database)");
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseDbmlFromData(data: string | null | undefined): string | null {
  if (!data) return null;
  try {
    const parsed = JSON.parse(data);
    return parsed?.dbml_source ?? parsed?.dbmlSource ?? null;
  } catch {
    return null;
  }
}

export async function exportHandler(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const [
      projects,
      notes,
      diagrams,
      flowcharts,
      drawings,
      sessions,
    ] = await Promise.all([
      prisma!.project.findMany({ where: { userId, isDeleted: false }, orderBy: { createdAt: "asc" } }),
      prisma!.note.findMany({ where: { userId, isDeleted: false }, orderBy: { createdAt: "asc" } }),
      prisma!.diagram.findMany({
        where: { userId, isDeleted: false },
        orderBy: { createdAt: "asc" },
        include: {
          entities: { include: { columns: { orderBy: { sortOrder: "asc" } } } },
          relationships: true,
        },
      }),
      prisma!.flowchart.findMany({ where: { userId, isDeleted: false }, orderBy: { createdAt: "asc" } }),
      prisma!.drawing.findMany({ where: { userId, isDeleted: false }, orderBy: { createdAt: "asc" } }),
      prisma!.aiChatSession.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      }),
    ]);

    const data = {
      projects: projects.map((p: any) => ({
        id: p.id, uid: p.uid, name: p.name, color: p.color,
        created_at: iso(p.createdAt), updated_at: iso(p.updatedAt),
      })),
      notes: notes.map((n: any) => ({
        id: n.id, uid: n.uid, title: n.title, content: n.content || "",
        project_id: n.projectId, created_at: iso(n.createdAt), updated_at: iso(n.updatedAt),
      })),
      diagrams: diagrams.map((d: any) => {
        const dbmlSource = d.dbmlSource ?? parseDbmlFromData(d.data);
        return {
          id: d.id, uid: d.uid, name: d.name, project_id: d.projectId,
          viewport_x: d.viewportX ?? 0, viewport_y: d.viewportY ?? 0, viewport_zoom: d.viewportZoom ?? 1,
          dbml_source: dbmlSource,
          dbmlSource,
          created_at: iso(d.createdAt), updated_at: iso(d.updatedAt),
          entities: (d.entities || []).map((e: any) => ({
            id: e.id, name: e.name, x: e.x, y: e.y, color: e.color,
            created_at: iso(e.createdAt),
            columns: (e.columns || []).map((c: any) => ({
              id: c.id, name: c.name, type: c.type,
              is_pk: c.isPk, is_nullable: c.isNullable,
              enum_values: c.enumValues, sort_order: c.sortOrder,
              comment: c.comment,
              max_length: c.maxLength,
              numeric_precision: c.numericPrecision,
              numeric_scale: c.numericScale,
              created_at: iso(c.createdAt),
            })),
          })),
          relationships: (d.relationships || []).map((r: any) => ({
            id: r.id, source_entity_id: r.sourceEntityId, target_entity_id: r.targetEntityId,
            source_column_id: r.sourceColumnId, target_column_id: r.targetColumnId,
            source_handle: r.sourceHandle, target_handle: r.targetHandle,
            type: r.type, label: r.label, created_at: iso(r.createdAt),
          })),
        };
      }),
      flowcharts: flowcharts.map((f: any) => ({
        id: f.id, uid: f.uid, title: f.title, data: f.data || '{"nodes":[],"edges":[]}',
        project_id: f.projectId, created_at: iso(f.createdAt), updated_at: iso(f.updatedAt),
      })),
      drawings: drawings.map((d: any) => ({
        id: d.id, uid: d.uid, title: d.title, data: d.data || "[]",
        project_id: d.projectId, created_at: iso(d.createdAt), updated_at: iso(d.updatedAt),
      })),
      ai_chat_sessions: sessions.map((s: any) => ({
        uid: s.uid, title: s.title, entity_type: s.entityType, entity_uid: s.entityUid,
        project_id: s.projectId, created_at: iso(s.createdAt), updated_at: iso(s.updatedAt),
        messages: (s.messages || []).map((m: any) => ({
          id: m.id, role: m.role, content: m.content,
          selection_text: m.selectionText, created_at: iso(m.createdAt),
        })),
      })),
    };

    res.json({
      version: "1.1",
      exported_at: new Date().toISOString(),
      application: "ERD Builder Pro",
      total_items: {
        projects: data.projects.length,
        notes: data.notes.length,
        diagrams: data.diagrams.length,
        flowcharts: data.flowcharts.length,
        drawings: data.drawings.length,
        ai_chat_sessions: data.ai_chat_sessions.length,
      },
      data,
    });
  } catch (err: any) {
    handleExportError(res, err);
  }
}

function handleExportError(res: ExpressResponse, err: any): void {
  logger.error({ err }, "Data export error");
  res.status(500).json({ error: "Failed to export data" });
}

export async function importHandler(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  const userId = (req as any).user.id;

  // 0. Size guard — reject before JSON parsing if body is huge
  const contentLength = parseInt(req.headers["content-length"] || "0", 10);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    res.status(413).json({
      error: `Payload too large. Maximum ${MAX_PAYLOAD_BYTES / 1024 / 1024} MB allowed.`,
    });
    return;
  }

  // 1. Validate
  const validation = validatePayload(req.body);
  if (!validation.ok) {
    const errMsg = validation as { ok: false; error: string };
    res.status(400).json({ error: errMsg.error });
    return;
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
      message: "Data imported successfully.",
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
}
