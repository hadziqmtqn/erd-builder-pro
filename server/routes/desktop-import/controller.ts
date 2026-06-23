import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { isDesktopMode } from "../../lib/config.js";
import Database from "better-sqlite3";
import path from "path";
import { randomUUID, randomBytes } from "crypto";
import { mkdir, access, stat as fsStat, unlink } from "fs/promises";
import { createWriteStream, renameSync } from "fs";
import { pipeline } from "stream/promises";
import os from "os";
import {
  validatePayload,
  sendProgress,
  countWorkUnits,
  MAX_PAYLOAD_BYTES,
} from "../guest-import/helpers.js";
import type { ImportStats } from "../guest-import/helpers.js";
import { importProjects } from "../guest-import/importers.js";
import { importNotes } from "../guest-import/importers.js";
import { importDiagrams } from "../guest-import/diagram-importer.js";
import { importFlowcharts } from "../guest-import/importers.js";
import { importDrawings } from "../guest-import/importers.js";
import { importAiChatSessions } from "../guest-import/importers.js";
import { createLocalBackup, getDefaultBackupDir, ensureBackupDir } from "../../lib/local-backup.js";

if (!prisma) {
  throw new Error("Prisma is not available (server started without database)");
}

// ── JSON Data Import ──

export async function importHandler(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  // Only available in desktop (SQLite) mode
  if (!isDesktopMode()) {
    res.status(400).json({ error: "Manual data import is only available in desktop mode." });
    return;
  }

  const userId = (req as any).user.id;

  // 0. Size guard
  const contentLength = parseInt(req.headers["content-length"] || "0", 10);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    res.status(413).json({
      error: `Payload too large. Maximum ${MAX_PAYLOAD_BYTES / 1024 / 1024} MB allowed.`,
    });
    return;
  }

  // 1. Validate payload (same format as guest export)
  const validation = validatePayload(req.body);
  if (!validation.ok) {
    const errMsg = validation as { ok: false; error: string };
    res.status(400).json({ error: errMsg.error });
    return;
  }
  const { payload } = validation;
  const data = payload.data!;

  // 2. Count total work units
  const totalWork = countWorkUnits(data);

  // 3. NDJSON streaming response
  res.writeHead(200, {
    "Content-Type": "application/x-ndjson",
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
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

    // Phase 2b: Diagrams (ERD)
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

    sendProgress(res, {
      type: "progress",
      current: totalWork,
      total: totalWork,
      phase: "Import complete!",
    });

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
    logger.error({ err }, "Desktop import error");

    try {
      sendProgress(res, {
        type: "error",
        error: "Import failed. Some data may have been partially imported.",
        partial_summary: stats,
      });
      res.end();
    } catch {
      // Stream already closed
    }
  }
}

// ── Database File Restore (.db) ──

/** Resolve the live SQLite database path from DATABASE_URL */
function getDbPath(): string {
  const dbUrl = process.env.DATABASE_URL || "";
  const rawPath = dbUrl.replace(/^file:/, "").trim();
  if (!rawPath.endsWith(".db")) {
    throw new Error("Invalid SQLite DATABASE_URL format");
  }
  return path.resolve(process.cwd(), rawPath);
}

/** Magic bytes for SQLite database format */
const SQLITE_MAGIC = Buffer.from("53514c69746520666f726d61742033", "hex"); // "SQLite format 3\0"

function isSqliteFile(buffer: Buffer): boolean {
  return buffer.length > 16 && buffer.subarray(0, 16).equals(SQLITE_MAGIC);
}

export async function restoreHandler(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  if (!isDesktopMode()) {
    res.status(400).json({ error: "Database restore is only available in desktop mode." });
    return;
  }

  const userId = (req as any).user.id;

  // 1. Validate uploaded file
  const file = (req as any).file;
  if (!file) {
    res.status(400).json({ error: "No database file uploaded." });
    return;
  }

  if (!isSqliteFile(file.buffer)) {
    res.status(400).json({ error: "The uploaded file is not a valid SQLite database." });
    return;
  }

  // ── NDJSON streaming ──
  res.writeHead(200, {
    "Content-Type": "application/x-ndjson",
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
  });

  const send = (event: Record<string, unknown>) => {
    try {
      res.write(JSON.stringify(event) + "\n");
    } catch {
      // ignore write errors
    }
  };

  let autoBackupId = "";
  let autoBackupName = "";
  let tempDbPath = "";

  try {
    // Save uploaded file to temp directory
    const tempDir = path.join(os.tmpdir(), "erd-builder-restore");
    await mkdir(tempDir, { recursive: true });
    tempDbPath = path.join(tempDir, `restore_${randomBytes(8).toString("hex")}.db`);
    await pipeline(
      require("stream").Readable.from(Buffer.from(file.buffer)),
      createWriteStream(tempDbPath),
    );

    send({
      type: "progress",
      current: 1,
      total: 5,
      phase: "Validating database file...",
    });

    // Verify the uploaded file is a working SQLite database
    let verifyDb: Database.Database | null = null;
    try {
      verifyDb = new Database(tempDbPath, { readonly: true });
      verifyDb.pragma("schema_version");
    } finally {
      verifyDb?.close();
    }

    // 2. Create pre-restore safety backup
    send({
      type: "progress",
      current: 2,
      total: 5,
      phase: "Creating safety backup of current database...",
    });

    autoBackupId = randomUUID();
    autoBackupName = `PreRestore_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}`;

    // Create a backup record in the database (best-effort — the DB is about to be replaced)
    try {
      if (prisma) {
        await prisma.backup.create({
          data: {
            id: autoBackupId,
            userId,
            name: autoBackupName,
            status: "pending",
          },
        });
      }
    } catch {
      // Pre-restore backup record may not survive DB replacement — that's fine
    }

    // Create the actual backup file
    try {
      const backupResult = await createLocalBackup(autoBackupId, userId);
      if (prisma) {
        await prisma.backup.update({
          where: { id: autoBackupId },
          data: {
            filePath: backupResult.filePath,
            fileSize: backupResult.fileSize,
            status: "completed",
          },
        }).catch(() => {});
      }
    } catch (backupErr: any) {
      logger.warn({ err: backupErr }, "Pre-restore safety backup failed (proceeding without)");
      send({
        type: "progress",
        current: 2,
        total: 5,
        phase: "Warning: safety backup could not be created (proceeding)",
      });
    }

    // 3. Disconnect Prisma
    await prisma?.$disconnect();
    send({
      type: "progress",
      current: 3,
      total: 5,
      phase: "Replacing database file...",
    });

    // 4. Atomic replace: copy uploaded → atomicTemp → rename → live
    const dbPath = getDbPath();
    const atomicTempPath = `${dbPath}.restore.new`;

    // Remove leftover temp file from previous interrupted restore
    try { await unlink(atomicTempPath); } catch { /* doesn't exist */ }

    const sourceDb = new Database(tempDbPath, { readonly: true });
    try {
      await sourceDb.backup(atomicTempPath, {
        progress: ({ totalPages, remainingPages }) => {
          const done = Math.max(0, totalPages - remainingPages);
          const subPct = totalPages > 0 ? Math.min(100, Math.round((done / totalPages) * 100)) : 0;
          // Map 0–100% sub-progress to 60–95% overall
          const overall = 60 + Math.round(subPct * 0.35);
          send({
            type: "progress",
            current: Math.round(overall),
            total: 100,
            phase: `Replacing database... ${done}/${totalPages} pages`,
          });
          return 100;
        },
      });
    } finally {
      sourceDb.close();
    }

    // Verify new file
    try {
      const verifyNew = new Database(atomicTempPath, { readonly: true });
      try {
        verifyNew.pragma("schema_version");
      } finally {
        verifyNew.close();
      }
    } catch (verifyErr: any) {
      try { await unlink(atomicTempPath); } catch { /* */ }
      throw new Error(`Restored database appears corrupt: ${verifyErr.message}`);
    }

    // Atomic rename
    renameSync(atomicTempPath, dbPath);
    logger.info({ dbPath }, "Database restore: atomic rename complete");

    send({
      type: "progress",
      current: 4,
      total: 5,
      phase: "Reconnecting database...",
    });

    // 5. Reconnect Prisma
    try {
      await prisma?.$connect();
      logger.info("Prisma reconnected after database restore");
    } catch (reconnectErr) {
      logger.error({ err: reconnectErr }, "Failed to reconnect Prisma after restore");
    }

    send({
      type: "progress",
      current: 5,
      total: 5,
      phase: "Restore complete!",
    });

    send({
      type: "complete",
      success: true,
      auto_backup_id: autoBackupId,
      auto_backup_name: autoBackupName,
      message: "Database restored successfully. A pre-restore safety backup was created. The app will reload shortly.",
    });

    res.end();
  } catch (err: any) {
    logger.error({ err }, "Database restore error");

    // Reconnect Prisma on error so the app doesn't stay disconnected
    try { await prisma?.$connect(); } catch { /* */ }

    send({
      type: "error",
      error: err.message || "Failed to restore database",
      auto_backup_id: autoBackupId,
      auto_backup_name: autoBackupName,
    });
    res.end();
  } finally {
    // Cleanup temp file
    if (tempDbPath) {
      try { await unlink(tempDbPath); } catch { /* */ }
    }
    // Also cleanup atomic temp if left behind
    try {
      const dbPath = getDbPath();
      await unlink(`${dbPath}.restore.new`);
    } catch { /* */ }
  }
}
