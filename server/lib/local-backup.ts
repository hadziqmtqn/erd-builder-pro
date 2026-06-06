import { exec } from "child_process";
import { promisify } from "util";
import { mkdir, access, stat as fsStat, unlink } from "fs/promises";
import { createReadStream, createWriteStream } from "fs";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";
import path from "path";
import os from "os";
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
 * Backup PostgreSQL database
 */
async function backupPostgreSQL(
  outputPath: string
): Promise<{ filePath: string; fileSize: number; fullPath: string }> {
  const dbUrl = process.env.DATABASE_URL || "";

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
