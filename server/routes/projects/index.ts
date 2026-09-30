import { Router } from "express";
import { authenticate } from "../../lib/middleware.js";
import { requireCloudCapability } from "../../lib/cloud-capability.js";
import * as ctrl from "./controller.js";
import discussionsRouter, { requireCloudDiscussionTeam, setCollaborationResource } from "../diagrams/discussions.js";

const router = Router();
const cloudCapability = requireCloudCapability("erd_builder");

router.use(
  "/:projectId/discussions",
  authenticate,
  cloudCapability,
  requireCloudDiscussionTeam,
  setCollaborationResource("discussion"),
  discussionsRouter,
);
router.use(
  "/:projectId/comments",
  authenticate,
  cloudCapability,
  requireCloudDiscussionTeam,
  setCollaborationResource("comment"),
  discussionsRouter,
);

router.get("/", authenticate, ctrl.list);
router.get("/selectable", authenticate, ctrl.selectable);
router.post("/", authenticate, ctrl.create);
router.put("/:id", authenticate, ctrl.update);
router.delete("/:id", authenticate, ctrl.remove);
router.post("/:id/restore", authenticate, ctrl.restore);
router.delete("/:id/permanent", authenticate, ctrl.permanentDelete);
router.get("/:id/siblings", authenticate, ctrl.siblings);
router.get("/:id/summary", authenticate, ctrl.summary);
router.get("/:id/files", authenticate, ctrl.files);

export default router;
