import { Router } from "express";
import * as z from "zod/v4";
import { authenticate } from "../../lib/middleware.js";
import { desktopOnly } from "../connections/middleware.js";
import { inspectRepository, readRepositorySource, RepositoryError } from "../../lib/repository-git.js";

const router = Router();
const inspectInput = z.object({
  repository_path: z.string().trim().min(1).max(4096),
  ref: z.string().trim().min(1).max(512).default("WORKTREE"),
});
const readInput = inspectInput.extend({ source_id: z.string().trim().min(1).max(4096) });

function errorResponse(res: any, error: unknown) {
  if (error instanceof RepositoryError) return res.status(error.status).json({ error: error.message });
  return res.status(500).json({ error: "Failed to inspect repository" });
}

router.post("/inspect", authenticate, desktopOnly, async (req, res) => {
  const input = inspectInput.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: "Invalid repository path or Git ref" });
  try { res.json(await inspectRepository(input.data.repository_path, input.data.ref)); }
  catch (error) { errorResponse(res, error); }
});

router.post("/read", authenticate, desktopOnly, async (req, res) => {
  const input = readInput.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: "Invalid repository source request" });
  try { res.json(await readRepositorySource(input.data.repository_path, input.data.ref, input.data.source_id)); }
  catch (error) { errorResponse(res, error); }
});

export default router;
