import { Router } from "express";
import rateLimit from "express-rate-limit";

import { authenticate, rejectInSsoMode } from "../../lib/middleware.js";
import { validate, addTeamMemberSchema, createTeamSchema, updateTeamMemberSchema, updateTeamSchema } from "../../lib/validation.js";
import * as controller from "./controller.js";

const router = Router();
const licenseRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many activation attempts. Please wait a few minutes and try again." },
});

router.use(authenticate);
router.get("/", controller.list);
router.post("/", rejectInSsoMode, licenseRequestLimiter, validate(createTeamSchema), controller.create);
router.get("/:id", controller.get);
router.patch("/:id", rejectInSsoMode, validate(updateTeamSchema), controller.update);
router.post("/:id/members", rejectInSsoMode, validate(addTeamMemberSchema), controller.addMember);
router.patch("/:id/members/:userId", rejectInSsoMode, validate(updateTeamMemberSchema), controller.updateMember);
router.post("/:id/members/:userId/ban", rejectInSsoMode, controller.banMember);
router.delete("/:id/members/:userId", rejectInSsoMode, controller.removeMember);

export default router;
