import { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { StorageConfig, buildS3Client, testStorageConnection, getEnvStorageConfig, serveFromS3 } from "../../lib/storage.js";

/**
 * GET /api/storage/config
 * Returns the current storage configuration (masking secrets).
 */
export async function getStorageConfig(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!prisma) {
    res.status(503).json({ error: "Database not available" });
    return;
  }

  try {
    const pref = await (prisma as any).userPreference.findUnique({
      where: { userId },
    });

    let config: StorageConfig | null = null;
    let source: 'env' | 'db' | 'none' = 'none';

    // Prefer DB-stored config (user explicitly saved this)
    if (pref?.storageConfig) {
      try {
        config = JSON.parse(pref.storageConfig);
        source = 'db';
      } catch {
        // Invalid JSON stored
        config = null;
      }
    }

    // Fallback to env vars if no DB config
    if (!config) {
      const envConfig = getEnvStorageConfig();
      if (envConfig) {
        config = envConfig;
        source = 'env';
      }
    }

    // Return masked config (hide secrets)
    const maskedConfig = config
      ? {
          ...config,
          secretAccessKey: config.secretAccessKey ? "***" : "",
          accessKeyId: config.accessKeyId ? config.accessKeyId.slice(0, 4) + "***" : "",
        }
      : null;

    res.json({
      config: maskedConfig,
      source,
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to load storage config");
    res.status(500).json({ error: "Failed to load storage configuration" });
  }
}

/**
 * POST /api/storage/config
 * Saves storage configuration to the database.
 */
/**
 * Resolve masked credential values from existing DB config or env vars.
 * Returns { accessKeyId, secretAccessKey } with real (unmasked) values.
 */
async function resolveCredentials(
  userId: string | number,
  accessKeyId: string,
  secretAccessKey: string,
): Promise<{ accessKeyId: string; secretAccessKey: string }> {
  let resolvedSecretKey = secretAccessKey;
  let resolvedAccessKey = accessKeyId;

  // 1) Try existing DB record first
  if (prisma) {
    try {
      const existing = await (prisma as any).userPreference.findUnique({
        where: { userId },
      });
      if (existing?.storageConfig) {
        const existingConfig: StorageConfig = JSON.parse(existing.storageConfig);
        if (!secretAccessKey || secretAccessKey === "***") {
          resolvedSecretKey = existingConfig.secretAccessKey;
        }
        if (!accessKeyId || accessKeyId.endsWith("***")) {
          resolvedAccessKey = existingConfig.accessKeyId;
        }
      }
    } catch {
      // If parsing fails, use the provided values as-is
    }
  }

  // 2) Fallback to env vars if still masked (first-time save from env)
  if (
    resolvedAccessKey.endsWith("***") ||
    resolvedSecretKey === "***"
  ) {
    const envConfig = getEnvStorageConfig();
    if (envConfig) {
      if (resolvedAccessKey.endsWith("***")) resolvedAccessKey = envConfig.accessKeyId;
      if (resolvedSecretKey === "***") resolvedSecretKey = envConfig.secretAccessKey;
    }
  }

  return { accessKeyId: resolvedAccessKey, secretAccessKey: resolvedSecretKey };
}

export async function saveStorageConfig(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!prisma) {
    res.status(503).json({ error: "Database not available" });
    return;
  }

  const { type, accountId, endpoint, region, accessKeyId, secretAccessKey, bucketName, publicUrl } = req.body;

  // ── Resolve masked/empty secrets from existing config or env vars ──
  const resolved = await resolveCredentials(userId, accessKeyId || "", secretAccessKey || "");
  let resolvedAccessKey = resolved.accessKeyId;
  let resolvedSecretKey = resolved.secretAccessKey;

  // ── Validate required fields (on resolved values) ──
  if (!type || !["r2", "s3-compatible"].includes(type)) {
    res.status(400).json({ error: "Storage type must be 'r2' or 's3-compatible'" });
    return;
  }

  if (type === "r2" && !accountId) {
    res.status(400).json({ error: "Account ID is required for Cloudflare R2" });
    return;
  }

  if (type === "s3-compatible" && !endpoint) {
    res.status(400).json({ error: "Endpoint URL is required for S3-compatible storage" });
    return;
  }

  if (!resolvedAccessKey || !resolvedSecretKey || !bucketName) {
    res.status(400).json({ error: "Access Key ID, Secret Access Key, and Bucket Name are required" });
    return;
  }

  const config: StorageConfig = {
    type,
    ...(type === "r2" ? { accountId } : { endpoint, region: region || "us-east-1" }),
    accessKeyId: resolvedAccessKey,
    secretAccessKey: resolvedSecretKey,
    bucketName,
    ...(publicUrl ? { publicUrl } : {}),
  };

  try {
    await (prisma as any).userPreference.upsert({
      where: { userId },
      create: {
        userId,
        storageConfig: JSON.stringify(config),
      },
      update: {
        storageConfig: JSON.stringify(config),
      },
    });

    res.json({ success: true, message: "Storage configuration saved" });
  } catch (err: any) {
    logger.error({ err }, "Failed to save storage config");
    res.status(500).json({ error: "Failed to save storage configuration" });
  }
}

/**
 * POST /api/storage/test
 * Tests the storage connection using the provided or saved config.
 */
export async function testStorageConnectionHandler(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!prisma) {
    res.status(503).json({ error: "Database not available" });
    return;
  }

  let config: StorageConfig | null = null;

  // Use provided config from request body (resolve masked credentials)
  if (req.body.type) {
    const resolved = await resolveCredentials(userId, req.body.accessKeyId || "", req.body.secretAccessKey || "");
    config = {
      type: req.body.type,
      ...(req.body.type === "r2" ? { accountId: req.body.accountId } : { endpoint: req.body.endpoint, region: req.body.region || "us-east-1" }),
      accessKeyId: resolved.accessKeyId,
      secretAccessKey: resolved.secretAccessKey,
      bucketName: req.body.bucketName,
      ...(req.body.publicUrl ? { publicUrl: req.body.publicUrl } : {}),
    };
  } else {
    // Load from DB first
    try {
      const pref = await (prisma as any).userPreference.findUnique({
        where: { userId },
      });
      if (pref?.storageConfig) {
        config = JSON.parse(pref.storageConfig);
      }
    } catch {
      // ignore
    }

    // Fallback to env vars
    if (!config) {
      const envConfig = getEnvStorageConfig();
      if (envConfig) {
        config = envConfig;
      }
    }
  }

  if (!config) {
    res.status(400).json({ error: "No storage configuration found. Please configure storage first." });
    return;
  }

  try {
    const s3 = buildS3Client(config);
    const result = await testStorageConnection(s3, config);

    if (result.success) {
      res.json({ success: true, message: "Successfully connected to storage" });
    } else {
      res.status(500).json({ error: result.error || "Connection failed" });
    }
  } catch (err: any) {
    logger.error({ err }, "Storage test error:");
    res.status(500).json({ error: err.message || "Connection failed" });
  }
}

/**
 * GET /api/storage/proxy
 * Serves a file from S3-compatible storage (via proxy) for private buckets.
 * Used when direct URLs don't work (S3-compatible with private bucket).
 * Requires authentication token as query param for cross-origin <img> tags.
 * Query params:
 *   key — S3 object key (e.g. "erd-builder-pro/notes/123.png")
 */
export async function proxyFile(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const key = req.query.key as string;
  if (!key || !key.startsWith("erd-builder-pro/")) {
    res.status(400).json({ error: "Invalid file key" });
    return;
  }

  if (!prisma) {
    res.status(503).json({ error: "Database not available" });
    return;
  }

  // Resolve storage config
  let config: StorageConfig | null = null;

  try {
    const pref = await (prisma as any).userPreference.findUnique({
      where: { userId },
    });

    if (pref?.storageConfig) {
      config = JSON.parse(pref.storageConfig);
    }
  } catch {
    // ignore
  }

  // Fallback to env vars
  if (!config) {
    config = getEnvStorageConfig();
  }

  if (!config) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }

  try {
    const s3 = buildS3Client(config);
    await serveFromS3(s3, config, key, res);
  } catch (err: any) {
    logger.error({ err, key }, "Storage proxy error:");
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to serve file" });
    }
  }
}
