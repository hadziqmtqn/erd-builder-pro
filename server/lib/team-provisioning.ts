import { createHmac, timingSafeEqual } from "node:crypto";

import { getInstallationIdentity } from "./installation-identity.js";

type TeamRecord = { id: string; status: string; createdAt: Date };
type MembershipRecord = { id: string; teamId: string; userId: string; status: string; joinedAt: Date };

function sign(value: string): string {
  return createHmac("sha256", getInstallationIdentity().privateKey).update(value).digest("base64url");
}

function matches(actual: string | null | undefined, expected: string): boolean {
  if (!actual || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function teamProvisioningSignature(team: TeamRecord): string {
  return sign(["team", team.id, team.status, team.createdAt.toISOString()].join("|"));
}

export function membershipProvisioningSignature(member: MembershipRecord): string {
  return sign(["member", member.id, member.teamId, member.userId, member.status, member.joinedAt.toISOString()].join("|"));
}

export function isProvisionedTeam(team: TeamRecord & { provisioningSignature?: string | null }): boolean {
  return matches(team.provisioningSignature, teamProvisioningSignature(team));
}

export function isProvisionedMembership(member: MembershipRecord & { provisioningSignature?: string | null }): boolean {
  return matches(member.provisioningSignature, membershipProvisioningSignature(member));
}
