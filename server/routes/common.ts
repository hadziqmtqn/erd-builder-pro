import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase, s3Client, R2_BUCKET_NAME, R2_PUBLIC_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } from "../lib/config.js";
import { authenticate } from "../lib/middleware.js";
import { validate, uploadSchema, deleteUploadSchema } from "../lib/validation.js";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import multer from "multer";
import path from "node:path";

const router = Router();

const ALLOWED_MIME_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  },
});

// Trash API — scoped to authenticated user
router.get("/trash", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const userId = (req as any).user.id;
  const { data: diagrams } = await supabase.from("diagrams").select("*, projects!left(name)").eq("is_deleted", true).eq("user_id", userId).order("deleted_at", { ascending: false });
  const { data: notes } = await supabase.from("notes").select("*, projects!left(name)").eq("is_deleted", true).eq("user_id", userId).order("deleted_at", { ascending: false });
  const { data: drawings } = await supabase.from("drawings").select("*, projects!left(name)").eq("is_deleted", true).eq("user_id", userId).order("deleted_at", { ascending: false });
  const { data: flowcharts } = await supabase.from("flowcharts").select("*, projects!left(name)").eq("is_deleted", true).eq("user_id", userId).order("deleted_at", { ascending: false });
  const { data: projects } = await supabase.from("projects").select("*").eq("is_deleted", true).eq("user_id", userId).order("deleted_at", { ascending: false });
  res.json({ diagrams: diagrams || [], notes: notes || [], drawings: drawings || [], flowcharts: flowcharts || [], projects: projects || [] });
});

// Test R2 Configuration
router.get("/test-r2", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  if (!s3Client || !R2_BUCKET_NAME) {
    return res.status(500).json({ 
      error: "Cloudflare R2 is not configured correctly.",
      config: {
        accountId: !!R2_ACCOUNT_ID,
        accessKeyId: !!R2_ACCESS_KEY_ID,
        secretAccessKey: !!R2_SECRET_ACCESS_KEY,
        bucketName: !!R2_BUCKET_NAME
      }
    });
  }
  
  try {
    const testKey = `test-connection-${Date.now()}.txt`;
    await s3Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: testKey,
      Body: "Connection test",
      ContentType: "text/plain",
    }));
    
    res.json({ 
      success: true, 
      message: "Successfully connected to Cloudflare R2 and performed a test upload.",
      bucket: R2_BUCKET_NAME,
      testFile: testKey,
      publicUrl: R2_PUBLIC_URL || "Not configured"
    });
  } catch (err: any) {
    console.error("R2 Test Error:", err);
    res.status(500).json({ 
      error: "Failed to connect to storage"
    });
  }
});

// Image Upload API (Cloudflare R2)
router.post("/upload", authenticate, validate(uploadSchema), upload.single("image"), async (req: any, res: ExpressResponse) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  if (!s3Client || !R2_BUCKET_NAME) {
    return res.status(500).json({ error: "Cloudflare R2 is not configured." });
  }

  try {
    const feature = req.body.feature || 'general';
    const file = req.file;
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
      ? `${R2_PUBLIC_URL.replace(/\\n/g, '').replace(/\\r/g, '').trim().replace(/\/$/, "")}/${r2Key}`
      : `https://${R2_BUCKET_NAME}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${r2Key}`;

    res.json({ url: publicUrl, key: r2Key });
  } catch (err: any) {
    console.error("Cloudflare R2 upload error:", err);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

router.delete("/upload", authenticate, validate(deleteUploadSchema), async (req: ExpressRequest, res: ExpressResponse) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: "No key provided" });

  // Ownership check: key must start with the expected prefix
  if (!key.startsWith("erd-builder-pro/")) {
    return res.status(403).json({ error: "Invalid file key" });
  }

  if (!s3Client || !R2_BUCKET_NAME) return res.status(500).json({ error: "Cloudflare R2 is not configured." });

  try {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    }));
    res.json({ success: true });
  } catch (err: any) {
    console.error("Cloudflare R2 delete error:", err);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

// Multer error handler — catches file filter and size limit errors
router.use((err: any, _req: ExpressRequest, res: ExpressResponse, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File too large. Maximum size is 10MB." });
    }
    return res.status(400).json({ error: "Upload error" });
  }
  if (err.message?.includes("File type")) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

export default router;
