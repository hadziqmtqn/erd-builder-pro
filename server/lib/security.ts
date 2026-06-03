import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import type { PrismaClient } from "@prisma/client";
import { isDesktopMode } from "./config.js";

export const isAdminUser = (req: ExpressRequest) => {
  // Desktop mode is single-user — local user is always the admin.
  if (isDesktopMode()) return true;

  const user = (req as any).user;
  if (!user) return false;

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
    where: { id: parsed, userId, isDeleted: false },
    select: { id: true },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  return Number(project.id);
};
