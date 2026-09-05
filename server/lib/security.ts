import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
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

/** New files created from an active Team always belong to a Team project. */
export const resolveNewFileProjectId = async (
  prisma: PrismaClient,
  userId: string,
  projectId: unknown,
): Promise<number | null> => {
  if (projectId !== null && projectId !== undefined && projectId !== "" && projectId !== "null") {
    return resolveOwnedProjectId(prisma, userId, projectId);
  }

  const scope = currentTeamScope();
  if (scope?.mode !== "team" || !scope.teamId) return null;

  const existing = await prisma.project.findFirst({
    where: { teamId: scope.teamId, name: "Uncategorized", isDeleted: false },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (existing) return Number(existing.id);

  const created = await prisma.project.create({
    data: { uid: randomUUID(), name: "Uncategorized", userId, teamId: scope.teamId },
    select: { id: true },
  });
  return Number(created.id);
};
