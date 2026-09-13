import { Router } from "express";
import { authenticate } from "../../lib/middleware.js";
import { requireCloudAiAccess } from "../../lib/cloud-ai.js";
import { getRule, saveRule } from "./controller.js";

const router = Router();

router.get("/:viewType", authenticate, requireCloudAiAccess, getRule);
router.put("/:viewType", authenticate, requireCloudAiAccess, saveRule);

export default router;
