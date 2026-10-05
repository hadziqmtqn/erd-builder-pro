import type { Request, Response } from "express";
import { z } from "zod";
import { handleError } from "../../lib/utils.js";
import { TeamServiceError } from "./service.js";
import { recoveryInventory, recoverFiles } from "./recovery.js";

const schema = z.object({
  operationId: z.string().uuid(), targetTeamId: z.string().uuid(),
  files: z.array(z.object({ type: z.enum(["erd", "notes", "drawings", "flowchart"]), id: z.number().int().positive() })).min(1).max(500),
}).strict();

function errorResponse(res: Response, error: unknown) {
  if (error instanceof TeamServiceError) { res.status(error.status).json({ error: error.message, code: error.code }); return; }
  handleError(res, error, "File recovery could not be completed.");
}

export async function inventory(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    res.json(await recoveryInventory(String(req.params.id), Boolean(user?.isSuperAdmin || user?.is_super_admin)));
  } catch (error) { errorResponse(res, error); }
}

export async function recover(req: Request, res: Response) {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Choose a destination Team and between 1 and 500 files." }); return; }
  try {
    const user = (req as any).user;
    res.json(await recoverFiles(String(req.params.id), String(user.id), Boolean(user.isSuperAdmin || user.is_super_admin), parsed.data));
  } catch (error) { errorResponse(res, error); }
}
