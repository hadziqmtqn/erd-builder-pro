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
    : { userId, OR: [{ projectId: null }, { project: { teamId: null } }] };
}

export function fileIdentifierWhere(identifier: string, userId: string): Record<string, unknown> {
  const id = Number(identifier);
  const identity = Number.isFinite(id) ? { OR: [{ uid: identifier }, { id }] } : { uid: identifier };
  return { AND: [identity, fileScopeWhere(userId)] };
}
