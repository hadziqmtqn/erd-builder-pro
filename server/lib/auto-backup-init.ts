import { prisma } from './prisma.js';
import { isDesktopMode, isLocalPostgres } from './config.js';
import { startAutoBackupScheduler } from './auto-backup.js';
import { logger } from './logger.js';

/**
 * Initialize auto-backup scheduler on server startup.
 * Only runs in desktop / local PG mode (not Supabase cloud).
 */
export async function initAutoBackupScheduler(): Promise<void> {
  if (!isDesktopMode() && !isLocalPostgres()) return;
  if (!prisma) return;

  try {
    // Find the local user who has auto-backup enabled
    const prefs = await prisma.userPreference.findMany({
      where: { autoBackupEnabled: true },
      select: { userId: true },
      take: 1,
    });

    if (prefs.length > 0) {
      await startAutoBackupScheduler(prefs[0].userId);
      logger.info({ userId: prefs[0].userId }, 'Auto-backup scheduler started on server init');
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to init auto-backup scheduler');
  }
}
