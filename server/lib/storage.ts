import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from "./logger.js";
import type { Response } from "express";

/** Shape of storage config stored in UserPreference.storageConfig */
export interface StorageConfig {
  type: "r2" | "s3-compatible";
  /** R2 Account ID (only for R2) */
  accountId?: string;
  /** S3-compatible endpoint URL (only for s3-compatible) */
  endpoint?: string;
  /** S3 region (default: "auto" for R2, "us-east-1" for S3) */
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  /** Optional public URL prefix (e.g., https://cdn.example.com) */
  publicUrl?: string;
}

/**
 * Build an S3 client from a storage config object.
 * Supports both Cloudflare R2 and generic S3-compatible providers.
 */
export function buildS3Client(config: StorageConfig): S3Client {
  if (config.type === "r2") {
    const accountId = config.accountId?.includes(".r2.cloudflarestorage.com")
      ? config.accountId.split(".")[0].replace("https://", "")
      : config.accountId || "";

    return new S3Client({
      region: config.region || "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: false,
    });
  }

  // S3-compatible
  return new S3Client({
    region: config.region || "us-east-1",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  });
}

/**
 * Upload a file buffer to S3/R2.
 * Objects stay private (default bucket policy) — access via proxy or signed URL.
 *
 * Returns the URL to use for accessing the file.
 * For public storage (publicUrl configured): returns direct URL.
 * For private storage: returns the proxy URL (same-origin, no expiry).
 */
export async function uploadToS3(
  s3: S3Client,
  config: StorageConfig,
  feature: string,
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string,
  originHost?: string,
): Promise<string> {
  const r2Key = `erd-builder-pro/${feature}/${fileName}`;

  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: r2Key,
    Body: fileBuffer,
    ContentType: mimeType,
    // No ACL — objects inherit bucket default (private by design)
  });

  await s3.send(command);

  // If a publicUrl is explicitly configured, use it (public CDN / R2 public bucket)
  if (config.publicUrl) {
    const base = config.publicUrl.replace(/\\n/g, "").replace(/\\r/g, "").trim().replace(/\/$/, "");
    return `${base}/${r2Key}`;
  }

  // No publicUrl → use proxy URL (works for both R2 and S3-compatible private storage)
  if (originHost) {
    const base = originHost.replace(/\/$/, "");
    return `${base}/api/serve/${r2Key}`;
  }

  // Fallback: return just the key — caller must construct proxy URL
  return r2Key;
}

/**
 * Delete a file from S3/R2.
 */
export async function deleteFromS3(
  s3: S3Client,
  config: StorageConfig,
  key: string,
): Promise<void> {
  await s3.send(new DeleteObjectCommand({
    Bucket: config.bucketName,
    Key: key,
  }));
}

/**
 * Generate a pre-signed URL for reading a private object from S3/R2.
 * The URL is time-limited — the caller must refresh before expiry.
 *
 * @param expiresIn Seconds until the URL expires (default: 3600 = 1 hour)
 */
export async function generateSignedUrl(
  s3: S3Client,
  config: StorageConfig,
  key: string,
  expiresIn: number = 3600,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: key,
  });

  return getSignedUrl(s3 as any, command, { expiresIn });
}

/**
 * Stream a file from S3/R2 directly to an Express Response.
 * Sets Content-Type and Cache-Control headers from the S3 response.
 * Use this as a proxy fallback when direct URLs or signed URLs aren't suitable.
 */
export async function serveFromS3(
  s3: S3Client,
  config: StorageConfig,
  key: string,
  res: Response,
): Promise<void> {
  const command = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: key,
  });

  const response = await s3.send(command);

  // Forward Content-Type from S3, or infer from key extension
  const contentType = response.ContentType || guessMimeType(key);
  res.setHeader("Content-Type", contentType);

  // Allow cross-origin loading (page may be on different port)
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  // Cache: 1 hour in browser, 1 day CDN (files are immutable by key)
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");

  // Forward Content-Length if available
  if (response.ContentLength) {
    res.setHeader("Content-Length", response.ContentLength);
  }

  if (!response.Body) {
    res.status(404).json({ error: "File not found in storage" });
    return;
  }

  // Stream the S3 response body to Express response using Node.js streams
  // AWS SDK v3 returns a Node.js Readable stream, not a web ReadableStream
  const nodeStream = response.Body as import("stream").Readable;
  nodeStream.pipe(res);
}

/** Infer a MIME type from a file extension. */
function guessMimeType(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() || "";
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    txt: "text/plain",
    json: "application/json",
    gz: "application/gzip",
    zip: "application/zip",
  };
  return mimeMap[ext] || "application/octet-stream";
}

/**
 * Test a storage connection by uploading and fetching a test file.
 */
export async function testStorageConnection(
  s3: S3Client,
  config: StorageConfig,
): Promise<{ success: boolean; testFile?: string; error?: string }> {
  const testKey = `test-connection-${Date.now()}.txt`;
  try {
    await s3.send(new PutObjectCommand({
      Bucket: config.bucketName,
      Key: testKey,
      Body: "Connection test",
      ContentType: "text/plain",
    }));

    await s3.send(new DeleteObjectCommand({
      Bucket: config.bucketName,
      Key: testKey,
    }));

    return { success: true, testFile: testKey };
  } catch (err: any) {
    logger.error({ err }, "Storage connection test failed:");
    return { success: false, error: err.message || "Connection failed" };
  }
}

/**
 * Try loading storage config from a provided async function (e.g. DB query).
 * If env vars are set, those take precedence.
 */
export function getEnvStorageConfig(): StorageConfig | null {
  const r2AccountId = process.env.R2_ACCOUNT_ID || "";
  const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID || "";
  const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
  const r2BucketName = process.env.R2_BUCKET_NAME || "";

  if (r2AccountId && r2AccessKeyId && r2SecretAccessKey && r2BucketName) {
    return {
      type: "r2",
      accountId: r2AccountId,
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
      bucketName: r2BucketName,
      publicUrl: process.env.R2_PUBLIC_URL || undefined,
    };
  }

  return null;
}

/**
 * Resolve S3 client + bucket from a user's DB-stored storage config.
 * Returns null if user has no configured storage.
 * Caller must ensure `prisma` is available.
 */
export async function getStorageClientForUser(
  userId: string | number,
  prisma: any,
): Promise<{ client: S3Client; bucketName: string } | null> {
  try {
    const pref = await (prisma as any).userPreference.findUnique({
      where: { userId },
      select: { storageConfig: true },
    });
    if (pref?.storageConfig) {
      const parsed: StorageConfig = JSON.parse(pref.storageConfig);
      if (parsed.accessKeyId && parsed.secretAccessKey && parsed.bucketName) {
        return {
          client: buildS3Client(parsed),
          bucketName: parsed.bucketName,
        };
      }
    }
  } catch {
    // ignore parse errors
  }
  return null;
}
