import { Router } from "express";
import { validate, aiProxySchema } from "../../lib/validation.js";
import { proxy } from "./controller.js";

const router = Router();

// NOTE: No auth middleware here — guest mode sends requests without a session cookie.
// Abuse is mitigated by rate limiting applied in server/index.ts.
router.post("/proxy", validate(aiProxySchema), proxy);

export default router;
