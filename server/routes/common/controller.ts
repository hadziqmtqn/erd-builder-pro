import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { s3Client, R2_BUCKET_NAME, R2_PUBLIC_URL, R2_ACCOUNT_ID } from "../../lib/config.js";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "../../lib/logger.js";
import { fetchTrashItems } from "./service.js";

export async function getTrash(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  const userId = (req as any).user.id;
  try {
    const result = await fetchTrashItems(userId);
    res.json(result);
  } catch (err: any) {
    logger.error({ err }, "Trash fetch error:");
    res.status(500).json({ error: "Failed to fetch trash items" });
  }
}

export async function testR2(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  if (!s3Client || !R2_BUCKET_NAME) {
    res.status(500).json({
      error: "Cloudflare R2 is not configured correctly.",
      config: {
        accountId: !!R2_ACCOUNT_ID,
        accessKeyId: !!process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: !!process.env.R2_SECRET_ACCESS_KEY,
        bucketName: !!R2_BUCKET_NAME,
      },
    });
    return;
  }

  try {
    const testKey = `test-connection-${Date.now()}.txt`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: testKey,
        Body: "Connection test",
        ContentType: "text/plain",
      })
    );

    res.json({
      success: true,
      message: "Successfully connected to Cloudflare R2.",
      bucket: R2_BUCKET_NAME,
      testFile: testKey,
      publicUrl: R2_PUBLIC_URL || "Not configured",
    });
  } catch (err: any) {
    logger.error({ err: err }, "R2 Test Error:");
    res.status(500).json({ error: "Failed to connect to storage" });
  }
}

export async function uploadFile(req: any, res: ExpressResponse): Promise<void> {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  if (!s3Client || !R2_BUCKET_NAME) {
    res.status(500).json({ error: "Cloudflare R2 is not configured." });
    return;
  }

  try {
    const feature = req.body.feature || "general";
    const file = req.file;
    const path = await import("node:path");
    const fileExt = path.extname(file.originalname);
    const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${fileExt}`;
    const r2Key = `erd-builder-pro/${feature}/${fileName}`;

    await s3Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2Key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }));

    const publicUrl = R2_PUBLIC_URL
      ? `${R2_PUBLIC_URL.replace(/\\n/g, "").replace(/\\r/g, "").trim().replace(/\/$/, "")}/${r2Key}`
      : `https://${R2_BUCKET_NAME}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${r2Key}`;

    res.json({ url: publicUrl, key: r2Key });
  } catch (err: any) {
    logger.error({ err: err }, "Cloudflare R2 upload error:");
    res.status(500).json({ error: "Failed to upload file" });
  }
}

export async function deleteFile(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  const { key } = req.body;
  if (!key) { res.status(400).json({ error: "No key provided" }); return; }

  if (!key.startsWith("erd-builder-pro/")) {
    res.status(403).json({ error: "Invalid file key" });
    return;
  }

  if (!s3Client || !R2_BUCKET_NAME) {
    res.status(500).json({ error: "Cloudflare R2 is not configured." });
    return;
  }

  try {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    }));
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ err: err }, "Cloudflare R2 delete error:");
    res.status(500).json({ error: "Failed to delete file" });
  }
}
