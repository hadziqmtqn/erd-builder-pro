import { Router } from "express";
import { authenticate } from "../../lib/middleware.js";
import { isDesktopMode } from "../../lib/config.js";
import * as ctrl from "./controller.js";

const router = Router();

// Desktop-only guard — storage config is only relevant for local desktop app
router.use((_req, res, next) => {
  if (!isDesktopMode()) {
    return res.status(404).json({ error: "Not available" });
  }
  next();
});

router.get("/config", authenticate, ctrl.getStorageConfig);
router.post("/config", authenticate, ctrl.saveStorageConfig);
router.post("/test", authenticate, ctrl.testStorageConnectionHandler);
router.get("/proxy", authenticate, ctrl.proxyFile);

export default router;
