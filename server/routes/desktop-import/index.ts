import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../lib/middleware.js";
import { restoreHandler } from "./controller.js";

const ALLOWED_DB_TYPES = ["application/x-sqlite3", "application/vnd.sqlite3", "application/octet-stream"];
const MAX_DB_SIZE = 50 * 1024 * 1024; // 50 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DB_SIZE },
  fileFilter: (_req, file, cb) => {
    // Accept .db, .sqlite, .sqlite3 extensions + common MIME types
    const extOk = /\.(db|sqlite|sqlite3)$/i.test(file.originalname);
    const mimeOk = ALLOWED_DB_TYPES.includes(file.mimetype);
    if (extOk || mimeOk) {
      cb(null, true);
    } else {
      cb(new Error("Only .db, .sqlite, and .sqlite3 files are accepted"));
    }
  },
});

const router = Router();

router.post(
  "/restore/database",
  authenticate,
  upload.single("database"),
  restoreHandler,
);

// Multer error handler
router.use((err: any, _req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "Database file too large. Maximum size is 50 MB." });
    }
    return res.status(400).json({ error: "Upload error" });
  }
  if (err.message?.includes("only .db")) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

export default router;
