import { Router } from "express";
import { validate, loginSchema, setupAdminSchema, updateAccountSchema } from "../../lib/validation.js";
import { authenticate } from "../../lib/middleware.js";
import * as ctrl from "./controller.js";

const router = Router();

router.get("/auth-config", ctrl.getAuthConfig);
router.post("/login", validate(loginSchema), ctrl.login);
router.post("/setup", validate(setupAdminSchema), ctrl.setup);
router.post("/logout", ctrl.logout);
router.get("/me", ctrl.me);
router.put("/account", authenticate, validate(updateAccountSchema), ctrl.updateAccount);

export default router;
