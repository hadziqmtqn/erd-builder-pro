import { Router } from "express";
import { authenticate } from "../../lib/middleware.js";
import { requireCloudCapability } from "../../lib/cloud-capability.js";
import { validate, createDiagramSchema } from "../../lib/validation.js";
import { fileChangeStream, notifyFileChange } from "../../lib/file-live-sync.js";
import * as ctrl from "./controller.js";
import discussionsRouter, { requireCloudDiscussionTeam } from "./discussions.js";

const router = Router();

const cloudCapability = requireCloudCapability("erd_builder");

router.use(
  "/:uid/discussions",
  authenticate,
  cloudCapability,
  requireCloudDiscussionTeam,
  discussionsRouter,
);
router.get("/", authenticate, cloudCapability, ctrl.list);
router.post("/", authenticate, cloudCapability, validate(createDiagramSchema), ctrl.create);
router.get("/public/:uid", ctrl.getPublic);
router.put("/:uid/share", authenticate, cloudCapability, ctrl.updateShare);
router.put("/:uid/project", authenticate, cloudCapability, ctrl.moveToProject);
router.get("/:uid/events", authenticate, cloudCapability, fileChangeStream("diagram"));
router.get("/:uid", authenticate, cloudCapability, ctrl.get);
router.put("/:uid", authenticate, cloudCapability, notifyFileChange("diagram"), ctrl.update);
router.delete("/:uid", authenticate, cloudCapability, ctrl.remove);
router.post("/:uid/restore", authenticate, cloudCapability, ctrl.restore);
router.delete("/:uid/permanent", authenticate, cloudCapability, ctrl.permanentDelete);
router.post("/save/:uid", authenticate, cloudCapability, notifyFileChange("diagram"), ctrl.save);
router.post("/fetch-schema", authenticate, cloudCapability, ctrl.fetchSchema);
router.post("/test-db-connection", authenticate, cloudCapability, ctrl.testDbConnection);

export default router;
