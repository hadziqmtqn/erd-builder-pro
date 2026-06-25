import { prisma } from '../lib/prisma.js';
import { createLocalBackup } from '../lib/local-backup.js';
import { s3Client, R2_BUCKET_NAME } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { unlink, readFile } from 'fs/promises';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

type AutoBackupSettings = {
  enabled: boolean;
  intervalMinutes: number;
  retentionCount: number;
};

/**
 * Global interval handle so we can stop/restart the scheduler
 * when the user changes settings without restarting the server.
 */
let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let currentUserId: string | null = null;

// ── Read settings from DB ──

async function loadSettings(userId: string): Promise<AutoBackupSettings> {
  const pref = await prisma?.userPreference.findUnique({
    where: { userId },
    select: {
      autoBackupEnabled: true,
      autoBackupInterval: true,
      autoBackupRetention: true,
    },
  });

  return {
    enabled: pref?.autoBackupEnabled ?? false,
    intervalMinutes: Math.floor((pref?.autoBackupInterval ?? 3600) / 60),
    retentionCount: pref?.autoBackupRetention ?? 10,
  };
}

// ── Run one backup tick ──

async function performAutoBackup(userId: string): Promise<void> {
  try {
    const settings = await loadSettings(userId);
    if (!settings.enabled) return;

    logger.info({ userId }, 'Auto-backup: starting');

    // 1. Create backup record
    const backupId = randomUUID();
    const name = `AutoBackup_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '_')}`;

    await prisma?.backup.create({
      data: { id: backupId, userId, name, status: 'pending' },
    });

    // 2. Execute local backup
    const { filePath, fileSize } = await createLocalBackup(backupId, userId);
    await prisma?.backup.update({
      where: { id: backupId },
      data: { filePath, fileSize, status: 'completed' },
    });

    logger.info({ backupId, fileSize }, 'Auto-backup: local completed');

    // 3. Upload to R2 if configured
    if (s3Client && R2_BUCKET_NAME) {
      try {
        const fileBuffer = await readFile(filePath);
        const key = `backups/${backupId}.sql.gz`;
        await s3Client.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: key,
            Body: fileBuffer,
            ContentType: 'application/gzip',
          })
        );
        logger.info({ backupId, key }, 'Auto-backup: R2 upload completed');
      } catch (r2Err: any) {
        logger.error({ err: r2Err, backupId }, 'Auto-backup: R2 upload failed (local backup preserved)');
      }
    }

    // 4. Cleanup old backups exceeding retention
    await enforceRetention(userId, settings.retentionCount);
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Auto-backup: failed');
  }
}

// ── Retention: keep only N most recent backups ──

async function enforceRetention(userId: string, maxCount: number): Promise<void> {
  try {
    const backups = await prisma?.backup.findMany({
      where: { userId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, filePath: true },
      skip: maxCount,
    });

    if (!backups || backups.length === 0) return;

    for (const b of backups) {
      // Delete local file
      if (b.filePath) {
        try {
          await unlink(b.filePath);
        } catch {
          // file may already be gone
        }
      }
      // Delete DB record
      await prisma?.backup.delete({ where: { id: b.id } }).catch(() => {});
    }

    logger.info({ count: backups.length }, 'Auto-backup: cleaned up old backups');
  } catch (error: any) {
    logger.error({ err: error }, 'Auto-backup: retention cleanup failed');
  }
}

// ── Scheduler control ──

export function startAutoBackupScheduler(userId: string): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
  }

  currentUserId = userId;

  // Run immediately (first tick), then on interval
  // We check settings inside each tick, so changing settings takes effect
  // on the next tick without restarting the scheduler.
  void performAutoBackup(userId);

  schedulerTimer = setInterval(() => {
    void performAutoBackup(userId);
  }, 60_000); // Check every minute — the actual interval is enforced inside the tick
}

export function stopAutoBackupScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  currentUserId = null;
  logger.info('Auto-backup scheduler stopped');
}

export function isSchedulerRunning(): boolean {
  return schedulerTimer !== null;
}
