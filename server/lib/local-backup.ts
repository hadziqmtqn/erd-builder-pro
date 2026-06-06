import { exec } from "child_process";
import { promisify } from "util";
import { mkdir, copyFile, access, stat as fsStat, unlink } from "fs/promises";
import { createReadStream, createWriteStream } from "fs";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";
import path from "path";
import { logger } from "./logger.js";
import { isDesktopMode, isLocalPostgres } from "./config.js";
import Database from "better-sqlite3";

const execAsync = promisify(exec);

export const BACKUPS_DIR = path.resolve(process.cwd(), "backups");

/**
 * Ensure backups directory exists
 */
export async function ensureBackupsDir(): Promise<void> {
  try {
    await access(BACKUPS_DIR);
  } catch {
    await mkdir(BACKUPS_DIR, { recursive: true });
    logger.info({ path: BACKUPS_DIR }, "Created backups directory");
  }
}

/**
 * Create a database backup (SQLite or PostgreSQL)
 * Returns the path to the gzipped backup file
 */
export async function createLocalBackup(
  backupId: string,
  userId: string
): Promise<{ filePath: string; fileSize: number }> {
  await ensureBackupsDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `backup_${backupId}_${timestamp}.sql.gz`;
  const outputPath = path.join(BACKUPS_DIR, filename);

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
async function backupSQLite(outputPath: string): Promise<{ filePath: string; fileSize: number }> {
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
      filePath: path.relative(BACKUPS_DIR, outputPath),
      fileSize: size,
    };
  } catch (error: any) {
    logger.error({ err: error, dbPath }, "SQLite backup failed");
    throw new Error(`SQLite backup failed: ${error.message}`);
  }
}

/**
 * Backup PostgreSQL database
 */
async function backupPostgreSQL(outputPath: string): Promise<{ filePath: string; fileSize: number }> {
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
      filePath: path.relative(BACKUPS_DIR, outputPath),
      fileSize: size,
    };
  } catch (error: any) {
    logger.error({ err: error }, "PostgreSQL backup failed");
    throw new Error(`PostgreSQL backup failed: ${error.message}`);
  }
}

/**
 * Get the full path to a backup file
 */
export function getBackupFilePath(relativePath: string): string {
  return path.join(BACKUPS_DIR, relativePath);
}
