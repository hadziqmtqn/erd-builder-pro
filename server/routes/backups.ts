import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME, s3Client, R2_BUCKET_NAME } from "../lib/config.js";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../lib/middleware.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "../lib/logger.js";

const router = Router();

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

    if (!s3Client || !R2_BUCKET_NAME) {
      return res.status(500).json({ error: "Storage is not configured on the server" });
    }

    // 2. Fetch from R2
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: backup.filePath,
    });

    try {
      const response = await s3Client.send(command);
      
      // 3. Stream to response
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

// Create backup record and trigger GitHub Action
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

    // 2. Trigger GitHub Action via Repository Dispatch
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

    res.json(backupRecord);
  } catch (error: any) {
    logger.error({ err: error }, "Backup create error:");
    res.status(500).json({ error: "Failed to create backup" });
  }
});

export default router;
