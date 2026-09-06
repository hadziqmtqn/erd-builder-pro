import { Request as ExpressRequest, Response as ExpressResponse } from "express";

import { handleError } from "../../lib/utils.js";
import { TeamServiceError } from "./service.js";
import * as teams from "./service.js";

function actor(req: ExpressRequest) {
  const user = (req as any).user || {};
  return {
    userId: String(user.id || ""),
    isSuperAdmin: Boolean(user.isSuperAdmin || user.is_super_admin),
  };
}

function handleTeamError(res: ExpressResponse, error: unknown, fallback: string): void {
  if (error instanceof TeamServiceError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }
  handleError(res, error, fallback);
}

export async function list(_req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const current = actor(_req);
    res.json({ data: await teams.listTeams(current.userId, current.isSuperAdmin) });
  } catch (error) {
    handleTeamError(res, error, "Failed to fetch teams");
  }
}

export async function get(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const current = actor(req);
    const team = await teams.getTeam(req.params.id, current.userId, current.isSuperAdmin);
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    res.json(team);
  } catch (error) {
    handleTeamError(res, error, "Failed to fetch team");
  }
}

export async function create(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const current = actor(req);
    const team = await teams.createTeam({
      name: req.body.name,
      userId: current.userId,
      isSuperAdmin: current.isSuperAdmin,
    });
    res.status(201).json(team);
  } catch (error) {
    handleTeamError(res, error, "Failed to create team");
  }
}

export async function checkLicense(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const current = actor(req);
    const team = await teams.refreshTeamLicense(req.params.id, current.userId, current.isSuperAdmin);
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    res.json(team);
  } catch (error) {
    handleTeamError(res, error, "Failed to check team license");
  }
}

export async function addMember(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const current = actor(req);
    const team = await teams.addMember(req.params.id, req.body.email, current.isSuperAdmin, {
      name: req.body.name,
      password: req.body.password,
    });
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    res.status(201).json(team);
  } catch (error) {
    handleTeamError(res, error, "Failed to add team member");
  }
}

export async function removeMember(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const current = actor(req);
    const removed = await teams.removeMember(req.params.id, req.params.userId, current.isSuperAdmin);
    if (!removed) {
      res.status(404).json({ error: "Team member not found" });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    handleTeamError(res, error, "Failed to remove team member");
  }
}
