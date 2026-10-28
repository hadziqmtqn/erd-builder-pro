import { AsyncLocalStorage } from "node:async_hooks";

import { isLocalPostgres } from "./config.js";

export type TeamScope = {
  mode: "personal" | "team";
  teamId: string | null;
};

const scopes = new AsyncLocalStorage<TeamScope>();

export function runWithTeamScope<T>(scope: TeamScope, callback: () => T): T {
  return scopes.run(scope, callback);
}

export function currentTeamScope(): TeamScope | null {
  return isLocalPostgres() ? scopes.getStore() || { mode: "personal", teamId: null } : null;
}

export function projectScopeWhere(userId: string): Record<string, unknown> {
  const scope = currentTeamScope();
  if (!scope) return { userId };
  return scope.mode === "team"
    ? { teamId: scope.teamId }
    : { userId, teamId: null };
}

export function fileScopeWhere(userId: string): Record<string, unknown> {
  const scope = currentTeamScope();
  if (!scope) return { userId };
  return scope.mode === "team"
    ? { project: { teamId: scope.teamId } }
    : { userId, OR: [{ projectId: null }, { project: { userId, teamId: null } }] };
}

export function fileIdentifierWhere(identifier: string, userId: string): Record<string, unknown> {
  const id = Number(identifier);
  const identity = Number.isFinite(id) ? { OR: [{ uid: identifier }, { id }] } : { uid: identifier };
  return { AND: [identity, fileScopeWhere(userId)] };
}

/** File identifier constrained to the signed-in creator for destructive actions. */
export function creatorFileIdentifierWhere(identifier: string, userId: string): Record<string, unknown> {
  return { AND: [fileIdentifierWhere(identifier, userId), { userId }] };
}

/**
 * Who keeps full access to a Team file whatever a Project grant says: its creator, Team Managers, and the Project
 * creator until a Manager stores a role for them (COL-004, COL-007).
 */
function fullAccessWhere(userId: string): Record<string, unknown>[] {
  return [
    { userId },
    { project: { userId, accessGrants: { none: { userId } } } },
    { project: { team: { members: { some: { userId, role: "manager", status: "active" } } } } },
  ];
}

/** File identifier constrained to people who may change its content: full access, or an Editor grant on its Project. */
export function editableFileIdentifierWhere(identifier: string, userId: string): Record<string, unknown> {
  if (currentTeamScope()?.mode !== "team") return creatorFileIdentifierWhere(identifier, userId);
  return {
    AND: [
      fileIdentifierWhere(identifier, userId),
      { OR: [...fullAccessWhere(userId), { project: { accessGrants: { some: { userId, role: "editor" } } } }] },
    ],
  };
}

/** File identifier constrained to people who may comment: everyone in scope except an explicit Viewer. */
export function commentableFileIdentifierWhere(identifier: string, userId: string): Record<string, unknown> {
  if (currentTeamScope()?.mode !== "team") return fileIdentifierWhere(identifier, userId);
  return {
    AND: [
      fileIdentifierWhere(identifier, userId),
      { OR: [...fullAccessWhere(userId), { NOT: { project: { accessGrants: { some: { userId, role: "viewer" } } } } }] },
    ],
  };
}
