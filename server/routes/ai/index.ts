import { Router } from "express";
import { validate, aiProxySchema } from "../../lib/validation.js";
import { authenticateIfPresent } from "../../lib/middleware.js";
import { proxy } from "./controller.js";
import { requireCloudAiAccess } from "../../lib/cloud-ai.js";

const router = Router();

// Guest mode omits a token; authenticated chat sends one so the proxy can persist trusted responses.
router.post("/proxy", authenticateIfPresent, requireCloudAiAccess, validate(aiProxySchema), proxy);

export default router;
