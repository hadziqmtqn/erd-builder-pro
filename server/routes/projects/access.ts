import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { canManageAccessRole, effectiveRole, GRANTABLE_ROLES, projectRoleFor, type GrantableRole, type ProjectRole } from "../../lib/project-access.js";
import { currentTeamScope } from "../../lib/team-scope.js";

/** Project access for Team members (COL-004). Only the Project creator and Team Managers manage it; everyone else gets the generic not-found. */

export type AccessMember = {
  userId: string;
  name: string | null;
  email: string | null;
  teamRole: string;
  role: ProjectRole;
  /** The Project creator: full access until a Team Manager stores a role for them (COL-007). */
  isCreator: boolean;
  /** Managers always have full access; only a Manager changes the creator's role. */
  canChange: boolean;
};

export type AccessResult<T> = { ok: true; data: T } | { ok: false; status: 400 | 404; error: string };

const notFound = { ok: false, status: 404, error: "Resource not found" } as const;

export function isGrantableRole(value: unknown): value is GrantableRole {
  return typeof value === "string" && (GRANTABLE_ROLES as readonly string[]).includes(value);
}

async function managedProject(projectId: number, actorId: string) {
  const scope = currentTeamScope();
  if (!prisma || scope?.mode !== "team" || !scope.teamId || !Number.isInteger(projectId)) return null;
  const actorRole = await projectRoleFor(projectId, actorId);
  if (!canManageAccessRole(actorRole)) return null;
  const project = await (prisma as any).project.findFirst({ where: { id: projectId, teamId: scope.teamId }, select: { id: true, userId: true } });
  const actor = await (prisma as any).teamMember.findFirst({ where: { teamId: scope.teamId, userId: actorId, status: "active" }, select: { role: true } });
  return project ? { teamId: scope.teamId, ownerId: project.userId as string | null, actorIsManager: actor?.role === "manager" } : null;
}

export async function listProjectAccess(projectId: number, actorId: string): Promise<AccessResult<{ members: AccessMember[] }>> {
  const project = await managedProject(projectId, actorId);
  if (!project) return notFound;
  const [members, grants] = await Promise.all([
    (prisma as any).teamMember.findMany({
      where: { teamId: project.teamId, status: "active" },
      select: { userId: true, role: true, user: { select: { name: true, email: true } } },
      orderBy: { joinedAt: "asc" },
    }),
    (prisma as any).projectAccessGrant.findMany({ where: { projectId }, select: { userId: true, role: true } }),
  ]);
  const granted = new Map<string, string>(grants.map((grant: { userId: string; role: string }) => [grant.userId, grant.role]));
  return {
    ok: true,
    data: {
      members: members.map((member: any): AccessMember => {
        const isCreator = member.userId === project.ownerId;
        const isManager = member.role === "manager";
        return {
          userId: member.userId,
          name: member.user?.name ?? null,
          email: member.user?.email ?? null,
          teamRole: member.role,
          role: effectiveRole(isCreator, isManager, granted.get(member.userId)),
          isCreator,
          canChange: !isManager && (!isCreator || project.actorIsManager),
        };
      }),
    },
  };
}

export async function setProjectAccess(projectId: number, actorId: string, targetId: string, role: GrantableRole): Promise<AccessResult<{ userId: string; role: GrantableRole }>> {
  const project = await managedProject(projectId, actorId);
  if (!project) return notFound;
  const target = await (prisma as any).teamMember.findFirst({ where: { teamId: project.teamId, userId: targetId, status: "active" }, select: { role: true } });
  if (!target) return notFound;
  if (target.role === "manager") {
    return { ok: false, status: 400, error: "Team Managers always have full access" };
  }
  if (targetId === project.ownerId && !project.actorIsManager) {
    return { ok: false, status: 400, error: "Only a Team Manager can change the Project creator's access" };
  }
  await (prisma as any).$transaction(async (tx: any) => {
    const previous = await tx.projectAccessGrant.findUnique({ where: { projectId_userId: { projectId, userId: targetId } }, select: { role: true } });
    await tx.projectAccessGrant.upsert({
      where: { projectId_userId: { projectId, userId: targetId } },
      create: { id: randomUUID(), projectId, userId: targetId, role, grantedBy: actorId },
      update: { role, grantedBy: actorId },
    });
    await tx.teamAuditEvent.create({
      data: {
        teamId: project.teamId,
        actorId,
        action: "project_access_changed",
        targetType: "project",
        targetId: String(projectId),
        metadata: JSON.stringify({ userId: targetId, role, previousRole: previous?.role ?? null }),
      },
    });
  });
  return { ok: true, data: { userId: targetId, role } };
}

/** Removes the explicit role, which puts the member back on the default (commenter). */
export async function clearProjectAccess(projectId: number, actorId: string, targetId: string): Promise<AccessResult<{ userId: string }>> {
  const project = await managedProject(projectId, actorId);
  if (!project) return notFound;
  if (targetId === project.ownerId && !project.actorIsManager) {
    return { ok: false, status: 400, error: "Only a Team Manager can change the Project creator's access" };
  }
  await (prisma as any).$transaction(async (tx: any) => {
    const previous = await tx.projectAccessGrant.findUnique({ where: { projectId_userId: { projectId, userId: targetId } }, select: { role: true } });
    if (!previous) return;
    await tx.projectAccessGrant.delete({ where: { projectId_userId: { projectId, userId: targetId } } });
    await tx.teamAuditEvent.create({
      data: {
        teamId: project.teamId,
        actorId,
        action: "project_access_changed",
        targetType: "project",
        targetId: String(projectId),
        metadata: JSON.stringify({ userId: targetId, role: null, previousRole: previous.role }),
      },
    });
  });
  return { ok: true, data: { userId: targetId } };
}
