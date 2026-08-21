import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../lib/middleware.js";
import { desktopOnly } from "../connections/middleware.js";
import * as ctrl from "./controller.js";
import * as autoBackupCtrl from "./auto-controller.js";

const router = Router();

const SQLITE_UPLOAD_TYPES = [
  "application/gzip",
  "application/sql",
  "application/x-gzip",
  "application/vnd.sqlite3",
  "application/x-sqlite3",
  "application/octet-stream",
  "text/plain",
];

const sqliteUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const extensionOk = /\.(?:db|sqlite|sqlite3|sql)(?:\.gz)?$/i.test(file.originalname);
    const mimeOk = SQLITE_UPLOAD_TYPES.includes(file.mimetype);
    if (extensionOk || mimeOk) return cb(null, true);
    cb(new Error("Only SQLite .db, .sqlite, .sqlite3, .sql, or .sql.gz files are accepted"));
  },
});

router.get("/settings/folder", authenticate, ctrl.getFolderSettings);
router.put("/settings/folder", authenticate, ctrl.updateFolderSettings);
router.get("/settings/auto", authenticate, autoBackupCtrl.getSettings);
router.put("/settings/auto", authenticate, autoBackupCtrl.updateSettings);
router.get("/", authenticate, ctrl.list);
router.get("/:id/download", authenticate, ctrl.download);
router.post("/", authenticate, ctrl.create);
router.post("/import", authenticate, desktopOnly, sqliteUpload.single("database"), ctrl.importDatabase);
router.post("/:id/restore", authenticate, ctrl.restore);

router.use((err: any, _req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "SQLite import file too large. Maximum size is 50 MB." });
    }
    return res.status(400).json({ error: "SQLite import upload failed" });
  }
  if (err.message?.startsWith("Only SQLite")) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

export default router;
