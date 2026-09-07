import { Router } from "express";

import { authenticate, rejectInSsoMode } from "../../lib/middleware.js";
import * as controller from "./controller.js";

const router = Router();
router.use(authenticate);
router.get("/", controller.list);
router.get("/invitations", controller.invitations);
router.post("/:userId/reset-password", rejectInSsoMode, controller.resetPassword);

export default router;
