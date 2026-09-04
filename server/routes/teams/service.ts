import { randomUUID } from "node:crypto";

import { isLocalPostgres } from "../../lib/config.js";
import { prisma } from "../../lib/prisma.js";
import {
  activateSelfHostLicense,
  checkSelfHostLicense,
  getStoredLicense,
  removeStoredLicense,
  storeLicense,
  verifyStoredLicense,
  LicenseClientError,
  type VerifiedEntitlement,
} from "../../lib/license-client.js";

export class TeamServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message = code,
  ) {
    super(message);
    this.name = "TeamServiceError";
  }
}

function db(): any {
  if (!isLocalPostgres() || !prisma) {
    throw new TeamServiceError("SELF_HOST_ONLY", 404);
  }
  return prisma;
}

function assertSuperAdmin(isSuperAdmin: boolean): void {
  if (!isSuperAdmin) throw new TeamServiceError("SUPER_ADMIN_REQUIRED", 403);
}

function mapClientError(error: unknown): TeamServiceError | null {
  if (!(error instanceof LicenseClientError)) return null;
  return new TeamServiceError(error.code, error.status);
}

function licenseInfo(team: any) {
  let stored: ReturnType<typeof getStoredLicense>;
  try {
    stored = getStoredLicense(team.id);
  } catch (error) {
    return {
      valid: false,
      status: "invalid",
      id: team.licenseId,
      codeLastFour: team.licenseCodeLastFour,
      planCode: null,
      expiresAt: team.licenseExpiresAt,
      maxMembers: team.maxMembers,
      bindingGeneration: team.bindingGeneration ?? 0,
      lastCheckedAt: null,
      errorCode: error instanceof LicenseClientError ? error.code : "LICENSE_STATE_INVALID",
    };
  }
  if (!stored) {
    return {
      valid: false,
      status: "not_activated",
      id: team.licenseId,
      codeLastFour: team.licenseCodeLastFour,
      planCode: null,
      expiresAt: team.licenseExpiresAt,
      maxMembers: team.maxMembers,
      bindingGeneration: team.bindingGeneration ?? 0,
      lastCheckedAt: null,
    };
  }

  try {
    const { entitlement } = verifyStoredLicense(team.id);
    return {
      valid: true,
      status: "active",
      id: entitlement.licenseId,
      codeLastFour: stored.codeLastFour,
      planCode: entitlement.planCode,
      expiresAt: new Date(entitlement.expiresAt * 1000),
      maxMembers: entitlement.maxMembers,
      bindingGeneration: entitlement.bindingGeneration,
      lastCheckedAt: stored.lastCheckedAt,
    };
  } catch (error) {
    const code = error instanceof LicenseClientError ? error.code : "LICENSE_INVALID";
    return {
      valid: false,
      status: code === "LICENSE_EXPIRED" ? "expired" : "invalid",
      id: stored.licenseId,
      codeLastFour: stored.codeLastFour,
      planCode: null,
      expiresAt: team.licenseExpiresAt,
      maxMembers: team.maxMembers,
      bindingGeneration: stored.bindingGeneration,
      lastCheckedAt: stored.lastCheckedAt,
      errorCode: code,
    };
  }
}

function toMember(member: any) {
  return {
    id: member.user?.id || member.userId,
    email: member.user?.email || null,
    name: member.user?.name || null,
    role: "member",
    status: member.status,
    joinedAt: member.joinedAt,
  };
}

function toTeamResponse(team: any, canManage: boolean) {
  const members = Array.isArray(team.members) ? team.members.map(toMember) : undefined;
  return {
    id: team.id,
    name: team.name,
    members,
    memberCount: members ? members.length : team._count?.members ?? 0,
    canManage,
    license: licenseInfo(team),
  };
}

async function findTeam(teamId: string, userId: string, isSuperAdmin: boolean): Promise<any | null> {
  const database = db();
  if (!isSuperAdmin) {
    const membership = await database.teamMember.findFirst({
      where: { teamId, userId, status: "active" },
      select: { id: true },
    });
    if (!membership) return null;
  }

  return database.team.findUnique({
    where: { id: teamId },
    include: {
      _count: { select: { members: true } },
      members: {
        where: { status: "active" },
        orderBy: { joinedAt: "asc" },
        include: { user: { select: { id: true, email: true, name: true } } },
      },
    },
  });
}

export async function listTeams(userId: string, isSuperAdmin: boolean) {
  const database = db();
  const teams = isSuperAdmin
    ? await database.team.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { members: true } } } })
    : (await database.teamMember.findMany({
        where: { userId, status: "active" },
        orderBy: { joinedAt: "desc" },
        include: { team: { include: { _count: { select: { members: true } } } } },
      })).map((membership: any) => membership.team);

  return teams.map((team: any) => toTeamResponse(team, isSuperAdmin));
}

export async function getTeam(teamId: string, userId: string, isSuperAdmin: boolean) {
  const team = await findTeam(teamId, userId, isSuperAdmin);
  return team ? toTeamResponse(team, isSuperAdmin) : null;
}

export async function createTeam(data: {
  name: string;
  licenseKey: string;
  activationGrant?: string;
  userId: string;
  isSuperAdmin: boolean;
}) {
  const database = db();
  assertSuperAdmin(data.isSuperAdmin);
  const name = data.name.trim();

  const duplicate = await database.team.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) throw new TeamServiceError("TEAM_NAME_TAKEN", 409);

  const teamId = randomUUID();
  let activation;
  try {
    activation = await activateSelfHostLicense({
      teamId,
      teamName: name,
      licenseKey: data.licenseKey.trim(),
      activationGrant: data.activationGrant?.trim(),
      memberCount: 0,
    });
  } catch (error) {
    throw mapClientError(error) || error;
  }

  // Remote activation and local persistence cannot share one transaction. If the
  // database write fails, the SaaS binding still needs a manual reset.
  try {
    const now = new Date(activation.entitlement.expiresAt * 1000);
    const team = await database.team.create({
      data: {
        id: teamId,
        name,
        licenseId: activation.entitlement.licenseId,
        licenseCodeLastFour: activation.codeLastFour,
        licenseStatus: "active",
        licenseExpiresAt: now,
        maxMembers: activation.entitlement.maxMembers,
        bindingGeneration: activation.entitlement.bindingGeneration,
      },
      include: { _count: { select: { members: true } } },
    });
    // Store the opaque token only after the Team row exists; it is never returned.
    storeLicense(activation.state);
    return toTeamResponse(team, true);
  } catch {
    try {
      await database.team.delete({ where: { id: teamId } });
    } catch {
      // Keep the original persistence failure; the remote binding still needs manual reset.
    }
    try {
      removeStoredLicense(teamId);
    } catch {
      // The state file may be unavailable; do not mask the original failure.
    }
    throw new TeamServiceError("TEAM_PERSISTENCE_FAILED", 500);
  }
}

export async function refreshTeamLicense(teamId: string, userId: string, isSuperAdmin: boolean) {
  assertSuperAdmin(isSuperAdmin);
  const database = db();
  const team = await findTeam(teamId, userId, isSuperAdmin);
  if (!team) return null;
  const memberCount = await database.teamMember.count({ where: { teamId, status: "active" } });

  let result;
  try {
    result = await checkSelfHostLicense({ teamId, teamName: team.name, memberCount });
  } catch (error) {
    throw mapClientError(error) || error;
  }

  await database.team.update({
    where: { id: teamId },
    data: {
      licenseId: result.entitlement.licenseId,
      licenseStatus: "active",
      licenseExpiresAt: new Date(result.entitlement.expiresAt * 1000),
      maxMembers: result.entitlement.maxMembers,
      bindingGeneration: result.entitlement.bindingGeneration,
    },
  });
  return getTeam(teamId, userId, true);
}

export async function addMember(teamId: string, email: string, isSuperAdmin: boolean) {
  assertSuperAdmin(isSuperAdmin);
  const database = db();
  const team = await database.team.findUnique({ where: { id: teamId } });
  if (!team) return null;

  let entitlement: VerifiedEntitlement;
  try {
    entitlement = verifyStoredLicense(teamId).entitlement;
  } catch (error) {
    throw mapClientError(error) || error;
  }
  if (entitlement.maxMembers === null) {
    throw new TeamServiceError("LICENSE_MEMBER_LIMIT_MISSING", 409);
  }
  const maxMembers = entitlement.maxMembers;

  const user = await database.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, email: true, name: true, isSuperAdmin: true },
  });
  if (!user) throw new TeamServiceError("USER_NOT_FOUND", 404);
  if (user.isSuperAdmin) throw new TeamServiceError("SUPER_ADMIN_CANNOT_BE_MEMBER", 409);

  try {
    await database.$transaction(async (transaction: any) => {
      // ponytail: serializable transaction keeps concurrent member additions inside the seat limit.
      const memberCount = await transaction.teamMember.count({ where: { teamId, status: "active" } });
      if (memberCount >= maxMembers) throw new TeamServiceError("MEMBER_LIMIT_REACHED", 409);
      await transaction.teamMember.create({
        data: { id: randomUUID(), teamId, userId: user.id, role: "member", status: "active" },
      });
    }, { isolationLevel: "Serializable" });
  } catch (error: any) {
    if (error?.code === "P2002") throw new TeamServiceError("MEMBER_ALREADY_EXISTS", 409);
    throw error;
  }
  return getTeam(teamId, user.id, true);
}

export async function removeMember(teamId: string, userId: string, isSuperAdmin: boolean) {
  assertSuperAdmin(isSuperAdmin);
  const database = db();
  const result = await database.teamMember.deleteMany({ where: { teamId, userId } });
  return result.count > 0;
}

/** Existing Team members need a valid signed lease before a local session is accepted. */
export async function canUserLogin(userId: string): Promise<{ allowed: true } | { allowed: false; code: string }> {
  if (!isLocalPostgres() || !prisma) return { allowed: true };
  const memberships = await (prisma as any).teamMember.findMany({
    where: { userId, status: "active" },
    select: { teamId: true },
  });
  if (memberships.length === 0) return { allowed: true };

  for (const membership of memberships) {
    try {
      verifyStoredLicense(membership.teamId);
      return { allowed: true };
    } catch {
      // A member may belong to another still-valid Team; only deny when none remain valid.
    }
  }
  const stored = getStoredLicense(memberships[0].teamId);
  return { allowed: false, code: stored ? "LICENSE_EXPIRED_OR_INVALID" : "LICENSE_NOT_ACTIVATED" };
}
