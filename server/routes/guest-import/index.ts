import { Router } from "express";
import { authenticate } from "../../lib/middleware.js";
import { requireAdmin } from "../../lib/security.js";
import { exportHandler, importHandler } from "./controller.js";

const router = Router();

router.get("/export", authenticate, requireAdmin, exportHandler);
router.post("/import", authenticate, requireAdmin, importHandler);

export default router;
