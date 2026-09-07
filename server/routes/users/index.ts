import { Router } from "express";

import { authenticate } from "../../lib/middleware.js";
import * as controller from "./controller.js";

const router = Router();
router.use(authenticate);
router.get("/", controller.list);
router.get("/invitations", controller.invitations);
router.post("/:userId/reset-password", controller.resetPassword);

export default router;
