import { GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME, s3Client, R2_BUCKET_NAME, useLocalAuth } from "../../lib/config.js";
import { prisma } from "../../lib/prisma.js";
import { GetObjectCommand, PutObjectCommand, S3Client as S3ClientType } from "@aws-sdk/client-s3";
import { logger } from "../../lib/logger.js";
import {
  createLocalBackup,
  getBackupFilePath,
  getDefaultBackupDir,
  getBackupDirForUser,
  ensureBackupDir,
  restoreLocalBackup,
} from "../../lib/local-backup.js";
import { createReadStream } from "fs";
import { access, readFile, stat } from "fs/promises";
import path from "path";
import { getStorageClientForUser } from "../../lib/storage.js";

// ── Folder Settings ──

export async function getFolder(userId: string) {
  const supportsLocalFolder = useLocalAuth();

  if (!supportsLocalFolder) {
    return {
      supports_local_folder: false,
      custom_folder: null,
      default_folder: null,
      effective_folder: null,
    };
  }

  const pref = await prisma?.userPreference.findUnique({
    where: { userId },
    select: { backupFolder: true },
  });

  const customFolder = pref?.backupFolder ?? null;
  const defaultFolder = getDefaultBackupDir();
  const effectiveFolder = await getBackupDirForUser(userId);

  return {
    supports_local_folder: true,
    custom_folder: customFolder,
    default_folder: defaultFolder,
    effective_folder: effectiveFolder,
  };
}

export async function updateFolder(userId: string, folder: string | null) {
  const normalized = folder?.trim() ? folder.trim() : null;
  let resolvedPath: string | null = null;

  if (normalized) {
    // Reject shell metacharacters
    if (/[`$\\;<>|&]/.test(normalized)) {
      throw new Error("Folder path contains invalid characters");
    }
    resolvedPath = path.isAbsolute(normalized)
      ? path.normalize(normalized)
      : path.resolve(require("os").homedir(), normalized);

    try {
      await ensureBackupDir(resolvedPath);
      await stat(resolvedPath);
    } catch (dirErr: any) {
      throw new Error(`Cannot access or create folder: ${dirErr.message}`);
    }
  }

  await prisma?.userPreference.upsert({
    where: { userId },
    update: { backupFolder: resolvedPath },
    create: { userId, backupFolder: resolvedPath },
  });

  const effectiveFolder = await getBackupDirForUser(userId);

  return {
    custom_folder: resolvedPath,
    default_folder: getDefaultBackupDir(),
    effective_folder: effectiveFolder,
  };
}

// ── Backup CRUD ──

export async function listBackups(userId: string, limit: number, offset: number) {
  const [data, total] = await Promise.all([
    prisma?.backup.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    }) || Promise.resolve([]),
    prisma?.backup.count({ where: { userId } }) || Promise.resolve(0),
  ]);
  return { data, total };
}

export async function getBackupRecord(backupId: string, userId: string) {
  return prisma?.backup.findFirst({
    where: { id: backupId, userId },
  });
}

export async function createBackupRecord(userId: string, name: string) {
  return prisma?.backup.create({
    data: { userId, name, status: "pending" },
  });
}

export async function streamLocalFile(filePath: string, userId: string, name: string, res: any) {
  const fullPath = await getBackupFilePath(filePath, userId);
  const stats = await stat(fullPath);

  res.setHeader("Content-Disposition", `attachment; filename="${name}.sql.gz"`);
  res.setHeader("Content-Type", "application/gzip");
  res.setHeader("Content-Length", stats.size.toString());

  return new Promise<void>((resolve, reject) => {
    const fileStream = createReadStream(fullPath);
    fileStream.pipe(res);
    fileStream.on("error", reject);
    fileStream.on("end", resolve);
  });
}

export async function streamR2File(key: string, name: string, res: any, overrides?: { client: S3ClientType; bucketName: string }) {
  const client = overrides?.client ?? s3Client;
  const bucket = overrides?.bucketName ?? R2_BUCKET_NAME;
  if (!client || !bucket) {
    throw new Error("Storage is not configured on the server");
  }

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const response = await client.send(command);

  res.setHeader("Content-Disposition", `attachment; filename="${name}.sql.gz"`);
  res.setHeader("Content-Type", "application/gzip");

  if (!response.Body) {
    throw new Error("Empty response body from storage");
  }

  return new Promise<void>((resolve, reject) => {
    (response.Body as any).pipe(res);
    (response.Body as any).on("error", reject);
    (response.Body as any).on("end", resolve);
  });
}

export async function executeLocalBackup(backupId: string, userId: string) {
  logger.info({ backupId, mode: "local" }, "Starting local backup process");
  try {
    const { filePath, fileSize } = await createLocalBackup(backupId, userId);
    logger.info({ backupId, filePath, fileSize }, "Local backup completed");

    // Build destinations list — always 'local', add 'cloud' if upload succeeds
    const destinations: string[] = ['local'];

    // Upload to storage if configured — resolves from DB config, falls back to env vars
    let uploadClient: S3ClientType | null = null;
    let uploadBucket: string | null = null;

    const userStorage = await getStorageClientForUser(userId, prisma);
    if (userStorage) {
      uploadClient = userStorage.client;
      uploadBucket = userStorage.bucketName;
    } else if (s3Client && R2_BUCKET_NAME) {
      uploadClient = s3Client;
      uploadBucket = R2_BUCKET_NAME;
    }

    if (uploadClient && uploadBucket) {
      const r2Key = `backups/${backupId}.sql.gz`;
      try {
        const fileBuffer = await readFile(filePath);
        await uploadClient.send(
          new PutObjectCommand({
            Bucket: uploadBucket,
            Key: r2Key,
            Body: fileBuffer,
            ContentType: "application/gzip",
          })
        );
        destinations.push('cloud');
        logger.info({ backupId, key: r2Key }, "Storage upload completed");
      } catch (r2Err: any) {
        logger.error({ err: r2Err, backupId }, "Storage upload failed (local backup preserved)");
      }
    }

    // Update record with final status and destinations
    await prisma?.backup.update({
      where: { id: backupId },
      data: { filePath, fileSize, status: "completed", destinations: destinations.join(',') },
    });
  } catch (error: any) {
    logger.error({ err: error, backupId }, "Local backup failed");
    await prisma?.backup.update({
      where: { id: backupId },
      data: { status: "failed" },
    });
  }
}

export async function triggerCloudBackup(backupId: string, userId: string) {
  if (GITHUB_TOKEN && GITHUB_REPO_OWNER && GITHUB_REPO_NAME) {
    await fetch(
      `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "ERD-Builder-Pro",
        },
        body: JSON.stringify({
          event_type: "database-backup",
          client_payload: { backup_id: backupId, user_id: userId },
        }),
      }
    ).catch((err) => logger.error({ err }, "==> GitHub Trigger Failed"));
  }
}

// ── Restore ──

export async function verifyRestoreFile(filePath: string) {
  try {
    await access(filePath);
  } catch {
    throw new Error("Backup file not found on disk");
  }
}

export async function performRestore(backupId: string, filePath: string, userId: string, onProgress: (progress: any) => void) {
  const { autoBackupId, autoBackupName } = await restoreLocalBackup(
    filePath, userId, onProgress, backupId
  );
  return { autoBackupId, autoBackupName };
}
