import { Router } from "express";
import { authenticate } from "../../lib/middleware.js";
import { getRule, saveRule } from "./controller.js";

const router = Router();

router.get("/:viewType", authenticate, getRule);
router.put("/:viewType", authenticate, saveRule);

export default router;
