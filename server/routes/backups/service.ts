import { GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME, s3Client, R2_BUCKET_NAME, useLocalAuth } from "../../lib/config.js";
import { prisma } from "../../lib/prisma.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
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
import { access, stat } from "fs/promises";
import path from "path";

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

export async function streamR2File(key: string, name: string, res: any) {
  if (!s3Client || !R2_BUCKET_NAME) {
    throw new Error("Storage is not configured on the server");
  }

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });

  const response = await s3Client.send(command);

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
    await prisma?.backup.update({
      where: { id: backupId },
      data: { filePath, fileSize, status: "completed" },
    });
    logger.info({ backupId, filePath, fileSize }, "Local backup completed");
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
