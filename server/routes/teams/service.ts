import { randomUUID } from "node:crypto";

import { getSsoConfig, isLocalPostgres, isSsoAuthMode } from "../../lib/config.js";
import { hashPassword } from "../../lib/desktop-auth.js";
import { checkSelfHostInstanceLicense, getStoredInstanceLicense, LicenseClientError, verifyStoredInstanceLicense, type VerifiedEntitlement } from "../../lib/license-client.js";
import { prisma } from "../../lib/prisma.js";
import { isProvisionedMembership, isProvisionedTeam, membershipProvisioningSignature, teamProvisioningSignature } from "../../lib/team-provisioning.js";
import { cloudCapabilities } from "../../lib/cloud-capability.js";
import { withTeamCapacityTransaction } from "../../lib/team-capacity-transaction.js";
import { instanceLicenseUsage } from "../../lib/instance-license-usage.js";

export const TEAM_ROLES = ["manager", "staff"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

const messages: Record<string, string> = {
  SELF_HOST_ONLY: "Teams are available only on a self-hosted server.", SUPER_ADMIN_REQUIRED: "Only the SuperAdmin can create Teams.", TEAM_MANAGER_REQUIRED: "Only a Team Manager can manage this Team.", TEAM_NAME_TAKEN: "A Team with this name already exists.", TEAM_LIMIT_REACHED: "This installation has reached its Team limit.", MEMBER_LIMIT_REACHED: "This installation has reached its active member limit.", MEMBER_ALREADY_EXISTS: "This person is already a member of this Team.", MEMBER_BANNED: "This member has been banned from this Team.", USER_NOT_FOUND: "No account was found with that email address.", SUPER_ADMIN_CANNOT_BE_MEMBER: "A SuperAdmin cannot be added as a Team member.", LAST_MANAGER_REQUIRED: "A Team must retain at least one Manager.", MEMBER_INACTIVE: "Your Team membership is inactive. Contact the SuperAdmin to restore access.", TEAM_INTEGRITY_UNAVAILABLE: "This Team is unavailable because its membership records could not be verified. Contact the SuperAdmin.", LICENSE_SYNC_REQUIRED: "License verification is temporarily unavailable. Team and member capacity changes are disabled until this installation can reach ERDBPro SaaS.",
  CLOUD_TEAM_MANAGED_EXTERNALLY: "Cloud Teams and members are managed from your ERDBPro account.",
  INTEGRITY_QUARANTINE_NOT_APPLICABLE: "This Team no longer has an active integrity issue that can be quarantined.",
  MEMBER_INTEGRITY_QUARANTINE_NOT_APPLICABLE: "This membership no longer has an active integrity issue that can be quarantined.",
  TEAM_INACTIVE: "This Team is inactive.",
  TEAM_STATUS_CHANGE_NOT_ALLOWED: "Only a verified active or inactive Team can change status. Quarantined Teams require integrity recovery.",
  INSTANCE_CAPACITY_EXCEEDED: "This installation exceeds its license capacity. The SuperAdmin can reduce active Teams or members from Team Workspaces.",
  MEMBER_QUARANTINED: "This membership is quarantined and cannot be reactivated through Team management.",
};
export class TeamServiceError extends Error { constructor(public readonly code: string, public readonly status: number, message = messages[code] || "We couldn't complete this Team request.") { super(message); this.name = "TeamServiceError"; } }
const database = () => { if (!isLocalPostgres() || !prisma) throw new TeamServiceError("SELF_HOST_ONLY", 404); return prisma as any; };
const admin = (value: boolean) => { if (!value) throw new TeamServiceError("SUPER_ADMIN_REQUIRED", 403); };
const localMutation = () => { if (isSsoAuthMode()) throw new TeamServiceError("CLOUD_TEAM_MANAGED_EXTERNALLY", 403); };
export const isTeamRole = (value: unknown): value is TeamRole => typeof value === "string" && (TEAM_ROLES as readonly string[]).includes(value);

const usage = instanceLicenseUsage;
const temporaryLicenseFailure = (error: unknown) => error instanceof LicenseClientError && error.status >= 500;
async function entitlement(forceRefresh = false): Promise<VerifiedEntitlement> {
  try { const state = getStoredInstanceLicense(); if (!state) throw new LicenseClientError("LICENSE_NOT_ACTIVATED", 409); if (!forceRefresh && Date.now() - Date.parse(state.lastCheckedAt) < 900_000) return verifyStoredInstanceLicense().entitlement; return (await checkSelfHostInstanceLicense(await usage())).entitlement; }
  catch (error) { if (temporaryLicenseFailure(error)) { if (!forceRefresh) return verifyStoredInstanceLicense({ allowGrace: true }).entitlement; throw new TeamServiceError("LICENSE_SYNC_REQUIRED", 503); } if (error instanceof LicenseClientError) throw new TeamServiceError(error.code, error.status); throw error; }
}
export async function requireActiveInstanceLicense(options: { refresh?: boolean } = {}): Promise<VerifiedEntitlement> {
  try { return await entitlement(options.refresh === true); }
  catch (error) {
    if (error instanceof TeamServiceError && error.code === "LICENSE_SYNC_REQUIRED") throw error;
    if (error instanceof TeamServiceError) throw new TeamServiceError("INSTANCE_LICENSE_REQUIRED", 403, "User and Team Management require an active instance license.");
    throw error;
  }
}
type TeamResponseMember = { id: string | number; email: string | null; name: string | null; role: TeamRole; status: string; joinedAt: Date };
function response(team: any, canManage: boolean) { const members: TeamResponseMember[] | undefined = Array.isArray(team.members) ? team.members.map((member: any): TeamResponseMember => ({ id: member.user?.id || member.userId, email: member.user?.email || null, name: member.user?.name || null, role: isTeamRole(member.role) ? member.role : "staff", status: member.status, joinedAt: member.joinedAt })) : undefined; const manageUrl = isSsoAuthMode() && team.ssoOrganizationId ? new URL(`/organizations/${encodeURIComponent(team.ssoOrganizationId)}`, getSsoConfig().issuerUrl).toString() : undefined; const capabilities = isSsoAuthMode() ? cloudCapabilities(team.cloudEntitlement, team.status) : undefined; return { id: team.id, name: team.name, status: team.status, members, memberCount: members ? members.filter((member: TeamResponseMember) => member.status === "active").length : team._count?.members ?? 0, canManage, manageUrl, capabilities }; }
function teamInclude() { return { _count: { select: { members: { where: { status: "active" } } } }, members: { include: { user: { select: { id: true, email: true, name: true } } } } }; }
async function team(id: string, userId: string, superAdmin: boolean) { const db = database(); if (!superAdmin && !(await db.teamMember.findFirst({ where: { teamId: id, userId, status: "active" } }))) return null; const value = await db.team.findUnique({ where: { id }, include: teamInclude() }); return value?.type === "personal" ? null : value; }
async function verifyTeamIntegrity(value: any, db = database()) {
  if (!isProvisionedTeam(value)) throw new TeamServiceError("TEAM_INTEGRITY_UNAVAILABLE", 403);
  const members = value.members || await db.teamMember.findMany({ where: { teamId: value.id } });
  if (members.filter((member: any) => member.status === "active").some((member: any) => !isProvisionedMembership(member))) {
    throw new TeamServiceError("TEAM_INTEGRITY_UNAVAILABLE", 403);
  }
}
function enforceCapacity(plan: VerifiedEntitlement, current: { teamCount: number; memberCount: number }) {
  if ((plan.maxTeams !== null && current.teamCount > plan.maxTeams) || (plan.maxMembers !== null && current.memberCount > plan.maxMembers)) {
    throw new TeamServiceError("INSTANCE_CAPACITY_EXCEEDED", 403);
  }
}
async function integrity(value: any) {
  await verifyTeamIntegrity(value);
  if (isSsoAuthMode()) return null;
  const plan = await entitlement();
  enforceCapacity(plan, await usage());
  return plan;
}
async function managedTeam(id: string, userId: string, superAdmin: boolean) {
  manager(await canManageTeam(id, userId, superAdmin));
  const value = await team(id, userId, superAdmin);
  if (!value) return null;
  if (superAdmin && !isSsoAuthMode()) {
    await verifyTeamIntegrity(value);
    await requireActiveInstanceLicense();
  } else {
    if (value.status !== "active") throw new TeamServiceError("TEAM_INACTIVE", 403);
    await integrity(value);
  }
  return value;
}

export async function reviewTeamIntegrity(id: string, superAdmin: boolean) {
  admin(superAdmin);
  localMutation();
  const value = await database().team.findUnique({ where: { id }, include: teamInclude() });
  if (!value || value.type === "personal") return null;
  const teamSignatureValid = isProvisionedTeam(value);
  const members = (value.members || []).map((member: any) => ({
    id: member.id,
    userId: member.userId,
    name: member.user?.name || null,
    email: member.user?.email || null,
    status: member.status,
    signatureValid: isProvisionedMembership(member),
  }));
  return {
    team: { id: value.id, name: value.name, status: value.status },
    teamSignatureValid,
    members,
  };
}

export async function quarantineTeam(id: string, actorId: string, superAdmin: boolean): Promise<boolean> {
  localMutation();
  admin(superAdmin);
  database();
  return withTeamCapacityTransaction(async (tx) => {
    const value = await tx.team.findUnique({ where: { id } });
    if (!value || value.type === "personal") return false;
    if (value.status === "quarantined" || isProvisionedTeam(value)) throw new TeamServiceError("INTEGRITY_QUARANTINE_NOT_APPLICABLE", 409);

    const changed = await tx.team.updateMany({
      where: {
        id: value.id,
        status: value.status,
        createdAt: value.createdAt,
        cloudEntitlement: value.cloudEntitlement,
        provisioningSignature: value.provisioningSignature,
      },
      data: { status: "quarantined" },
    });
    if (changed.count !== 1) throw new TeamServiceError("INTEGRITY_QUARANTINE_NOT_APPLICABLE", 409);
    await tx.teamAuditEvent.create({
      data: {
        teamId: value.id,
        actorId,
        action: "integrity_quarantine",
        targetType: "team",
        targetId: value.id,
        metadata: JSON.stringify({ reason: "invalid_provisioning_signature" }),
      },
    });
    return true;
  });
}

export async function quarantineMember(teamId: string, userId: string, actorId: string, superAdmin: boolean): Promise<boolean> {
  localMutation();
  admin(superAdmin);
  database();
  return withTeamCapacityTransaction(async (tx) => {
    const value = await tx.team.findUnique({ where: { id: teamId } });
    if (!value || value.type === "personal") return false;
    if (value.status !== "active" || !isProvisionedTeam(value)) throw new TeamServiceError("MEMBER_INTEGRITY_QUARANTINE_NOT_APPLICABLE", 409);

    const member = await tx.teamMember.findFirst({ where: { teamId, userId, status: "active" } });
    if (!member) return false;
    if (isProvisionedMembership(member)) throw new TeamServiceError("MEMBER_INTEGRITY_QUARANTINE_NOT_APPLICABLE", 409);

    const changed = await tx.teamMember.updateMany({
      where: {
        id: member.id,
        teamId: member.teamId,
        userId: member.userId,
        role: member.role,
        status: member.status,
        joinedAt: member.joinedAt,
        provisioningSignature: member.provisioningSignature,
      },
      data: { status: "quarantined" },
    });
    if (changed.count !== 1) throw new TeamServiceError("MEMBER_INTEGRITY_QUARANTINE_NOT_APPLICABLE", 409);
    await tx.teamAuditEvent.create({
      data: {
        teamId: value.id,
        actorId,
        action: "integrity_quarantine",
        targetType: "team_member",
        targetId: member.id,
        metadata: JSON.stringify({ reason: "invalid_provisioning_signature", userId }),
      },
    });
    return true;
  });
}

export async function canManageTeam(teamId: string, userId: string, superAdmin?: boolean) { const db = database(); const isSuperAdmin = superAdmin ?? Boolean((await db.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } }))?.isSuperAdmin); if (isSuperAdmin) return true; return (await db.teamMember.findFirst({ where: { teamId, userId, status: "active" }, select: { role: true } }))?.role === "manager"; }
function manager(canManage: boolean) { if (!canManage) throw new TeamServiceError("TEAM_MANAGER_REQUIRED", 403); }
export async function canAccessTeam(id: string, userId: string, superAdmin: boolean) { try { const value = await team(id, userId, superAdmin); if (!value || value.status !== "active") return false; await integrity(value); return true; } catch { return false; } }
export async function listTeamInventory(superAdmin: boolean) {
  admin(superAdmin);
  localMutation();
  const teams = await database().team.findMany({
    where: { type: { not: "personal" } },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { members: true } },
      members: { where: { status: "active" } },
    },
  });

  let license = null;
  try { const { entitlement: plan } = verifyStoredInstanceLicense({ allowGrace: true }); license = { maxTeams: plan.maxTeams, maxMembers: plan.maxMembers }; } catch {}
  return {
    license,
    teams: teams.map((value: any) => ({
      id: value.id,
      name: value.name,
      status: value.status,
      createdAt: value.createdAt,
      memberCount: value._count?.members ?? 0,
      activeMemberCount: value.members?.length ?? 0,
      canChangeStatus: ["active", "inactive"].includes(value.status) && isProvisionedTeam(value) && (value.members || []).every((member: any) => isProvisionedMembership(member)),
    })),
    usage: await usage(),
  };
}
export async function listTeams(userId: string, superAdmin: boolean) { if (!isSsoAuthMode()) await requireActiveInstanceLicense(); const db = database(); const values = superAdmin ? await db.team.findMany({ include: teamInclude() }) : (await db.teamMember.findMany({ where: { userId, status: "active" }, include: { team: { include: teamInclude() } } })).map((member: any) => member.team); const output = await Promise.all(values.filter((value: any) => value.type !== "personal" && value.status === "active").map(async (value: any) => { try { await integrity(value); return response(value, await canManageTeam(value.id, userId, superAdmin)); } catch (error) { return superAdmin && error instanceof TeamServiceError && ["TEAM_INTEGRITY_UNAVAILABLE", "INSTANCE_CAPACITY_EXCEEDED"].includes(error.code) ? { ...response(value, true), integrity: { available: false, code: error.code } } : null; } })); return output.filter(Boolean); }
export async function getTeam(id: string, userId: string, superAdmin: boolean) {
  const value = await managedTeam(id, userId, superAdmin);
  if (!value) return null;
  if (!superAdmin || isSsoAuthMode()) return response(value, true);
  const plan = await requireActiveInstanceLicense();
  const current = await usage();
  return { ...response(value, true), capacity: { ...current, maxTeams: plan.maxTeams, maxMembers: plan.maxMembers, exceeded: (plan.maxTeams !== null && current.teamCount > plan.maxTeams) || (plan.maxMembers !== null && current.memberCount > plan.maxMembers) } };
}
async function mutationTeam(db: any, id: string, actorId: string, superAdmin: boolean) {
  if (!superAdmin) {
    const membership = await db.teamMember.findFirst({ where: { teamId: id, userId: actorId, status: "active" }, select: { role: true } });
    manager(membership?.role === "manager");
  }
  const value = await db.team.findUnique({ where: { id }, include: teamInclude() });
  if (!value || value.type === "personal") return null;
  await verifyTeamIntegrity(value, db);
  return value;
}
export async function createTeam(data: { name: string; userId: string; isSuperAdmin: boolean }) {
  localMutation(); admin(data.isSuperAdmin); database();
  await requireActiveInstanceLicense({ refresh: true });
  return withTeamCapacityTransaction(async (db) => {
    const plan = verifyStoredInstanceLicense().entitlement;
    const name = data.name.trim();
    if (await db.team.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })) throw new TeamServiceError("TEAM_NAME_TAKEN", 409);
    const current = await usage(db);
    if (plan.maxTeams !== null && current.teamCount >= plan.maxTeams) throw new TeamServiceError("TEAM_LIMIT_REACHED", 409);
    enforceCapacity(plan, { ...current, teamCount: current.teamCount + 1 });
    const id = randomUUID(); const createdAt = new Date();
    const created = await db.team.create({ data: { id, name, type: "team", createdBy: data.userId, status: "active", createdAt, provisioningSignature: teamProvisioningSignature({ id, status: "active", createdAt }) } });
    await db.teamAuditEvent.create({ data: { teamId: id, actorId: data.userId, action: "team_created", targetType: "team", targetId: id, metadata: "{}" } });
    return response(created, true);
  });
}
export async function updateTeam(id: string, name: string, userId: string, superAdmin: boolean) { localMutation(); const db = database(); const value = await managedTeam(id, userId, superAdmin); if (!value) return null; const normalized = name.trim(); const duplicate = await db.team.findFirst({ where: { id: { not: id }, name: { equals: normalized, mode: "insensitive" } }, select: { id: true } }); if (duplicate) throw new TeamServiceError("TEAM_NAME_TAKEN", 409); await db.team.update({ where: { id }, data: { name: normalized } }); return getTeam(id, userId, superAdmin); }
export async function changeTeamStatus(id: string, status: "active" | "inactive", actorId: string, superAdmin: boolean) {
  localMutation(); admin(superAdmin); database();
  if (!["active", "inactive"].includes(status)) throw new TeamServiceError("TEAM_STATUS_CHANGE_NOT_ALLOWED", 422);
  if (status === "active") await requireActiveInstanceLicense({ refresh: true });
  else await requireActiveInstanceLicense();
  return withTeamCapacityTransaction(async (db) => {
    const value = await db.team.findUnique({ where: { id }, include: teamInclude() });
    if (!value || value.type === "personal") return false;
    if (!["active", "inactive"].includes(value.status)) throw new TeamServiceError("TEAM_STATUS_CHANGE_NOT_ALLOWED", 409);
    await verifyTeamIntegrity(value, db);
    if (value.status === status) return true;
    if (status === "active") {
      const plan = verifyStoredInstanceLicense().entitlement;
      const current = await usage(db);
      const activeMembers = await db.teamMember.findMany({ where: { status: "active", team: { type: { not: "personal" }, status: "active" } }, select: { userId: true }, distinct: ["userId"] });
      const userIds = new Set(activeMembers.map((member: any) => member.userId));
      for (const member of value.members || []) if (member.status === "active") userIds.add(member.userId);
      if (plan.maxTeams !== null && current.teamCount >= plan.maxTeams) throw new TeamServiceError("TEAM_LIMIT_REACHED", 409);
      if (plan.maxMembers !== null && userIds.size > plan.maxMembers) throw new TeamServiceError("MEMBER_LIMIT_REACHED", 409);
      enforceCapacity(plan, { teamCount: current.teamCount + 1, memberCount: userIds.size });
    }
    const changed = await db.team.updateMany({
      where: { id, status: value.status, createdAt: value.createdAt, cloudEntitlement: value.cloudEntitlement, provisioningSignature: value.provisioningSignature },
      data: { status, provisioningSignature: teamProvisioningSignature({ ...value, status }) },
    });
    if (changed.count !== 1) throw new TeamServiceError("TEAM_STATUS_CHANGE_NOT_ALLOWED", 409);
    await db.teamAuditEvent.create({ data: { teamId: id, actorId, action: status === "active" ? "team_activated" : "team_deactivated", targetType: "team", targetId: id, metadata: JSON.stringify({ previousStatus: value.status, status }) } });
    return true;
  });
}
export async function addMember(teamId: string, email: string, actorId: string, superAdmin: boolean, account: { name?: string; password?: string; role?: TeamRole } = {}) {
  localMutation();
  if (!await managedTeam(teamId, actorId, superAdmin)) return null;
  await requireActiveInstanceLicense({ refresh: true });
  await withTeamCapacityTransaction(async (db) => {
    const value = await mutationTeam(db, teamId, actorId, superAdmin);
    if (!value || value.status !== "active") throw new TeamServiceError("TEAM_INACTIVE", 409);
    await verifyTeamIntegrity(value, db);
    const plan = verifyStoredInstanceLicense().entitlement;
    let user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user && (!account.name || !account.password)) throw new TeamServiceError("USER_NOT_FOUND", 404);
    if (user?.isSuperAdmin) throw new TeamServiceError("SUPER_ADMIN_CANNOT_BE_MEMBER", 409);
    const existing = user && await db.teamMember.findFirst({ where: { teamId, userId: user.id } });
    if (existing?.status === "banned") throw new TeamServiceError("MEMBER_BANNED", 403);
    if (existing?.status === "quarantined") throw new TeamServiceError("MEMBER_QUARANTINED", 403);
    if (existing?.status === "active") throw new TeamServiceError("MEMBER_ALREADY_EXISTS", 409);
    const active = user && await db.teamMember.findFirst({ where: { userId: user.id, status: "active", team: { type: { not: "personal" }, status: "active" } } });
    const current = await usage(db);
    if (!active && plan.maxMembers !== null && current.memberCount >= plan.maxMembers) throw new TeamServiceError("MEMBER_LIMIT_REACHED", 409);
    enforceCapacity(plan, { ...current, memberCount: current.memberCount + (active ? 0 : 1) });
    user = user || await db.user.create({ data: { email: email.trim().toLowerCase(), name: account.name!.trim(), password: hashPassword(account.password!), isSuperAdmin: false } });
    const id = existing?.id || randomUUID(); const joinedAt = existing?.joinedAt || new Date(); const role = account.role || "staff";
    const provisioningSignature = membershipProvisioningSignature({ id, teamId, userId: user.id, role, status: "active", joinedAt });
    await db.teamMember.upsert({ where: { teamId_userId: { teamId, userId: user.id } }, create: { id, teamId, userId: user.id, role, status: "active", joinedAt, provisioningSignature }, update: { role, status: "active", joinedAt, provisioningSignature } });
    await db.teamAuditEvent.create({ data: { teamId, actorId, action: "member_activated", targetType: "team_member", targetId: id, metadata: JSON.stringify({ userId: user.id, role }) } });
  });
  return getTeam(teamId, actorId, superAdmin);
}
export async function updateMemberRole(teamId: string, userId: string, role: TeamRole, actorId: string, superAdmin: boolean) {
  localMutation(); if (!await managedTeam(teamId, actorId, superAdmin)) return null;
  const updated = await withTeamCapacityTransaction(async (db) => {
    const value = await mutationTeam(db, teamId, actorId, superAdmin);
    if (!value || value.status !== "active") throw new TeamServiceError("TEAM_INACTIVE", 409);
    await verifyTeamIntegrity(value, db);
    const member = await db.teamMember.findFirst({ where: { teamId, userId, status: "active" } });
    if (!member) return false;
    if (member.role === "manager" && role !== "manager" && await db.teamMember.count({ where: { teamId, status: "active", role: "manager" } }) <= 1) throw new TeamServiceError("LAST_MANAGER_REQUIRED", 409);
    await db.teamMember.update({ where: { id: member.id }, data: { role, provisioningSignature: membershipProvisioningSignature({ ...member, role }) } });
    return true;
  });
  return updated ? getTeam(teamId, actorId, superAdmin) : null;
}
async function deactivateMembership(teamId: string, userId: string, actorId: string, status: "inactive" | "banned", superAdmin: boolean) {
  if (!await managedTeam(teamId, actorId, superAdmin)) return false;
  return withTeamCapacityTransaction(async (db) => {
    const value = await mutationTeam(db, teamId, actorId, superAdmin);
    if (!value) return false;
    if (!superAdmin && value.status !== "active") throw new TeamServiceError("TEAM_INACTIVE", 409);
    await verifyTeamIntegrity(value, db);
    const member = await db.teamMember.findFirst({ where: { teamId, userId, status: "active" } });
    if (!member) return false;
    if (member.role === "manager" && await db.teamMember.count({ where: { teamId, status: "active", role: "manager" } }) <= 1) throw new TeamServiceError("LAST_MANAGER_REQUIRED", 409);
    await db.teamMember.update({ where: { id: member.id }, data: { status, provisioningSignature: membershipProvisioningSignature({ ...member, status }) } });
    await db.session.deleteMany({ where: { userId } });
    await db.teamAuditEvent.create({ data: { teamId, actorId, action: status === "inactive" ? "member_deactivated" : "member_banned", targetType: "team_member", targetId: member.id, metadata: JSON.stringify({ userId, status }) } });
    return true;
  });
}
export async function removeMember(teamId: string, userId: string, actorId: string, superAdmin: boolean) {
  localMutation(); if (!superAdmin && userId === actorId) throw new TeamServiceError("CANNOT_REMOVE_SELF", 409, "You cannot deactivate your own Team membership.");
  return deactivateMembership(teamId, userId, actorId, "inactive", superAdmin);
}
export async function banMember(teamId: string, userId: string, actorId: string, superAdmin: boolean) {
  localMutation(); admin(superAdmin);
  return deactivateMembership(teamId, userId, actorId, "banned", superAdmin);
}
export async function canUserLogin(userId: string): Promise<{ allowed: true; teamId?: string } | { allowed: false; code: string }> {
  if (!isLocalPostgres() || !prisma) return { allowed: true };

  const memberships = await (prisma as any).teamMember.findMany({ where: { userId, status: "active" } });
  if (!memberships.length) return { allowed: true };

  let integrityUnavailable = false;
  let capacityExceeded = false;
  let inactiveTeam = false;
  for (const membership of memberships) {
    const value = await team(membership.teamId, userId, false);
    if (!value || value.status !== "active") {
      if (value?.status === "inactive") inactiveTeam = true;
      if (value?.status === "quarantined") integrityUnavailable = true;
      continue;
    }

    try {
      await integrity(value);
      return { allowed: true, teamId: membership.teamId };
    } catch (error) {
      if (error instanceof TeamServiceError && error.code === "TEAM_INTEGRITY_UNAVAILABLE") integrityUnavailable = true;
      if (error instanceof TeamServiceError && error.code === "INSTANCE_CAPACITY_EXCEEDED") capacityExceeded = true;
    }
  }

  // Cloud users may still use Personal while every remote Team is locked.
  if (isSsoAuthMode()) return { allowed: true };
  return { allowed: false, code: integrityUnavailable ? "TEAM_INTEGRITY_UNAVAILABLE" : capacityExceeded ? "INSTANCE_CAPACITY_EXCEEDED" : inactiveTeam ? "TEAM_INACTIVE" : "LICENSE_EXPIRED_OR_INVALID" };
}
