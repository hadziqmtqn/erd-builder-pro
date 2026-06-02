import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import type { PrismaClient } from "@prisma/client";

export const isAdminUser = (req: ExpressRequest) => {
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
): Promise<bigint | null> => {
  if (projectId === null || projectId === undefined || projectId === "" || projectId === "null") {
    return null;
  }

  let parsed: bigint;
  try {
    parsed = typeof projectId === "bigint" ? projectId : BigInt(String(projectId));
  } catch {
    throw new Error("Invalid project_id");
  }

  const project = await prisma.project.findFirst({
    where: { id: parsed, userId, isDeleted: false },
    select: { id: true },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  return project.id;
};
