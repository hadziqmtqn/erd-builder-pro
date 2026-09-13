import { Router } from "express";
import { validate, aiProxySchema } from "../../lib/validation.js";
import { proxy } from "./controller.js";
import { requireCloudAiAccess } from "../../lib/cloud-ai.js";

const router = Router();

// NOTE: No auth middleware here — guest mode sends requests without a session cookie.
// Abuse is mitigated by rate limiting applied in server/index.ts.
router.post("/proxy", requireCloudAiAccess, validate(aiProxySchema), proxy);

export default router;
