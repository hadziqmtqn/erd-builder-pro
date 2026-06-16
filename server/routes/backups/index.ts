import { Router } from "express";
import { authenticate } from "../../lib/middleware.js";
import * as ctrl from "./controller.js";

const router = Router();

router.get("/settings/folder", authenticate, ctrl.getFolderSettings);
router.put("/settings/folder", authenticate, ctrl.updateFolderSettings);
router.get("/", authenticate, ctrl.list);
router.get("/:id/download", authenticate, ctrl.download);
router.post("/", authenticate, ctrl.create);
router.post("/:id/restore", authenticate, ctrl.restore);

export default router;
