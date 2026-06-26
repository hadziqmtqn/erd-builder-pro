import { exec } from "child_process";
import { promisify } from "util";
import { mkdir, access, stat as fsStat, unlink } from "fs/promises";
import { createReadStream, createWriteStream, renameSync } from "fs";
import { createGunzip, createGzip } from "zlib";
import { pipeline } from "stream/promises";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { logger } from "./logger.js";
import { isDesktopMode, isLocalPostgres } from "./config.js";
import { prisma } from "./prisma.js";
import Database from "better-sqlite3";

const execAsync = promisify(exec);

/**
 * App-specific folder name (display name) appended to user's home directory
 * when no custom backup folder is set.
 */
const APP_FOLDER_NAME = "ERD Builder Pro";

/**
 * Cross-platform default backup directory.
 * - macOS / Linux: `~/ERD Builder Pro`
 * - Windows: `~\Documents\ERD Builder Pro` (Windows convention)
 */
export function getDefaultBackupDir(): string {
  const home = os.homedir();
  if (process.platform === "win32") {
    return path.join(home, "Documents", APP_FOLDER_NAME);
  }
  return path.join(home, APP_FOLDER_NAME);
}

/**
 * Resolve the effective backup directory for a user.
 * - If user has a custom `backupFolder` in `UserPreference`, return that (resolved to absolute).
 * - Otherwise, return the OS-aware default (`~/ERD Builder Pro`).
 * - Null DB → default (no preference row yet).
 */
export async function getBackupDirForUser(userId: string): Promise<string> {
  try {
    const pref = await prisma?.userPreference.findUnique({
      where: { userId },
      select: { backupFolder: true },
    });
    const custom = pref?.backupFolder?.trim();
    if (custom) {
      // Resolve relative paths against the user's home directory.
      if (path.isAbsolute(custom)) return custom;
      return path.resolve(os.homedir(), custom);
    }
  } catch (err) {
    logger.error({ err, userId }, "Failed to read user backup preference");
  }
  return getDefaultBackupDir();
}

/**
 * Ensure the backup directory exists (creates it recursively if missing).
 */
export async function ensureBackupDir(dir: string): Promise<void> {
  try {
    await access(dir);
  } catch {
    await mkdir(dir, { recursive: true });
    logger.info({ path: dir }, "Created backup directory");
  }
}

/**
 * Create a database backup (SQLite or PostgreSQL)
 * Returns the absolute filesystem path of the gzipped backup file and its size.
 * The absolute path is stored in DB so the file is locatable even if the
 * user later changes their backup folder setting.
 */
export async function createLocalBackup(
  backupId: string,
  userId: string
): Promise<{ filePath: string; fileSize: number; fullPath: string }> {
  const backupDir = await getBackupDirForUser(userId);
  await ensureBackupDir(backupDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `backup_${backupId}_${timestamp}.sql.gz`;
  const outputPath = path.join(backupDir, filename);

  if (isDesktopMode()) {
    // SQLite backup
    return await backupSQLite(outputPath);
  } else if (isLocalPostgres()) {
    // PostgreSQL backup
    return await backupPostgreSQL(outputPath);
  } else {
    throw new Error("Local backup not supported for Supabase mode");
  }
}

/**
 * Backup SQLite database using better-sqlite3 (no CLI required)
 */
async function backupSQLite(
  outputPath: string
): Promise<{ filePath: string; fileSize: number; fullPath: string }> {
  const dbUrl = process.env.DATABASE_URL || "";

  // Extract file path from DATABASE_URL (e.g., "file:./data.db")
  let dbPath = dbUrl.replace(/^file:/, "").trim();
  if (!dbPath.endsWith(".db")) {
    throw new Error("Invalid SQLite DATABASE_URL format");
  }

  // Resolve relative path
  dbPath = path.resolve(process.cwd(), dbPath);

  logger.info({ dbPath, outputPath }, "Starting SQLite backup");

  try {
    // Check if database file exists
    await access(dbPath);

    // Create temporary backup using better-sqlite3 (no CLI required)
    const tempPath = outputPath.replace(".gz", "");

    const db = new Database(dbPath, { readonly: true });
    try {
      // Use SQLite backup API via better-sqlite3
      await db.backup(tempPath);
    } finally {
      db.close();
    }

    // Compress the backup
    await pipeline(
      createReadStream(tempPath),
      createGzip(),
      createWriteStream(outputPath)
    );

    // Delete temporary uncompressed file
    await unlink(tempPath);

    // Get file size
    const { size } = await fsStat(outputPath);

    logger.info({ outputPath, size }, "SQLite backup completed");

    return {
      filePath: outputPath,
      fileSize: size,
      fullPath: outputPath,
    };
  } catch (error: any) {
    logger.error({ err: error, dbPath }, "SQLite backup failed");
    throw new Error(`SQLite backup failed: ${error.message}`);
  }
}

/**
 * Strip Prisma-specific query parameters (e.g. `?schema=public`) from a
 * Postgres URL before passing it to `pg_dump` / `psql` — those CLIs reject
 * unknown query params with `invalid URI query parameter: "schema"`.
 * The schema is always `public` for our local PG setup.
 */
function pgUrlForCli(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.searchParams.delete("schema");
    return u.toString();
  } catch {
    // Fallback: simple regex strip
    return rawUrl.replace(/[?&]schema=[^&]*/g, "");
  }
}

/**
 * Backup PostgreSQL database
 */
async function backupPostgreSQL(
  outputPath: string
): Promise<{ filePath: string; fileSize: number; fullPath: string }> {
  const dbUrl = pgUrlForCli(process.env.DATABASE_URL || "");

  logger.info({ outputPath }, "Starting PostgreSQL backup");

  try {
    // Create temporary uncompressed backup using pg_dump
    const tempPath = outputPath.replace(".gz", "");

    // pg_dump will use DATABASE_URL environment variable
    await execAsync(`pg_dump "${dbUrl}" > "${tempPath}"`, {
      env: { ...process.env },
      maxBuffer: 1024 * 1024 * 100, // 100MB buffer
    });

    // Compress the backup
    await pipeline(
      createReadStream(tempPath),
      createGzip(),
      createWriteStream(outputPath)
    );

    // Delete temporary uncompressed file
    await unlink(tempPath);

    // Get file size
    const { size } = await fsStat(outputPath);

    logger.info({ outputPath, size }, "PostgreSQL backup completed");

    return {
      filePath: outputPath,
      fileSize: size,
      fullPath: outputPath,
    };
  } catch (error: any) {
    logger.error({ err: error }, "PostgreSQL backup failed");
    throw new Error(`PostgreSQL backup failed: ${error.message}`);
  }
}

/**
 * Get the filesystem path for a backup file.
 * Since `filePath` is now stored as an absolute path, this is a passthrough
 * (kept async for API stability with existing call sites).
 */
export async function getBackupFilePath(
  absolutePath: string,
  _userId: string
): Promise<string> {
  return absolutePath;
}

/**
 * Progress event emitted during `restoreLocalBackup`.
 * Phases (in order):
 *   - "pre-restore" : creating the safety backup of current state (0–25%)
 *   - "decompress"  : gunzip the backup file (25–40%)
 *   - "replace"     : overwrite the live DB (40–95%, with sub-progress for SQLite)
 *   - "cleanup"     : remove temp .decompressed file (95–100%)
 */
export type RestoreProgressPhase =
  | "pre-restore"
  | "decompress"
  | "replace"
  | "cleanup";

export interface RestoreProgressEvent {
  phase: RestoreProgressPhase;
  percent: number;        // 0–100
  message: string;
  // Optional sub-progress (e.g. SQLite page copy). Only set during 'replace'.
  current?: number;
  total?: number;
}

/**
 * Restore the database from a gzipped backup file.
 *
 * SAFETY: Before restoring, an automatic pre-restore backup of the current
 * state is created and stored in the same backup directory. If anything
 * goes wrong, the user can roll back by restoring that pre-restore backup.
 *
 * Returns the ID + name of the auto-created pre-restore record so the
 * client can surface it in the UI.
 *
 * If `onProgress` is provided, it is called at each phase milestone with a
 * `RestoreProgressEvent`. The `replace` phase for SQLite uses
 * better-sqlite3's native progress callback for page-level sub-progress.
 *
 * WARNING: This is destructive. The current database is replaced with
 * the backup contents. The user's session might be invalidated if the
 * restored user table no longer contains the current user — in that
 * case they'll need to log in again.
 *
 * Only supported in local mode (desktop SQLite / local PostgreSQL).
 */
export async function restoreLocalBackup(
  backupAbsolutePath: string,
  userId: string,
  onProgress?: (event: RestoreProgressEvent) => void,
  originalBackupId?: string
): Promise<{ autoBackupId: string; autoBackupName: string }> {
  // 1. Verify the backup file exists on disk
  try {
    await access(backupAbsolutePath);
  } catch {
    throw new Error("Backup file not found on disk");
  }

  if (!isDesktopMode() && !isLocalPostgres()) {
    throw new Error("Restore is only supported in local mode (desktop / local PostgreSQL)");
  }

  // 2. Create a pre-restore safety backup of the current state.
  //    If this fails, abort the restore — better to keep current data
  //    than to risk losing it with no rollback path.
  //
  //    We manage the DB record ourselves (instead of going through the
  //    /api/backups route) so we can synchronously wait for the backup
  //    to complete and verify success before proceeding with the restore.
  const autoBackupId = randomUUID();
  const autoBackupName = `PreRestore_${new Date()
    .toISOString()
    .slice(0, 19)
    .replace(/[T:]/g, "-")}`;

  onProgress?.({
    phase: "pre-restore",
    percent: 5,
    message: "Creating safety backup of current database...",
  });

  let autoBackupRecord = await prisma?.backup.create({
    data: {
      id: autoBackupId,
      userId,
      name: autoBackupName,
      status: "pending",
    },
  });

  try {
    const autoBackupResult = await createLocalBackup(autoBackupId, userId);
    autoBackupRecord = await prisma?.backup.update({
      where: { id: autoBackupId },
      data: {
        filePath: autoBackupResult.filePath,
        fileSize: autoBackupResult.fileSize,
        status: "completed",
        destinations: "local",
      },
    });
  } catch (err: any) {
    logger.error({ err, userId, autoBackupId }, "Pre-restore safety backup failed");
    if (prisma) {
      await prisma.backup.update({
        where: { id: autoBackupId },
        data: { status: "failed" },
      }).catch(() => {});
    }
    throw new Error(`Failed to create pre-restore safety backup: ${err.message}`);
  }

  if (!autoBackupRecord || autoBackupRecord.status !== "completed") {
    throw new Error("Pre-restore safety backup did not complete. Aborting restore.");
  }
  logger.info(
    { autoBackupId, autoBackupName, filePath: autoBackupRecord.filePath },
    "Pre-restore safety backup created"
  );
  onProgress?.({
    phase: "pre-restore",
    percent: 25,
    message: "Safety backup complete",
  });

  // 3. Decompress the backup to a temp file next to the original.
  //    Using `.decompressed` suffix (not `.db`) so it can't be mistaken
  //    for a valid backup if the restore is interrupted.
  const tempDbPath = `${backupAbsolutePath}.decompressed`;

  // Resolve the live SQLite db path at function scope so the finally
  // block (cleanup of atomic temp file + Prisma reconnect) can access it.
  let dbPath: string | null = null;
  if (isDesktopMode()) {
    const dbUrl = process.env.DATABASE_URL || "";
    const rawPath = dbUrl.replace(/^file:/, "").trim();
    if (!rawPath.endsWith(".db")) {
      throw new Error("Invalid SQLite DATABASE_URL format");
    }
    dbPath = path.resolve(process.cwd(), rawPath);
  }

  // Wrap the full destructive path (decompress + replace) in one try/catch
  // so any failure — corrupt gzip, bad SQL, locked DB file — is attributed
  // to the pre-restore safety backup, which the user can roll back to.
  try {
    onProgress?.({
      phase: "decompress",
      percent: 30,
      message: "Decompressing backup file...",
    });
    await pipeline(
      createReadStream(backupAbsolutePath),
      createGunzip(),
      createWriteStream(tempDbPath)
    );
    onProgress?.({
      phase: "decompress",
      percent: 40,
      message: "Decompression complete",
    });

    // 4. Disconnect Prisma. The current connection points at the file
    //    we're about to overwrite, so it must be released.
    //    Prisma's better-sqlite3 / pg adapter will lazy-reconnect on
    //    the next query after the restore completes.
    await prisma?.$disconnect();

    if (isDesktopMode()) {
      // ── SQLite: use better-sqlite3 backup API (safe, atomic copy) ──
      //    The `progress` callback fires periodically as pages are copied —
      //    we use it to emit real progress (45–95%) for the replace phase.
      logger.info(
        { tempDbPath, targetDb: dbPath },
        "Restoring SQLite database via atomic temp+rename"
      );

      onProgress?.({
        phase: "replace",
        percent: 45,
        message: "Replacing database...",
      });

      // Open the decompressed file as readonly, copy INTO a temp file
      // FIRST, then atomically rename to the live db path. This way,
      // if the process is killed mid-restore, the live db is NEVER
      // touched — the worst case is a partial `data.db.restore.new`
      // that the next restore will overwrite.
      const atomicTempPath = `${dbPath}.restore.new`;
      logger.info(
        { tempDbPath, atomicTempPath, targetDb: dbPath },
        "Restoring SQLite database via atomic temp+rename"
      );

      // Remove any leftover temp file from a previous interrupted restore
      try {
        await unlink(atomicTempPath);
      } catch {
        // doesn't exist — fine
      }

      const sourceDb = new Database(tempDbPath, { readonly: true });
      try {
        await sourceDb.backup(atomicTempPath, {
          progress: ({ totalPages, remainingPages }) => {
            // totalPages - remainingPages = pages already copied
            const done = Math.max(0, totalPages - remainingPages);
            const subPercent =
              totalPages > 0
                ? Math.min(100, Math.round((done / totalPages) * 100))
                : 0;
            // Map 0–100% sub-progress to 45–95% of overall restore
            const overall = 45 + Math.round(subPercent * 0.5);
            onProgress?.({
              phase: "replace",
              percent: overall,
              message: `Replacing database... ${done}/${totalPages} pages`,
              current: done,
              total: totalPages,
            });
            // Return 100 (= better-sqlite3's default rate, pages per
            // chunk). CRITICAL: returning 0 would set `rate = 0`, which
            // makes `sqlite3_backup_step(p, 0)` a no-op and stalls the
            // backup forever (this was the cause of the "stuck at 45%"
            // bug — the callback was returning 0).
            return 100;
          },
        });
      } finally {
        sourceDb.close();
      }

      // Sanity check: verify the new file is a valid SQLite db before
      // we swap it in. Catches corrupt/empty backups early.
      try {
        const verifyDb = new Database(atomicTempPath, { readonly: true });
        try {
          // Touch the file — if it's corrupt, this throws
          verifyDb.pragma("schema_version");
        } finally {
          verifyDb.close();
        }
      } catch (verifyErr: any) {
        // Clean up the bad temp file
        try {
          await unlink(atomicTempPath);
        } catch {}
        throw new Error(
          `Restored database appears to be corrupt: ${verifyErr.message}`
        );
      }

      onProgress?.({
        phase: "replace",
        percent: 95,
        message: "Activating restored database...",
      });

      // Atomic rename — on POSIX this is guaranteed atomic; on Windows
      // it's atomic if both paths are on the same volume (which they are).
      // renameSync will overwrite the destination if it exists.
      renameSync(atomicTempPath, dbPath!);
      logger.info(
        { dbPath },
        "SQLite restore: atomic rename complete, live db updated"
      );
    } else if (isLocalPostgres()) {
      // ── PostgreSQL: run the SQL dump via psql ──
      //    psql doesn't expose progress; we emit phase start/end only
      //    (45% → 95%) so the bar moves but percentage is approximate.
      const dbUrl = pgUrlForCli(process.env.DATABASE_URL || "");
      logger.info({ tempDbPath, dbUrl }, "Restoring PostgreSQL via psql");
      onProgress?.({
        phase: "replace",
        percent: 45,
        message: "Replacing database (this may take a while)...",
      });
      await execAsync(`psql "${dbUrl}" -f "${tempDbPath}" --quiet`, {
        env: { ...process.env },
        maxBuffer: 1024 * 1024 * 100,
      });
      onProgress?.({
        phase: "replace",
        percent: 95,
        message: "Database replaced",
      });
    }
  } catch (destructiveErr: any) {
    // The pre-restore safety backup is already on disk + DB at this point.
    // Surface its identity to the caller so the client can tell the user
    // "your current data is safe in pre-restore backup X" — even though
    // the destructive replace failed, the user can still roll back to it.
    logger.error(
      { err: destructiveErr, autoBackupId, autoBackupName },
      "Destructive restore step failed (pre-restore safety backup is intact)"
    );
    const wrapped: Error & { autoBackupId?: string; autoBackupName?: string } =
      new Error(
        `${destructiveErr.message}. ` +
        `Your current data is preserved in pre-restore backup "${autoBackupName}".`
      );
    wrapped.autoBackupId = autoBackupId;
    wrapped.autoBackupName = autoBackupName;
    throw wrapped;
  } finally {
    // 5. Cleanup the decompressed temp file (best-effort)
    try {
      await unlink(tempDbPath);
    } catch (err) {
      logger.warn({ err, tempDbPath }, "Failed to cleanup temp restore file");
    }
    // Also clean up any partial atomic temp file from a failed replace
    if (dbPath) {
      try {
        await unlink(`${dbPath}.restore.new`);
      } catch {
        // doesn't exist — fine
      }
    }
    // Re-establish Prisma connection. We called $disconnect() before
    // the replace so the SQLite file lock was released; the better-sqlite3
    // adapter should lazy-reconnect on the next query, but calling
    // $connect() explicitly is more reliable and surfaces errors early
    // (rather than failing on the user's first post-restore query).
    try {
      await prisma?.$connect();
      logger.info("Prisma reconnected after restore");

      // After the database was replaced, the backup record used for
      // restoration may now have a stale status from the backup snapshot
      // (e.g. "pending" instead of "completed"). Restore it back to
      // "completed" so the list reflects the correct state.
      if (originalBackupId) {
        try {
          await prisma?.backup.update({
            where: { id: originalBackupId },
            data: { status: "completed" },
          });
        } catch (statusErr) {
          // The backup record may not exist in the restored database
          // (e.g. it was created after the backup snapshot was taken).
          logger.warn(
            { err: statusErr, id: originalBackupId },
            "Could not restore backup status after DB replacement"
          );
        }
      }
    } catch (reconnectErr) {
      logger.error(
        { err: reconnectErr },
        "Failed to reconnect Prisma after restore — server may need restart"
      );
    }
    onProgress?.({
      phase: "cleanup",
      percent: 99,
      message: "Cleaning up...",
    });
  }

  onProgress?.({
    phase: "cleanup",
    percent: 100,
    message: "Restore complete",
  });
  logger.info(
    { backupAbsolutePath, autoBackupId, autoBackupName },
    "Database restore completed"
  );

  return { autoBackupId, autoBackupName };
}
