import { Router } from "express";
import { submitFeedback } from "./controller.js";

const router = Router();

router.post("/feedback", submitFeedback);

export default router;
