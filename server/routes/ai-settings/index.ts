import { Router } from "express";
import { authenticate } from "../../lib/middleware.js";
import { requireAdmin } from "../../lib/security.js";
import * as ctrl from "./controller.js";

const router = Router();

router.get("/providers", authenticate, requireAdmin, ctrl.listProviders);
router.put("/providers/:id", authenticate, requireAdmin, ctrl.updateProvider);
router.get("/configs", authenticate, requireAdmin, ctrl.listConfigs);
router.post("/configs", authenticate, requireAdmin, ctrl.saveConfig);
router.post("/configs/test", authenticate, requireAdmin, ctrl.testConfigConnection);
router.get("/models", authenticate, requireAdmin, ctrl.listModels);
router.post("/models/fetch", authenticate, requireAdmin, ctrl.fetchProviderModels);
router.post("/models/ensure", authenticate, requireAdmin, ctrl.ensureModel);
router.post("/models", authenticate, requireAdmin, ctrl.createModel);
router.put("/models/:id", authenticate, requireAdmin, ctrl.updateModel);
router.delete("/models/:id", authenticate, requireAdmin, ctrl.deleteModel);
router.get("/prompts", authenticate, ctrl.listPrompts);
router.post("/prompts", authenticate, ctrl.savePrompt);
router.delete("/prompts/:id", authenticate, ctrl.deletePrompt);
router.put("/prompts/:id/toggle-default", authenticate, ctrl.toggleDefaultPrompt);
router.post("/initialize", authenticate, ctrl.initializeDefaults);

export default router;
