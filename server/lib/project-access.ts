import { prisma } from "./prisma.js";
import { currentTeamScope } from "./team-scope.js";

/**
 * Project-level roles for Team files (COL-004). The Project creator is `owner`, a Team Manager is `manager`,
 * and every other active member is `commenter` unless a grant row says `editor` or `viewer`.
 */
export type ProjectRole = "owner" | "manager" | "editor" | "commenter" | "viewer";

export const GRANTABLE_ROLES = ["editor", "commenter", "viewer"] as const;
export type GrantableRole = (typeof GRANTABLE_ROLES)[number];

export const canEditRole = (role: ProjectRole | null): boolean => role === "owner" || role === "manager" || role === "editor";
export const canCommentRole = (role: ProjectRole | null): boolean => role !== null && role !== "viewer";
export const canManageAccessRole = (role: ProjectRole | null): boolean => role === "owner" || role === "manager";

function grantedRole(role: string | undefined): GrantableRole {
  return role === "editor" || role === "viewer" ? role : "commenter";
}

/**
 * A Manager keeps full access; a creator does too unless a Manager stored a role for them (COL-007);
 * everyone else follows their grant, Commenter by default.
 */
export function effectiveRole(isCreator: boolean, isManager: boolean, grant: string | undefined): ProjectRole {
  if (isCreator && (isManager || grant === undefined)) return "owner";
  if (isManager) return "manager";
  return grantedRole(grant);
}

/** The signed-in user's role on one Project of the active Team, or null when the Project is outside it. */
export async function projectRoleFor(projectId: number | bigint, userId: string): Promise<ProjectRole | null> {
  const scope = currentTeamScope();
  if (scope?.mode !== "team" || !scope.teamId || !prisma) return null;
  const project = await (prisma as any).project.findFirst({
    where: { id: Number(projectId), teamId: scope.teamId },
    select: {
      userId: true,
      team: { select: { members: { where: { userId, status: "active" }, select: { role: true } } } },
      accessGrants: { where: { userId }, select: { role: true } },
    },
  });
  if (!project) return null;
  return effectiveRole(project.userId === userId, project.team?.members?.[0]?.role === "manager", project.accessGrants?.[0]?.role);
}

/** Roles for a page of Projects in one round trip; Personal Projects are always the user's own. */
export async function projectRolesFor(
  projects: Array<{ id: number | bigint; userId?: string | null }>,
  userId: string,
): Promise<Map<number, ProjectRole>> {
  const roles = new Map<number, ProjectRole>();
  const scope = currentTeamScope();
  if (scope?.mode !== "team" || !scope.teamId || !prisma || projects.length === 0) {
    for (const project of projects) roles.set(Number(project.id), "owner");
    return roles;
  }
  const [member, grants] = await Promise.all([
    (prisma as any).teamMember.findFirst({ where: { teamId: scope.teamId, userId, status: "active" }, select: { role: true } }),
    (prisma as any).projectAccessGrant.findMany({ where: { userId, projectId: { in: projects.map((project) => Number(project.id)) } }, select: { projectId: true, role: true } }),
  ]);
  const granted = new Map<number, string>(grants.map((grant: { projectId: number; role: string }) => [grant.projectId, grant.role]));
  for (const project of projects) {
    const id = Number(project.id);
    roles.set(id, effectiveRole(project.userId === userId, member?.role === "manager", granted.get(id)));
  }
  return roles;
}

/** Role on one file: its creator is the owner; anyone else inherits the Project role, and a missing Project reads as `viewer`. */
export async function fileAccessRole(
  file: { userId?: string | null; projectId?: number | bigint | null },
  userId: string,
): Promise<ProjectRole> {
  if (currentTeamScope()?.mode !== "team" || file.userId === userId) return "owner";
  if (file.projectId === null || file.projectId === undefined) return "viewer";
  return (await projectRoleFor(file.projectId, userId)) ?? "viewer";
}

/** True when a request moves a file to another Project, which only the file's creator may do. */
export function isForeignProjectMove(
  existing: { userId?: string | null; projectId?: number | bigint | null },
  userId: string,
  nextProjectId: number | null | undefined,
): boolean {
  if (nextProjectId === undefined || existing.userId === userId) return false;
  const current = existing.projectId === null || existing.projectId === undefined ? null : Number(existing.projectId);
  return nextProjectId !== current;
}
