import { Router } from "express";
import { authenticate } from "../../lib/middleware.js";
import * as controller from "./controller.js";

const router = Router();

router.get("/", authenticate, controller.list);

export default router;
