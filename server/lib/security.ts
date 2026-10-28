import type { NextFunction, Request as ExpressRequest, Response as ExpressResponse } from "express";
import type { PrismaClient } from "@prisma/client";
import { isDesktopMode, isLocalPostgres, isSsoAuthMode } from "./config.js";
import { canCommentRole, projectRoleFor } from "./project-access.js";
import { RequestError } from "./request-error.js";
import { currentTeamScope, projectScopeWhere } from "./team-scope.js";

export const isAdminUser = (req: ExpressRequest) => {
  // Cloud administration belongs to the SaaS control plane, never to a local record.
  if (isSsoAuthMode()) return false;

  // Desktop/SQLite is a single-user install. Local PostgreSQL can have multiple users.
  if (isDesktopMode()) return true;

  const user = (req as any).user;
  if (!user) return false;

  if (isLocalPostgres()) return Boolean(user.isSuperAdmin || user.is_super_admin);

  return Boolean(
    user.isSuperAdmin ||
    user.is_super_admin ||
    user.app_metadata?.is_super_admin ||
    user.app_metadata?.role === "admin"
  );
};

export const requireAdmin = (req: ExpressRequest, res: ExpressResponse, next?: NextFunction) => {
  if (!isAdminUser(req)) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }

  next?.();
  return true;
};

export const resolveOwnedProjectId = async (
  prisma: PrismaClient,
  userId: string,
  projectId: unknown,
): Promise<number | null> => {
  if (projectId === null || projectId === undefined || projectId === "" || projectId === "null") {
    return null;
  }

  if (typeof projectId !== "number" && typeof projectId !== "string" && typeof projectId !== "bigint") {
    throw new RequestError(400, "Invalid project_id");
  }

  const parsed = Number(projectId);
  if (!Number.isFinite(parsed)) {
    throw new RequestError(400, "Invalid project_id");
  }

  const project = await prisma.project.findFirst({
    where: { id: parsed, ...projectScopeWhere(userId), isDeleted: false },
    select: { id: true },
  });

  if (!project) {
    throw new RequestError(404, "Project not found");
  }

  return Number(project.id);
};

/** Every new or moved feature file needs a Project in every workspace (COL-008). */
export const resolveNewFileProjectId = async (
  prisma: PrismaClient,
  userId: string,
  projectId: unknown,
): Promise<number | null> => {
  if (projectId !== null && projectId !== undefined && projectId !== "" && projectId !== "null") {
    const resolved = await resolveOwnedProjectId(prisma, userId, projectId);
    // A Viewer reads a Team Project but adds nothing to it (COL-004); the Project reads as missing.
    if (resolved !== null && currentTeamScope()?.mode === "team" && !canCommentRole(await projectRoleFor(resolved, userId))) {
      throw new RequestError(404, "Project not found");
    }
    return resolved;
  }

  throw new RequestError(400, "A project is required");
};
