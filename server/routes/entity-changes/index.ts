import { Router } from "express";
import { authenticate } from "../../lib/middleware.js";
import * as controller from "./controller.js";

const router = Router();

router.get("/:entityType/:uid", authenticate, controller.list);
router.get("/:entityType/:uid/:revisionId", authenticate, controller.get);
router.post("/:entityType/:uid/:revisionId/restore", authenticate, controller.restore);

export default router;
