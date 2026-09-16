import { Router } from "express";
import { authenticate } from "../../lib/middleware.js";
import * as ctrl from "./controller.js";
import { requireCloudAiAccess } from "../../lib/cloud-ai.js";

const router = Router();

router.get("/sessions", authenticate, requireCloudAiAccess, ctrl.listSessions);
router.post("/sessions", authenticate, requireCloudAiAccess, ctrl.createSession);
router.get("/sessions/:uid", authenticate, requireCloudAiAccess, ctrl.getSession);
router.delete("/sessions/:uid", authenticate, requireCloudAiAccess, ctrl.deleteSession);
router.put("/sessions/:uid", authenticate, requireCloudAiAccess, ctrl.updateSession);
router.get("/sessions/:uid/messages", authenticate, requireCloudAiAccess, ctrl.listMessages);
router.post("/messages", authenticate, requireCloudAiAccess, ctrl.createMessage);
router.get("/config", authenticate, requireCloudAiAccess, ctrl.getConfig);
router.get("/prompts/default", authenticate, requireCloudAiAccess, ctrl.getDefaultPrompt);

export default router;
