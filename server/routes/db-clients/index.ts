import { Router } from "express";
import { authenticate } from "../../lib/middleware.js";
import { desktopOnly } from "../connections/middleware.js";
import * as ctrl from "./controller.js";

const router = Router();
router.get("/", authenticate, desktopOnly, ctrl.list);
router.get("/:uid", authenticate, desktopOnly, ctrl.get);
router.put("/:uid", authenticate, desktopOnly, ctrl.update);
router.put("/:uid/layout", authenticate, desktopOnly, ctrl.saveLayout);
router.delete("/:uid", authenticate, desktopOnly, ctrl.remove);
router.post("/:uid/restore", authenticate, desktopOnly, ctrl.restore);
router.delete("/:uid/permanent", authenticate, desktopOnly, ctrl.permanentDelete);

export default router;
