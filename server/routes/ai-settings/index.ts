import { Router } from "express";
import { authenticate } from "../../lib/middleware.js";
import * as ctrl from "./controller.js";

const router = Router();

router.get("/providers", authenticate, ctrl.listProviders);
router.put("/providers/:id", authenticate, ctrl.updateProvider);
router.get("/configs", authenticate, ctrl.listConfigs);
router.post("/configs", authenticate, ctrl.saveConfig);
router.post("/configs/test", authenticate, ctrl.testConfigConnection);
router.get("/models", authenticate, ctrl.listModels);
router.post("/models", authenticate, ctrl.createModel);
router.put("/models/:id", authenticate, ctrl.updateModel);
router.delete("/models/:id", authenticate, ctrl.deleteModel);
router.get("/prompts", authenticate, ctrl.listPrompts);
router.post("/prompts", authenticate, ctrl.savePrompt);
router.delete("/prompts/:id", authenticate, ctrl.deletePrompt);
router.put("/prompts/:id/toggle-default", authenticate, ctrl.toggleDefaultPrompt);
router.post("/initialize", authenticate, ctrl.initializeDefaults);

export default router;
