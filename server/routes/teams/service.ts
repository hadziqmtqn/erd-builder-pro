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

const TEAM_ERROR_MESSAGES: Record<string, string> = {
  LICENSE_SERVICE_UNAVAILABLE: "We couldn't reach the license service. Check your internet connection and try again.",
  SERVICE_UNAVAILABLE: "The license service is temporarily unavailable. Please try again later.",
  LICENSE_CLIENT_NOT_CONFIGURED: "License activation isn't configured on this server. Please contact your administrator.",
  LICENSE_API_MUST_USE_HTTPS: "License activation requires a secure connection. Please contact your administrator.",
  LICENSE_API_URL_INVALID: "The license service address is invalid. Please contact your administrator.",
  LICENSE_RESPONSE_INVALID: "The license service returned an unexpected response. Please try again later.",
  LICENSE_REQUEST_REJECTED: "This license key could not be accepted. Check the key and try again.",
  LICENSE_SIGNATURE_INVALID: "We couldn't verify this license. Please contact your administrator.",
  LICENSE_VERIFICATION_NOT_CONFIGURED: "License verification isn't configured on this server. Please contact your administrator.",
  LICENSE_ENTITLEMENT_INVALID: "This license cannot be used to create a Team. Check the key or contact support.",
  LICENSE_EXPIRED: "This license has expired. Use an active license key and try again.",
  LICENSE_EXPIRED_OR_INVALID: "This license is invalid or expired. Check the key and try again.",
  LICENSE_NOT_ACTIVATED: "This Team hasn't been activated yet.",
  LICENSE_STATE_INVALID: "The saved license information is no longer valid. Please contact your administrator.",
  BINDING_GENERATION_MISMATCH: "The license information is out of date. Check the license again or contact support.",
  SELF_HOST_ONLY: "Teams are available only on a self-hosted server.",
  TEAM_NAME_TAKEN: "A Team with this name already exists. Choose a different name.",
  TEAM_PERSISTENCE_FAILED: "The Team couldn't be saved after the license was activated. Please contact support before trying again.",
  SUPER_ADMIN_REQUIRED: "Only the SuperAdmin can manage Teams.",
  LICENSE_MEMBER_LIMIT_MISSING: "This license doesn't include a member limit. Please contact support.",
  USER_NOT_FOUND: "No account was found with that email address.",
  SUPER_ADMIN_CANNOT_BE_MEMBER: "A SuperAdmin cannot be added as a Team member.",
  MEMBER_LIMIT_REACHED: "This Team has reached its member limit.",
  MEMBER_ALREADY_EXISTS: "This person is already a member of this Team.",
  MEMBER_ALREADY_ASSIGNED: "This person is already assigned to another Team.",
};

function teamErrorMessage(code: string): string {
  return TEAM_ERROR_MESSAGES[code] || "We couldn't complete this Team request. Please try again or contact your administrator.";
}

function isLocalDashboardFixture(team: any): boolean {
  return process.env.NODE_ENV !== "production" &&
    process.env.ERDBPRO_TEAM_FIXTURE_MODE === "1" &&
    team?.status === "active" &&
    team?.licenseStatus === "active" &&
    team?.licenseId === `test-fixture:${team.id}` &&
    team?.licenseExpiresAt instanceof Date &&
    team.licenseExpiresAt.getTime() > Date.now();
}

export class TeamServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message = teamErrorMessage(code),
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
  if (isLocalDashboardFixture(team)) {
    return {
      valid: true,
      status: "active",
      id: team.licenseId,
      codeLastFour: "TEST",
      planCode: "team-test",
      expiresAt: team.licenseExpiresAt,
      maxMembers: team.maxMembers ?? 10,
      bindingGeneration: team.bindingGeneration ?? 1,
      lastCheckedAt: null,
    };
  }

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

  const team = await database.team.findUnique({
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
  return team?.type === "personal" ? null : team;
}

export async function canAccessTeam(teamId: string, userId: string, isSuperAdmin: boolean): Promise<boolean> {
  const team = await findTeam(teamId, userId, isSuperAdmin);
  if (!team || team.status !== "active") return false;
  if (isLocalDashboardFixture(team)) return true;
  try {
    verifyStoredLicense(teamId);
    return true;
  } catch {
    return false;
  }
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

  return teams.filter((team: any) => team?.type !== "personal").map((team: any) => toTeamResponse(team, isSuperAdmin));
}

export async function getTeam(teamId: string, userId: string, isSuperAdmin: boolean) {
  assertSuperAdmin(isSuperAdmin);
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
        type: "team",
        createdBy: data.userId,
        status: "active",
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
      const activeMembership = await transaction.teamMember.findFirst({
        where: { userId: user.id, status: "active" },
        select: { teamId: true },
      });
      if (activeMembership) {
        throw new TeamServiceError(
          activeMembership.teamId === teamId ? "MEMBER_ALREADY_EXISTS" : "MEMBER_ALREADY_ASSIGNED",
          409,
        );
      }
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
export async function canUserLogin(userId: string): Promise<{ allowed: true; teamId?: string } | { allowed: false; code: string }> {
  if (!isLocalPostgres() || !prisma) return { allowed: true };
  const memberships = await (prisma as any).teamMember.findMany({
    where: { userId, status: "active" },
    select: {
      teamId: true,
      team: {
        select: {
          id: true,
          status: true,
          licenseStatus: true,
          licenseId: true,
          licenseExpiresAt: true,
        },
      },
    },
  });
  if (memberships.length === 0) return { allowed: true };

  for (const membership of memberships) {
    if (isLocalDashboardFixture(membership.team)) return { allowed: true, teamId: membership.teamId };
    try {
      verifyStoredLicense(membership.teamId);
      return { allowed: true, teamId: membership.teamId };
    } catch {
      // A member may belong to another still-valid Team; only deny when none remain valid.
    }
  }
  const stored = getStoredLicense(memberships[0].teamId);
  return { allowed: false, code: stored ? "LICENSE_EXPIRED_OR_INVALID" : "LICENSE_NOT_ACTIVATED" };
}
