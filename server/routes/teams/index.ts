import { Router } from "express";
import rateLimit from "express-rate-limit";

import { authenticate } from "../../lib/middleware.js";
import { validate, addTeamMemberSchema, createTeamSchema } from "../../lib/validation.js";
import * as controller from "./controller.js";

const router = Router();
const licenseRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many license requests, please try again later" },
});

router.use(authenticate);
router.get("/", controller.list);
router.post("/", licenseRequestLimiter, validate(createTeamSchema), controller.create);
router.get("/:id", controller.get);
router.post("/:id/license/check", licenseRequestLimiter, controller.checkLicense);
router.post("/:id/members", validate(addTeamMemberSchema), controller.addMember);
router.delete("/:id/members/:userId", controller.removeMember);

export default router;
