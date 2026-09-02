import { Router } from "express";
import { authenticate } from "../../lib/middleware.js";
import * as ctrl from "./controller.js";

const router = Router();

router.get("/", authenticate, ctrl.list);
router.post("/", authenticate, ctrl.create);
router.put("/:id", authenticate, ctrl.update);
router.delete("/:id", authenticate, ctrl.remove);
router.post("/:id/restore", authenticate, ctrl.restore);
router.delete("/:id/permanent", authenticate, ctrl.permanentDelete);
router.get("/:id/siblings", authenticate, ctrl.siblings);
router.get("/:id/summary", authenticate, ctrl.summary);
router.get("/:id/files", authenticate, ctrl.files);

export default router;
