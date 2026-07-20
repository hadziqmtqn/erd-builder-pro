import { Router } from "express";
import { authenticate } from "../../lib/middleware.js";
import { exportHandler, importHandler } from "./controller.js";

const router = Router();

router.get("/export", authenticate, exportHandler);
router.post("/import", authenticate, importHandler);

export default router;
