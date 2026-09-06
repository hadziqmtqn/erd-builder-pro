import { Router } from "express";
import { authenticate } from "../../lib/middleware.js";
import { requireAdmin } from "../../lib/security.js";
import * as ctrl from "./controller.js";

const router = Router();
const superAdminOnly = (req: Parameters<typeof requireAdmin>[0], res: Parameters<typeof requireAdmin>[1], next: () => void) => {
  if (!requireAdmin(req, res)) return;
  next();
};

router.get("/providers", authenticate, superAdminOnly, ctrl.listProviders);
router.put("/providers/:id", authenticate, superAdminOnly, ctrl.updateProvider);
router.get("/configs", authenticate, superAdminOnly, ctrl.listConfigs);
router.post("/configs", authenticate, superAdminOnly, ctrl.saveConfig);
router.post("/configs/test", authenticate, superAdminOnly, ctrl.testConfigConnection);
router.get("/models", authenticate, superAdminOnly, ctrl.listModels);
router.post("/models/fetch", authenticate, superAdminOnly, ctrl.fetchProviderModels);
router.post("/models/ensure", authenticate, superAdminOnly, ctrl.ensureModel);
router.post("/models", authenticate, superAdminOnly, ctrl.createModel);
router.put("/models/:id", authenticate, superAdminOnly, ctrl.updateModel);
router.delete("/models/:id", authenticate, superAdminOnly, ctrl.deleteModel);
router.get("/prompts", authenticate, ctrl.listPrompts);
router.post("/prompts", authenticate, ctrl.savePrompt);
router.delete("/prompts/:id", authenticate, ctrl.deletePrompt);
router.put("/prompts/:id/toggle-default", authenticate, ctrl.toggleDefaultPrompt);
router.post("/initialize", authenticate, ctrl.initializeDefaults);

export default router;
