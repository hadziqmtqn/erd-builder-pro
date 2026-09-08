import { randomUUID } from "node:crypto";

import { parseCloudEntitlement, serializeCloudEntitlement, type CloudEntitlement } from "../../lib/cloud-entitlement.js";
import { membershipProvisioningSignature, teamProvisioningSignature } from "../../lib/team-provisioning.js";

const roles = ["owner", "manager", "staff"] as const;

export type SsoWorkspace = {
  id: string;
  name: string;
  type: "personal" | "team";
  role: (typeof roles)[number];
  status: "active" | "locked";
  entitlement: CloudEntitlement | null;
};

export function parseSsoWorkspaces(value: unknown): SsoWorkspace[] {
  if (!Array.isArray(value)) throw new Error("workspace grant response is invalid");

  const identifiers = new Set<string>();
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("workspace grant is invalid");
    const grant = item as Record<string, unknown>;
    const entitlement = grant.type === "team" ? parseCloudEntitlement(grant.entitlement, String(grant.status)) : null;
    if (typeof grant.id !== "string" || !grant.id.trim() || grant.id.length > 255
      || typeof grant.name !== "string" || !grant.name.trim() || grant.name.length > 255
      || (grant.type !== "personal" && grant.type !== "team")
      || !roles.includes(grant.role as SsoWorkspace["role"])
      || (grant.status !== "active" && grant.status !== "locked")
      || (grant.type === "team" && !entitlement)) {
      throw new Error("workspace grant is invalid");
    }
    if (identifiers.has(grant.id)) throw new Error("workspace grant is duplicated");
    identifiers.add(grant.id);
    return {
      id: grant.id,
      name: grant.name.trim(),
      type: grant.type,
      role: grant.role as SsoWorkspace["role"],
      status: grant.status,
      entitlement,
    };
  });
}

export async function syncSsoWorkspaces(db: any, userId: string, workspaces: SsoWorkspace[]): Promise<void> {
  const grants = workspaces.filter((workspace) => workspace.type === "team");
  const authoritativeIds = grants.map((workspace) => workspace.id);

  await db.$transaction(async (tx: any) => {
    for (const grant of grants) {
      const existing = await tx.team.findUnique({ where: { ssoOrganizationId: grant.id } });
      const createdAt = existing?.createdAt ?? new Date();
      const teamId = existing?.id ?? randomUUID();
      const cloudEntitlement = serializeCloudEntitlement(grant.entitlement!);
      const teamData = {
        name: grant.name,
        status: grant.status,
        cloudEntitlement,
        provisioningSignature: teamProvisioningSignature({ id: teamId, status: grant.status, createdAt, cloudEntitlement }),
      };
      const team = existing
        ? await tx.team.update({ where: { id: teamId }, data: teamData })
        : await tx.team.create({
          data: { id: teamId, ...teamData, type: "team", createdBy: userId, ssoOrganizationId: grant.id, createdAt },
        });
      const existingMember = await tx.teamMember.findUnique({
        where: { teamId_userId: { teamId: team.id, userId } },
      });
      const memberId = existingMember?.id ?? randomUUID();
      const joinedAt = existingMember?.joinedAt ?? new Date();
      const role = grant.role === "staff" ? "staff" : "manager";
      const membershipData = {
        role,
        status: "active",
        joinedAt,
        provisioningSignature: membershipProvisioningSignature({
          id: memberId, teamId: team.id, userId, role, status: "active", joinedAt,
        }),
      };
      await tx.teamMember.upsert({
        where: { teamId_userId: { teamId: team.id, userId } },
        create: { id: memberId, teamId: team.id, userId, ...membershipData },
        update: membershipData,
      });
    }

    const staleMemberships = await tx.teamMember.findMany({
      where: {
        userId,
        status: "active",
        team: {
          ssoOrganizationId: authoritativeIds.length ? { notIn: authoritativeIds } : { not: null },
        },
      },
    });
    for (const membership of staleMemberships) {
      await tx.teamMember.update({
        where: { id: membership.id },
        data: {
          status: "inactive",
          provisioningSignature: membershipProvisioningSignature({ ...membership, status: "inactive" }),
        },
      });
    }
  });
}
