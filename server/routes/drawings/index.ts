import { Router } from "express";
import { authenticate } from "../../lib/middleware.js";
import { requireCloudCapability } from "../../lib/cloud-capability.js";
import { validate, createDrawingSchema } from "../../lib/validation.js";
import * as ctrl from "./controller.js";

const router = Router();

const cloudCapability = requireCloudCapability("drawings");

router.get("/", authenticate, cloudCapability, ctrl.list);
router.post("/", authenticate, cloudCapability, validate(createDrawingSchema), ctrl.create);
router.get("/public/:uid", ctrl.getPublic);
router.put("/:uid/share", authenticate, cloudCapability, ctrl.updateShare);
router.get("/:uid", authenticate, cloudCapability, ctrl.get);
router.put("/:uid", authenticate, cloudCapability, ctrl.update);
router.delete("/:uid", authenticate, cloudCapability, ctrl.remove);
router.post("/:uid/restore", authenticate, cloudCapability, ctrl.restore);
router.delete("/:uid/permanent", authenticate, cloudCapability, ctrl.permanentDelete);

export default router;
