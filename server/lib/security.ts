import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import type { PrismaClient } from "@prisma/client";
import { isDesktopMode, isLocalPostgres } from "./config.js";
import { currentTeamScope, projectScopeWhere } from "./team-scope.js";

export const isAdminUser = (req: ExpressRequest) => {
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

export const requireAdmin = (req: ExpressRequest, res: ExpressResponse) => {
  if (!isAdminUser(req)) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }

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
    throw new Error("Invalid project_id");
  }

  const parsed = Number(projectId);
  if (!Number.isFinite(parsed)) {
    throw new Error("Invalid project_id");
  }

  const project = await prisma.project.findFirst({
    where: { id: parsed, ...projectScopeWhere(userId), isDeleted: false },
    select: { id: true },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  return Number(project.id);
};

/** Team files require a Team project; Personal files may stay unassigned. */
export const resolveNewFileProjectId = async (
  prisma: PrismaClient,
  userId: string,
  projectId: unknown,
): Promise<number | null> => {
  if (projectId !== null && projectId !== undefined && projectId !== "" && projectId !== "null") {
    return resolveOwnedProjectId(prisma, userId, projectId);
  }

  const scope = currentTeamScope();
  if (scope?.mode === "team") throw new Error("A Team project is required");
  return null;
};
