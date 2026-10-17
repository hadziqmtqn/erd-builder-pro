import multer from "multer";
import { Router } from "express";
import { authenticate } from "../../lib/middleware.js";
import { validate, uploadSchema, deleteUploadSchema } from "../../lib/validation.js";
import * as ctrl from "./controller.js";

// One list and one limit for every mode and plan; the client compresses before upload (CLD-010 Q7, Q8).
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
export const MAX_FILE_SIZE = 1024 * 1024; // 1 MB

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

const router = Router();

router.get("/trash", authenticate, ctrl.getTrash);
router.delete("/trash", authenticate, ctrl.emptyTrashHandler);
router.get("/test-r2", authenticate, ctrl.testR2);
router.post("/upload", authenticate, upload.single("image"), validate(uploadSchema), ctrl.uploadFile);
router.delete("/upload", authenticate, validate(deleteUploadSchema), ctrl.deleteFile);

// ── Private storage access endpoints ──
router.use("/serve", (_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});
// Proxy streaming: works for same-origin & cross-origin (via ?token= query param)
router.get("/serve/{*key}", authenticate, ctrl.serveFile);
// On-demand pre-signed URL generation
router.post("/signed-urls", authenticate, ctrl.getSignedUrls);

// Multer error handler — catches file filter and size limit errors
router.use((err: any, _req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File too large. Maximum size is 1 MB." });
    }
    return res.status(400).json({ error: "Upload error" });
  }
  if (err.message?.includes("File type")) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

export default router;
