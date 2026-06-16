import { Router } from "express";
import { authenticate } from "../../lib/middleware.js";
import * as ctrl from "./controller.js";

const router = Router();

router.get("/sessions", authenticate, ctrl.listSessions);
router.post("/sessions", authenticate, ctrl.createSession);
router.get("/sessions/:uid", authenticate, ctrl.getSession);
router.delete("/sessions/:uid", authenticate, ctrl.deleteSession);
router.put("/sessions/:uid", authenticate, ctrl.updateSession);
router.get("/sessions/:uid/messages", authenticate, ctrl.listMessages);
router.post("/messages", authenticate, ctrl.createMessage);
router.get("/config", authenticate, ctrl.getConfig);
router.get("/prompts/default", authenticate, ctrl.getDefaultPrompt);

export default router;
