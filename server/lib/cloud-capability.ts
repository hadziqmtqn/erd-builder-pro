import type { NextFunction, Request, Response } from "express";

import { isSsoAuthMode } from "./config.js";
import { parseCloudEntitlement } from "./cloud-entitlement.js";
import { currentTeamScope } from "./team-scope.js";
import { prisma } from "./prisma.js";

function storedEntitlement(value: unknown, status: string) {
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value);
    return parseCloudEntitlement({ ...parsed, status }, status);
  } catch {
    return null;
  }
}

export function hasCloudCapability(
  stored: unknown,
  teamStatus: string,
  capability: string,
): boolean {
  return storedEntitlement(stored, teamStatus)?.capabilities[capability] === true;
}

export function cloudCapabilities(stored: unknown, teamStatus: string): Record<string, boolean> | undefined {
  return storedEntitlement(stored, teamStatus)?.capabilities;
}

/**
 * Cloud plan features apply only to the active Team scope. Personal workspaces
 * remain private to the signed-in SaaS identity and have no Team plan grant.
 */
export function requireCloudCapability(capability: string) {
  return async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    const scope = currentTeamScope();
    if (!isSsoAuthMode() || scope?.mode !== "team" || !scope.teamId) {
      next();
      return;
    }

    const team = await prisma?.team.findUnique({
      where: { id: scope.teamId },
      select: { status: true, cloudEntitlement: true },
    });
    if (!team) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }

    if (team.status !== "active" || !hasCloudCapability(team.cloudEntitlement, team.status, capability)) {
      res.status(403).json({
        error: "This feature is not included in this Team's Cloud plan.",
        code: "CLOUD_CAPABILITY_REQUIRED",
      });
      return;
    }

    next();
  };
}
