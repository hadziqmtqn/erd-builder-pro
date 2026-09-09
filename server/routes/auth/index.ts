import { Router } from "express";
import { validate, loginSchema, setupAdminSchema, ssoLinkSchema, updateAccountSchema } from "../../lib/validation.js";
import { authenticate, rejectInSsoMode } from "../../lib/middleware.js";
import * as ctrl from "./controller.js";
import { finishSso, linkSsoAccount, startSso } from "./sso.js";

const router = Router();

router.get("/auth-config", ctrl.getAuthConfig);
router.get("/sso/login", startSso);
router.get("/sso/callback", finishSso);
router.post("/sso/link", validate(ssoLinkSchema), linkSsoAccount);
router.post("/login", validate(loginSchema), ctrl.login);
router.post("/setup", validate(setupAdminSchema), ctrl.setup);
router.post("/logout", ctrl.logout);
router.get("/me", ctrl.me);
router.put("/account", authenticate, rejectInSsoMode, validate(updateAccountSchema), ctrl.updateAccount);

export default router;
