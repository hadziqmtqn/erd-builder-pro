import { Router } from "express";
import { isSsoAuthMode } from "../../lib/config.js";
import { authenticate } from "../../lib/middleware.js";
import { submitFeedback } from "./controller.js";

const router = Router();

// Cloud feedback carries the signed-in user and Team (CLD-013); Self-host keeps the public relay.
router.post("/feedback", (req, res, next) => (isSsoAuthMode() ? authenticate(req, res, next) : next()), submitFeedback);

export default router;
