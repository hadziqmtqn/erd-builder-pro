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
}
