import { Router } from "express";
import { authenticate } from "../../lib/middleware.js";
import { importHandler } from "./controller.js";

const router = Router();

router.post("/import", authenticate, importHandler);

export default router;
