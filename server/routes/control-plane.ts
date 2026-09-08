import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { getCloudWebhookSecret } from "../lib/config.js";
import { isUuid } from "../lib/erd-column-id-migration.js";
import { membershipProvisioningSignature, teamProvisioningSignature } from "../lib/team-provisioning.js";

const router = Router();
const MAX_CLOCK_SKEW_SECONDS = 300;

function equal(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function rawBody(req: any): string {
  return Buffer.isBuffer(req.rawBody) ? req.rawBody.toString("utf8") : "";
}

export function isValidCloudWebhook(input: {
  secret: string; eventId: string; timestamp: string; signature: string; body: string; now?: number;
}): boolean {
  const timestampNumber = Number(input.timestamp);
  const expected = input.secret && input.timestamp && input.body
    ? `sha256=${createHmac("sha256", input.secret).update(`${input.timestamp}.${input.body}`).digest("hex")}`
    : "";
  return Boolean(input.secret)
    && isUuid(input.eventId)
    && /^\d+$/.test(input.timestamp)
    && Number.isSafeInteger(timestampNumber)
    && Math.abs(Math.floor((input.now ?? Date.now()) / 1000) - timestampNumber) <= MAX_CLOCK_SKEW_SECONDS
    && equal(input.signature, expected);
}

export function isValidCloudOrganization(organization: any): boolean {
  if (typeof organization?.id !== "string" || !isUuid(organization.id)
    || typeof organization.name !== "string" || !organization.name.trim() || organization.name.length > 255
    || !["active", "locked"].includes(organization.status)
    || !Array.isArray(organization.members) || organization.members.length > 10_000) return false;

  const memberIds = organization.members.map((member: any) => member?.user_id);
  return organization.members.every((member: any) => typeof member?.user_id === "string" && isUuid(member.user_id)
    && ["manager", "staff"].includes(member.role) && ["active", "inactive"].includes(member.status))
    && new Set(memberIds).size === memberIds.length;
}

router.post("/events", async (req, res) => {
  const secret = getCloudWebhookSecret();
  const eventId = req.header("X-ERDBPro-Event-Id") || "";
  const timestamp = req.header("X-ERDBPro-Timestamp") || "";
  const signature = req.header("X-ERDBPro-Signature") || "";
  const body = rawBody(req);
  if (!prisma || !isValidCloudWebhook({ secret, eventId, timestamp, signature, body })) {
    res.status(401).json({ error: "Invalid webhook signature." });
    return;
  }

  let event: any;
  try { event = JSON.parse(body); } catch { res.status(400).json({ error: "Invalid webhook payload." }); return; }
  if (event?.id !== eventId || event?.type !== "cloud.workspace.sync" || !event?.data?.organization) {
    res.status(400).json({ error: "Invalid webhook payload." });
    return;
  }

  const organization = event.data.organization;
  if (!isValidCloudOrganization(organization)) {
    res.status(400).json({ error: "Invalid webhook payload." });
    return;
  }

  try {
    const applied = await prisma.$transaction(async (tx) => {
      const inserted = await tx.$executeRawUnsafe(
        `INSERT INTO "team_audit_events" ("id", "action", "target_type", "target_id", "metadata") VALUES ('${eventId}', 'cloud_webhook_received', 'cloud_event', '${eventId}', '{"type":"cloud.workspace.sync"}') ON CONFLICT ("target_type", "target_id") WHERE "target_type" = 'cloud_event' DO NOTHING`,
      );
      if (inserted === 0) return false;

      const existing = await tx.team.findUnique({ where: { ssoOrganizationId: organization.id } });
      const createdAt = existing?.createdAt ?? new Date();
      const teamId = existing?.id ?? randomUUID();
      const team = existing
        ? await tx.team.update({ where: { id: existing.id }, data: { name: organization.name.trim(), status: organization.status, provisioningSignature: teamProvisioningSignature({ id: existing.id, status: organization.status, createdAt }) } })
        : await tx.team.create({ data: { id: teamId, name: organization.name.trim(), type: "team", status: organization.status, ssoOrganizationId: organization.id, provisioningSignature: teamProvisioningSignature({ id: teamId, status: organization.status, createdAt }), createdAt } });
      const syncedUserIds = new Set<string>();

      for (const member of organization.members) {
        const localUser = await tx.user.findUnique({ where: { ssoSubject: member.user_id } });
        if (!localUser) continue;
        syncedUserIds.add(localUser.id);
        const current = await tx.teamMember.findUnique({ where: { teamId_userId: { teamId: team.id, userId: localUser.id } } });
        const joinedAt = current?.joinedAt ?? new Date();
        const memberId = current?.id ?? randomUUID();
        const provisioningSignature = membershipProvisioningSignature({ id: memberId, teamId: team.id, userId: localUser.id, role: member.role, status: member.status, joinedAt });
        await tx.teamMember.upsert({ where: { teamId_userId: { teamId: team.id, userId: localUser.id } }, create: { id: memberId, teamId: team.id, userId: localUser.id, role: member.role, status: member.status, joinedAt, provisioningSignature }, update: { role: member.role, status: member.status, provisioningSignature } });
      }

      const stale = await tx.teamMember.findMany({ where: { teamId: team.id, status: "active" } });
      for (const member of stale) {
        if (syncedUserIds.has(member.userId)) continue;
        await tx.teamMember.update({ where: { id: member.id }, data: { status: "inactive", provisioningSignature: membershipProvisioningSignature({ ...member, status: "inactive" }) } });
      }
      return true;
    });
    res.json({ accepted: true, duplicate: !applied });
  } catch {
    res.status(500).json({ error: "Webhook processing failed." });
  }
});

export default router;
