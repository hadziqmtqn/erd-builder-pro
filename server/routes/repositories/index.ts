import { Router } from "express";
import * as z from "zod/v4";
import { authenticate } from "../../lib/middleware.js";
import { desktopOnly } from "../connections/middleware.js";
import { inspectRepository, readRepositorySource, RepositoryError } from "../../lib/repository-git.js";
import { prisma } from "../../lib/prisma.js";

const router = Router();
const inspectInput = z.object({
  repository_path: z.string().trim().min(1).max(4096),
  ref: z.string().trim().min(1).max(512).default("WORKTREE"),
});
const readInput = inspectInput.extend({ source_id: z.string().trim().min(1).max(4096) });
const linkInput = readInput.pick({ repository_path: true, ref: true, source_id: true });

function errorResponse(res: any, error: unknown) {
  if (error instanceof RepositoryError) return res.status(error.status).json({ error: error.message });
  return res.status(500).json({ error: "Failed to inspect repository" });
}

async function ownedDiagram(userId: string, identifier: string) {
  if (!prisma) return null;
  return (prisma as any).diagram.findFirst({
    where: {
      userId,
      isDeleted: false,
      OR: [{ uid: identifier }, ...(/^\d+$/.test(identifier) ? [{ id: Number(identifier) }] : [])],
    },
    select: { id: true, uid: true, repositoryPath: true, repositoryRef: true, repositorySourceId: true },
  });
}

router.get("/link/:diagram_uid", authenticate, desktopOnly, async (req, res) => {
  const diagram = await ownedDiagram(String((req as any).user.id), req.params.diagram_uid);
  if (!diagram) return res.status(404).json({ error: "Diagram not found" });
  if (!diagram.repositoryPath) return res.json(null);
  res.json({ repositoryPath: diagram.repositoryPath, ref: diagram.repositoryRef || "WORKTREE", sourceId: diagram.repositorySourceId || "" });
});

router.put("/link/:diagram_uid", authenticate, desktopOnly, async (req, res) => {
  const input = linkInput.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: "Invalid repository link" });
  const diagram = await ownedDiagram(String((req as any).user.id), req.params.diagram_uid);
  if (!diagram) return res.status(404).json({ error: "Diagram not found" });
  try {
    const inspection = await inspectRepository(input.data.repository_path, input.data.ref);
    if (!inspection.sources.some(source => source.id === input.data.source_id)) {
      return res.status(400).json({ error: "Repository schema source not found" });
    }
    await (prisma as any).diagram.update({
      where: { id: diagram.id },
      data: { repositoryPath: inspection.root, repositoryRef: input.data.ref, repositorySourceId: input.data.source_id },
    });
    res.json({ repositoryPath: inspection.root, ref: input.data.ref, sourceId: input.data.source_id });
  } catch (error) { errorResponse(res, error); }
});

router.delete("/link/:diagram_uid", authenticate, desktopOnly, async (req, res) => {
  const diagram = await ownedDiagram(String((req as any).user.id), req.params.diagram_uid);
  if (!diagram) return res.status(404).json({ error: "Diagram not found" });
  await (prisma as any).diagram.update({
    where: { id: diagram.id },
    data: { repositoryPath: null, repositoryRef: null, repositorySourceId: null },
  });
  res.status(204).end();
});

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
