import { Router } from "express";
import { authenticate, rejectInSsoMode } from "../../lib/middleware.js";
import { requireAdmin } from "../../lib/security.js";
import { exportHandler, importHandler } from "./controller.js";

const router = Router();

router.get("/export", authenticate, rejectInSsoMode, requireAdmin, exportHandler);
router.post("/import", authenticate, rejectInSsoMode, requireAdmin, importHandler);

export default router;
