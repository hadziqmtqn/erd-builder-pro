import type { Request, Response } from "express";

import { handleError } from "../../lib/utils.js";
import { TeamServiceError } from "../teams/service.js";
import * as users from "./service.js";

const actor = (req: Request) => ({ id: String((req as any).user?.id || ""), isSuperAdmin: Boolean((req as any).user?.isSuperAdmin || (req as any).user?.is_super_admin) });
const fail = (res: Response, error: unknown, fallback: string) => error instanceof TeamServiceError ? res.status(error.status).json({ error: error.message, code: error.code }) : handleError(res, error, fallback);
const admin = (req: Request, res: Response) => actor(req).isSuperAdmin || (res.status(403).json({ error: "Only the SuperAdmin can manage users." }), false);

export async function list(req: Request, res: Response): Promise<void> {
  if (!admin(req, res)) return;
  const kind = ["all", "no-team", "former"].includes(String(req.query.kind)) ? String(req.query.kind) as "all" | "no-team" | "former" : "all";
  const pageValue = Number.parseInt(String(req.query.page || "1"), 10);
  const pageSizeValue = Number.parseInt(String(req.query.pageSize || "20"), 10);
  const page = Number.isFinite(pageValue) ? pageValue : 1;
  const pageSize = Number.isFinite(pageSizeValue) ? pageSizeValue : 20;
  const search = typeof req.query.search === "string" ? req.query.search : "";
  try { res.json(await users.listUsers(kind, page, pageSize, search)); } catch (error) { fail(res, error, "Failed to fetch users"); }
}

export async function invitations(req: Request, res: Response): Promise<void> {
  if (!admin(req, res)) return;
  try { res.json({ data: await users.listInvitations() }); } catch (error) { fail(res, error, "Failed to fetch invitations"); }
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  if (!admin(req, res)) return;
  try {
    const result = await users.resetPassword(req.params.userId, actor(req).id);
    res.json({ temporaryPassword: result.temporaryPassword });
  } catch (error) { fail(res, error, "Failed to reset password"); }
}
