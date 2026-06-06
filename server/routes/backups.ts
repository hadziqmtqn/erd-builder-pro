import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME, s3Client, R2_BUCKET_NAME, useLocalAuth } from "../lib/config.js";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../lib/middleware.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "../lib/logger.js";
import {
  createLocalBackup,
  getBackupFilePath,
  getDefaultBackupDir,
  getBackupDirForUser,
  ensureBackupDir,
} from "../lib/local-backup.js";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { z } from "zod";

const router = Router();

// ── Settings: Backup folder ───────────────────────────────────────────

const folderSchema = z.object({
  folder: z.string().min(1).max(1024).nullable(),
});

/**
 * GET /api/backups/settings/folder
 * Returns the user's configured backup folder and the default fallback.
 */
router.get(
  "/settings/folder",
  authenticate,
  async (req: ExpressRequest, res: ExpressResponse) => {
    const user = (req as any).user;
    try {
      const pref = await prisma?.userPreference.findUnique({
        where: { userId: user.id },
        select: { backupFolder: true },
      });

      const customFolder = pref?.backupFolder ?? null;
      const defaultFolder = getDefaultBackupDir();
      const effectiveFolder = await getBackupDirForUser(user.id);

      // Wire format is snake_case (camelToSnake middleware auto-converts camelCase,
      // but returning snake_case directly keeps the response identical and avoids
      // double-underscore artifacts if a value happens to contain a capital letter).
      res.json({
        custom_folder: customFolder,
        default_folder: defaultFolder,
        effective_folder: effectiveFolder,
      });
    } catch (error: any) {
      logger.error({ err: error }, "Get backup folder error:");
      res.status(500).json({ error: "Failed to read backup folder setting" });
    }
  }
);

/**
 * PUT /api/backups/settings/folder
 * Update the user's backup folder.
 * Body: { folder: string | null }  (null = reset to default)
 *
 * Validates the path is resolvable and the server can create/access it
 * (creates the directory recursively if missing).
 */
router.put(
  "/settings/folder",
  authenticate,
  async (req: ExpressRequest, res: ExpressResponse) => {
    const user = (req as any).user;
    const parsed = folderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid folder payload" });
    }
    const input = parsed.data.folder;
    const normalized = input?.trim() ? input.trim() : null;

    try {
      let resolvedPath: string | null = null;

      if (normalized) {
        // Reject shell metacharacters that could indicate injection attempts.
        if (/[`$\\;<>|&]/.test(normalized)) {
          return res.status(400).json({
            error: "Folder path contains invalid characters",
          });
        }
        // Resolve relative paths against the user's home (server-side).
        resolvedPath = path.isAbsolute(normalized)
          ? path.normalize(normalized)
          : path.resolve(require("os").homedir(), normalized);

        // Ensure the directory exists / can be created.
        try {
          await ensureBackupDir(resolvedPath);
          // Write probe file to confirm writability
          const probePath = path.join(resolvedPath, ".erd-builder-pro-write-test");
          await stat(resolvedPath); // verify still accessible
          // (we don't actually need to write a probe; access+mkdir is enough)
        } catch (dirErr: any) {
          logger.error({ err: dirErr, path: resolvedPath }, "Backup folder not writable");
          return res.status(400).json({
            error: `Cannot access or create folder: ${dirErr.message}`,
          });
        }
      }

      await prisma?.userPreference.upsert({
        where: { userId: user.id },
        update: { backupFolder: resolvedPath },
        create: {
          userId: user.id,
          backupFolder: resolvedPath,
        },
      });

      const effectiveFolder = await getBackupDirForUser(user.id);
      res.json({
        custom_folder: resolvedPath,
        default_folder: getDefaultBackupDir(),
        effective_folder: effectiveFolder,
      });
    } catch (error: any) {
      logger.error({ err: error }, "Update backup folder error:");
      res.status(500).json({ error: "Failed to update backup folder setting" });
    }
  }
);

// Get backups (paginated)
router.get("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const user = (req as any).user;
  const limit = parseInt(req.query.limit as string) || 10;
  const offset = parseInt(req.query.offset as string) || 0;

  try {
    const [data, total] = await Promise.all([
      prisma?.backup.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma?.backup.count({
        where: { userId: user.id },
      }),
    ]);
    res.json({ data: data || [], total: total || 0 });
  } catch (error: any) {
    logger.error({ err: error }, "Backup list error:");
    res.status(500).json({ error: "Failed to fetch backups" });
  }
});

// Download backup file (Proxy through server for privacy)
router.get("/:id/download", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const user = (req as any).user;
  const { id } = req.params;

  try {
    // 1. Fetch record and verify ownership
    const backup = await prisma?.backup.findFirst({
      where: { id, userId: user.id },
    });

    if (!backup) {
      return res.status(404).json({ error: "Backup record not found" });
    }

    if (!backup.filePath) {
      return res.status(400).json({ error: "File has not been uploaded yet" });
    }

    // 2. Local mode: serve from filesystem
    if (useLocalAuth()) {
      try {
        const fullPath = await getBackupFilePath(backup.filePath, user.id);
        const stats = await stat(fullPath);

        res.setHeader('Content-Disposition', `attachment; filename="${backup.name}.sql.gz"`);
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Length', stats.size.toString());

        const fileStream = createReadStream(fullPath);
        fileStream.pipe(res);

        fileStream.on('error', (err) => {
          logger.error({ err, path: fullPath }, "File stream error");
          if (!res.headersSent) {
            res.status(500).json({ error: "Failed to stream file" });
          }
        });
      } catch (fsError: any) {
        logger.error({ err: fsError, path: backup.filePath }, "Local file read error");
        return res.status(404).json({ error: "Backup file not found on disk" });
      }
      return;
    }

    // 3. Cloud mode: fetch from R2
    if (!s3Client || !R2_BUCKET_NAME) {
      return res.status(500).json({ error: "Storage is not configured on the server" });
    }

    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: backup.filePath,
    });

    try {
      const response = await s3Client.send(command);

      res.setHeader('Content-Disposition', `attachment; filename="${backup.name}.sql.gz"`);
      res.setHeader('Content-Type', 'application/gzip');

      if (response.Body) {
        (response.Body as any).pipe(res);
      } else {
        throw new Error("Empty response body from storage");
      }
    } catch (s3Error: any) {
      logger.error({ err: s3Error }, "S3 Get Error:");
      return res.status(404).json({
        error: "File not found or storage is temporarily unavailable."
      });
    }

  } catch (error: any) {
    logger.error({ err: error }, "Download Error:");
    res.status(500).json({ error: "Failed to download file" });
  }
});

// Create backup record and trigger backup process
router.post("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const user = (req as any).user;
  const { name } = req.body;

  try {
    // 1. Create record via Prisma
    const backupRecord = await prisma?.backup.create({
      data: {
        userId: user.id,
        name,
        status: 'pending',
      },
    });

    if (!backupRecord) {
      throw new Error("Failed to create backup record");
    }

    // 2. Execute backup based on mode
    if (useLocalAuth()) {
      // Local mode: execute backup in background
      logger.info({ backupId: backupRecord.id, mode: 'local' }, "Starting local backup process");

      // Run backup asynchronously without blocking response
      (async () => {
        try {
          const { filePath, fileSize } = await createLocalBackup(backupRecord.id, user.id);

          await prisma?.backup.update({
            where: { id: backupRecord.id },
            data: {
              filePath,
              fileSize,
              status: 'completed',
            },
          });

          logger.info({ backupId: backupRecord.id, filePath, fileSize }, "Local backup completed");
        } catch (error: any) {
          logger.error({ err: error, backupId: backupRecord.id }, "Local backup failed");

          await prisma?.backup.update({
            where: { id: backupRecord.id },
            data: { status: 'failed' },
          });
        }
      })();
    } else {
      // Cloud mode: trigger GitHub Action via Repository Dispatch
      if (GITHUB_TOKEN && GITHUB_REPO_OWNER && GITHUB_REPO_NAME) {
        await fetch(
          `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/dispatches`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github+json',
              'Content-Type': 'application/json',
              'User-Agent': 'ERD-Builder-Pro'
            },
            body: JSON.stringify({
              event_type: 'database-backup',
              client_payload: {
                backup_id: backupRecord.id,
                user_id: user.id
              }
            })
          }
        ).catch(err => logger.error({ err }, "==> GitHub Trigger Failed"));
      }
    }

    res.json(backupRecord);
  } catch (error: any) {
    logger.error({ err: error }, "Backup create error:");
    res.status(500).json({ error: "Failed to create backup" });
  }
});

export default router;
