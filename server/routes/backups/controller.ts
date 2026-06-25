import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { s3Client, R2_BUCKET_NAME } from "../../lib/config.js";
import * as backupsService from "./service.js";
import { z } from "zod";

const folderSchema = z.object({
  folder: z.string().min(1).max(1024).nullable(),
});

export async function getFolderSettings(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const result = await backupsService.getFolder(userId);
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, "Get backup folder error:");
    res.status(500).json({ error: "Failed to read backup folder setting" });
  }
}

export async function updateFolderSettings(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const { useLocalAuth } = await import("../../lib/config.js");
    if (!useLocalAuth()) {
      res.status(403).json({ error: "Backup folder is not configurable in cloud mode" });
      return;
    }

    const userId = (req as any).user.id;
    const parsed = folderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid folder payload" });
      return;
    }

    const result = await backupsService.updateFolder(userId, parsed.data.folder);
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, "Update backup folder error:");
    res.status(500).json({ error: "Failed to update backup folder setting" });
  }
}

export async function list(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await backupsService.listBackups(userId, limit, offset);
    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, "Backup list error:");
    res.status(500).json({ error: "Failed to fetch backups" });
  }
}

export async function download(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    const backup = await backupsService.getBackupRecord(id, userId);
    if (!backup) {
      res.status(404).json({ error: "Backup record not found" });
      return;
    }
    if (!backup.filePath) {
      res.status(400).json({ error: "File has not been uploaded yet" });
      return;
    }

    // If R2 configured, try streaming from R2 first (hybrid: local + cloud)
    if (s3Client && R2_BUCKET_NAME) {
      const r2Key = `backups/${id}.sql.gz`;
      try {
        await backupsService.streamR2File(r2Key, backup.name, res);
        return;
      } catch (r2Err: any) {
        logger.warn({ err: r2Err, id }, "R2 download failed, falling back to local file");
      }
    }

    const { useLocalAuth } = await import("../../lib/config.js");

    if (useLocalAuth()) {
      await backupsService.streamLocalFile(backup.filePath, userId, backup.name, res);
    } else {
      await backupsService.streamR2File(backup.filePath, backup.name, res);
    }
  } catch (error: any) {
    logger.error({ err: error }, "Download Error:");
    if (!res.headersSent) {
      if (error.message?.includes("not found") || error.message?.includes("ENOENT")) {
        res.status(404).json({ error: "Backup file not found on disk" });
      } else {
        res.status(500).json({ error: "Failed to download file" });
      }
    }
  }
}

export async function create(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const { name } = req.body;

    const backupRecord = await backupsService.createBackupRecord(userId, name);
    if (!backupRecord) {
      res.status(500).json({ error: "Failed to create backup record" });
      return;
    }

    const { useLocalAuth } = await import("../../lib/config.js");

    if (useLocalAuth()) {
      // Local mode: execute backup in background
      backupsService.executeLocalBackup(backupRecord.id, userId).catch((err) => {
        logger.error({ err }, "Background backup failed");
      });
    } else {
      // Cloud mode: trigger GitHub Action
      await backupsService.triggerCloudBackup(backupRecord.id, userId);
    }

    res.json(backupRecord);
  } catch (error: any) {
    logger.error({ err: error }, "Backup create error:");
    res.status(500).json({ error: "Failed to create backup" });
  }
}

export async function restore(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  const userId = (req as any).user.id;
  const { id } = req.params;

  // Pre-flight validation (return plain JSON before switching to NDJSON)
  try {
    const backup = await backupsService.getBackupRecord(id, userId);
    if (!backup) {
      res.status(404).json({ error: "Backup record not found" });
      return;
    }
    if (!backup.filePath) {
      res.status(400).json({ error: "Backup has no file associated" });
      return;
    }
    if (backup.status !== "completed") {
      res.status(400).json({ error: "Only completed backups can be restored" });
      return;
    }

    const { useLocalAuth } = await import("../../lib/config.js");
    if (!useLocalAuth()) {
      res.status(400).json({ error: "Restore is only available in local mode" });
      return;
    }

    await backupsService.verifyRestoreFile(backup.filePath);
  } catch (error: any) {
    logger.error({ err: error }, "Restore pre-flight error:");
    res.status(500).json({ error: error.message || "Restore failed" });
    return;
  }

  // ── All pre-flight checks passed. Switch to NDJSON streaming. ──
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event: object) => {
    try {
      res.write(JSON.stringify(event) + "\n");
    } catch (err) {
      logger.warn({ err }, "Failed to write NDJSON event");
    }
  };

  try {
    const backupRecord = await prisma?.backup.findFirst({
      where: { id, userId },
    });
    if (!backupRecord?.filePath) {
      send({ type: "error", error: "Backup record not found" });
      res.end();
      return;
    }

    const { autoBackupId, autoBackupName } = await backupsService.performRestore(
      id, backupRecord.filePath, userId, (progress) => send({ type: "progress", ...progress })
    );

    send({
      type: "done",
      success: true,
      auto_backup_id: autoBackupId,
      auto_backup_name: autoBackupName,
      message:
        "Database restored successfully. A pre-restore safety backup was created in case you need to roll back. You may need to re-login if the restored user data no longer matches your current session.",
    });
    res.end();
  } catch (error: any) {
    logger.error({ err: error }, "Restore error:");
    const preRestoreId = error?.autoBackupId;
    const preRestoreName = error?.autoBackupName;
    send({
      type: "error",
      error: error.message || "Failed to restore backup",
      ...(preRestoreId && preRestoreName
        ? { auto_backup_id: preRestoreId, auto_backup_name: preRestoreName }
        : {}),
    });
    res.end();
  }
}
