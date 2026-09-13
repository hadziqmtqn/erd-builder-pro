import { createDecipheriv, createHash, randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { getCloudAiEncryptionKey, isSsoAuthMode } from "./config.js";
import { parseCloudEntitlement, type CloudEntitlement } from "./cloud-entitlement.js";
import { authenticate } from "./middleware.js";
import { prisma } from "./prisma.js";
import { currentTeamScope } from "./team-scope.js";

type RuntimeConfig = {
  providerCode: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  globalSystemPrompt: string;
  revision: number;
};

type CloudAiAccess = {
  teamId: string;
  userId: string;
  entitlement: CloudEntitlement;
};

type CloudAiReservation = {
  allowed: boolean;
  duplicate: boolean;
};

function isPostgresDatabase(): boolean {
  const url = process.env.DATABASE_URL || "";
  return url.startsWith("postgresql://") || url.startsWith("postgres://");
}

function placeholders(count: number): string {
  return isPostgresDatabase()
    ? Array.from({ length: count }, (_, index) => `$${index + 1}`).join(", ")
    : Array.from({ length: count }, () => "?").join(", ");
}

function dateValue(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function decryptEnvelope(envelope: any): RuntimeConfig | null {
  const secret = getCloudAiEncryptionKey();
  if (!secret || envelope?.version !== 1) return null;
  if (![envelope.iv, envelope.tag, envelope.ciphertext].every((value) => typeof value === "string" && value.length > 0)) return null;

  try {
    const key = createHash("sha256").update(secret).digest();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]);
    const config = JSON.parse(plaintext.toString("utf8"));
    if (typeof config?.provider_code !== "string"
      || typeof config.model_identifier !== "string"
      || typeof config.base_url !== "string"
      || typeof config.api_key !== "string"
      || typeof config.global_system_prompt !== "string"
      || config.enabled !== true) return null;
    if (Number(config.revision) !== Number(envelope.revision)) return null;
    const expiresAt = dateValue(config.expires_at);
    if (config.expires_at !== null && expiresAt !== null && expiresAt <= new Date()) return null;

    return {
      providerCode: config.provider_code,
      model: config.model_identifier,
      baseUrl: config.base_url,
      apiKey: config.api_key,
      globalSystemPrompt: config.global_system_prompt,
      revision: Number(config.revision),
    };
  } catch {
    return null;
  }
}

export async function storeCloudAiEnvelope(envelope: unknown): Promise<boolean> {
  if (!prisma) return false;
  const config = decryptEnvelope(envelope);
  if (!config || !Number.isSafeInteger(config.revision) || config.revision < 1) return false;

  const now = new Date();
  const expiresAt = dateValue((envelope as any)?.expires_at);
  const existing = await prisma.$queryRawUnsafe<Array<{ revision: number }>>(
    `SELECT "revision" FROM "cloud_ai_runtime_configs" WHERE "id" = ${isPostgresDatabase() ? "$1" : "?"}`,
    "global",
  );
  if (existing[0] && Number(existing[0].revision) >= config.revision) return false;

  const values = [
    "global",
    config.revision,
    String((envelope as any).ciphertext),
    String((envelope as any).iv),
    String((envelope as any).tag),
    true,
    expiresAt,
    now,
    now,
    null,
  ];
  const marks = placeholders(values.length);
  if (existing[0]) {
    if (isPostgresDatabase()) {
      await prisma.$executeRawUnsafe(
        `UPDATE "cloud_ai_runtime_configs" SET "revision"=$2, "ciphertext"=$3, "iv"=$4, "auth_tag"=$5, "enabled"=$6, "expires_at"=$7, "received_at"=$8, "updated_at"=$9, "last_error_code"=$10 WHERE "id"=$1`,
        ...values,
      );
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE "cloud_ai_runtime_configs" SET "revision"=?, "ciphertext"=?, "iv"=?, "auth_tag"=?, "enabled"=?, "expires_at"=?, "received_at"=?, "updated_at"=?, "last_error_code"=? WHERE "id"=?`,
        ...values.slice(1),
        values[0],
      );
    }
  } else {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "cloud_ai_runtime_configs" ("id", "revision", "ciphertext", "iv", "auth_tag", "enabled", "expires_at", "received_at", "updated_at", "last_error_code") VALUES (${marks})`,
      ...values,
    );
  }
  return true;
}

export async function getCloudAiRuntimeConfig(): Promise<RuntimeConfig | null> {
  if (!prisma) return null;
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "revision", "ciphertext", "iv", "auth_tag", "enabled", "expires_at" FROM "cloud_ai_runtime_configs" WHERE "id" = ${isPostgresDatabase() ? "$1" : "?"}`,
    "global",
  );
  const row = rows[0];
  if (!row || row.enabled !== true && row.enabled !== 1) return null;
  return decryptEnvelope({
    version: 1,
    revision: Number(row.revision),
    ciphertext: row.ciphertext,
    iv: row.iv,
    tag: row.auth_tag,
    expires_at: row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at,
  });
}

export async function revokeCloudAiRuntimeConfig(revision: number): Promise<void> {
  if (!prisma) return;
  await prisma.$executeRawUnsafe(
    `DELETE FROM "cloud_ai_runtime_configs" WHERE "id" = ${isPostgresDatabase() ? "$1" : "?"} AND "revision" <= ${isPostgresDatabase() ? "$2" : "?"}`,
    "global",
    revision,
  );
}

async function resolveAccess(req: Request): Promise<CloudAiAccess | null> {
  const scope = currentTeamScope();
  const userId = (req as any).user?.id;
  if (!isSsoAuthMode() || scope?.mode !== "team" || !scope.teamId || !userId || !prisma) return null;
  const team = await prisma.team.findUnique({ where: { id: scope.teamId }, select: { status: true, cloudEntitlement: true } });
  let entitlement: CloudEntitlement | null = null;
  try {
    const stored = team?.cloudEntitlement ? JSON.parse(team.cloudEntitlement) : null;
    const normalized = stored && typeof stored === "object" && !Array.isArray(stored)
      ? { ...stored, status: team.status }
      : null;
    entitlement = team ? parseCloudEntitlement(normalized, team.status) : null;
  } catch {
    entitlement = null;
  }
  if (!team || !entitlement || team.status !== "active" || entitlement.capabilities.ai_assistant !== true || entitlement.limits.ai_credits <= 0) return null;
  return { teamId: scope.teamId, userId, entitlement };
}

export function requireCloudAiAccess(req: Request, res: Response, next: NextFunction): void {
  if (!isSsoAuthMode()) {
    next();
    return;
  }
  const continueAfterAuth = async (): Promise<void> => {
    if (await resolveAccess(req)) {
      next();
      return;
    }
    res.status(403).json({ error: "AI Assistant is not included in this Cloud plan or has no credits remaining.", code: "CLOUD_AI_QUOTA_REQUIRED" });
  };
  if ((req as any).user) {
    void continueAfterAuth();
    return;
  }
  void authenticate(req, res, () => { void continueAfterAuth(); });
}

export async function getCloudAiAccess(req: Request): Promise<CloudAiAccess | null> {
  return resolveAccess(req);
}

export async function reserveCloudAiCredit(access: CloudAiAccess, requestId: string, providerCode: string, model: string): Promise<CloudAiReservation> {
  if (!prisma || !access.entitlement.period_start) return { allowed: false, duplicate: false };
  const start = dateValue(access.entitlement.period_start);
  if (!start) return { allowed: false, duplicate: false };
  const end = dateValue(access.entitlement.period_end);
  const now = new Date();
  const requestMarks = placeholders(1);
  const existing = await prisma.$queryRawUnsafe<any[]>(`SELECT "state" FROM "cloud_ai_usage_requests" WHERE "request_id" = ${requestMarks}`, requestId);
  if (existing[0]) return { allowed: false, duplicate: true };

  return prisma.$transaction(async (tx) => {
    const periodId = randomUUID();
    const periodValues = [periodId, access.teamId, start, end, access.entitlement.limits.ai_credits, 0, 0, access.entitlement.revision, now, now];
    const marks = placeholders(periodValues.length);
    const periodSql = `INSERT INTO "cloud_ai_usage_periods" ("id", "team_id", "period_start", "period_end", "limit_credits", "consumed_credits", "reserved_credits", "entitlement_revision", "created_at", "updated_at") VALUES (${marks}) ON CONFLICT ("team_id", "period_start") DO UPDATE SET "limit_credits"=EXCLUDED."limit_credits", "period_end"=EXCLUDED."period_end", "entitlement_revision"=EXCLUDED."entitlement_revision", "updated_at"=EXCLUDED."updated_at"`;
    await (tx as any).$executeRawUnsafe(periodSql, ...periodValues);
    const periodRows = await (tx as any).$queryRawUnsafe(`SELECT "id" FROM "cloud_ai_usage_periods" WHERE "team_id" = ${isPostgresDatabase() ? "$1" : "?"} AND "period_start" = ${isPostgresDatabase() ? "$2" : "?"}`, access.teamId, start) as any[];
    const period = periodRows[0];
    if (!period) return { allowed: false, duplicate: false };
    const id = randomUUID();
    const requestValues = [id, requestId, access.teamId, period.id, access.userId, 1, "pending", providerCode, model, null, now, now];
    try {
      await (tx as any).$executeRawUnsafe(`INSERT INTO "cloud_ai_usage_requests" ("id", "request_id", "team_id", "period_id", "user_id", "credits", "state", "provider_code", "model_identifier", "error_code", "created_at", "updated_at") VALUES (${placeholders(requestValues.length)})`, ...requestValues);
    } catch {
      const duplicate = await (tx as any).$queryRawUnsafe(`SELECT "state" FROM "cloud_ai_usage_requests" WHERE "request_id" = ${requestMarks}`, requestId) as any[];
      return { allowed: false, duplicate: true };
    }
    const updated = isPostgresDatabase()
      ? await (tx as any).$executeRawUnsafe(`UPDATE "cloud_ai_usage_periods" SET "reserved_credits"="reserved_credits"+1, "updated_at"=$2 WHERE "id"=$1 AND "consumed_credits"+"reserved_credits" < "limit_credits"`, period.id, now)
      : await (tx as any).$executeRawUnsafe(`UPDATE "cloud_ai_usage_periods" SET "reserved_credits"="reserved_credits"+1, "updated_at"=? WHERE "id"=? AND "consumed_credits"+"reserved_credits" < "limit_credits"`, now, period.id);
    if (updated !== 1) {
      if (isPostgresDatabase()) {
        await (tx as any).$executeRawUnsafe(`UPDATE "cloud_ai_usage_requests" SET "state"='rejected', "error_code"='AI_CREDITS_EXHAUSTED', "updated_at"=$2 WHERE "request_id"=$1`, requestId, now);
      } else {
        await (tx as any).$executeRawUnsafe(`UPDATE "cloud_ai_usage_requests" SET "state"='rejected', "error_code"='AI_CREDITS_EXHAUSTED', "updated_at"=? WHERE "request_id"=?`, now, requestId);
      }
      return { allowed: false, duplicate: false };
    }
    if (isPostgresDatabase()) {
      await (tx as any).$executeRawUnsafe(`UPDATE "cloud_ai_usage_requests" SET "state"='reserved', "updated_at"=$2 WHERE "request_id"=$1`, requestId, now);
    } else {
      await (tx as any).$executeRawUnsafe(`UPDATE "cloud_ai_usage_requests" SET "state"='reserved', "updated_at"=? WHERE "request_id"=?`, now, requestId);
    }
    return { allowed: true, duplicate: false };
  });
}

export async function finalizeCloudAiCredit(requestId: string, consume: boolean): Promise<void> {
  if (!prisma) return;
  await prisma.$transaction(async (tx) => {
    const rows = await (tx as any).$queryRawUnsafe(`SELECT "period_id", "credits" FROM "cloud_ai_usage_requests" WHERE "request_id" = ${isPostgresDatabase() ? "$1" : "?"} AND "state" = 'reserved'`, requestId) as any[];
    const row = rows[0];
    if (!row) return;
    const now = new Date();
    const requestParam = isPostgresDatabase() ? "$1" : "?";
    const boundedReserved = isPostgresDatabase() ? 'GREATEST("reserved_credits"-1, 0)' : 'MAX("reserved_credits"-1, 0)';
    if (isPostgresDatabase()) {
      await (tx as any).$executeRawUnsafe(`UPDATE "cloud_ai_usage_periods" SET "reserved_credits"=${boundedReserved}, "consumed_credits"="consumed_credits"+${consume ? 1 : 0}, "updated_at"=$2 WHERE "id"=$1`, row.period_id, now);
      await (tx as any).$executeRawUnsafe(`UPDATE "cloud_ai_usage_requests" SET "state"=$2, "updated_at"=$3 WHERE "request_id"=$1`, requestId, consume ? "consumed" : "released", now);
    } else {
      await (tx as any).$executeRawUnsafe(`UPDATE "cloud_ai_usage_periods" SET "reserved_credits"=${boundedReserved}, "consumed_credits"="consumed_credits"+${consume ? 1 : 0}, "updated_at"=? WHERE "id"=?`, now, row.period_id);
      await (tx as any).$executeRawUnsafe(`UPDATE "cloud_ai_usage_requests" SET "state"=?, "updated_at"=? WHERE "request_id"=?`, consume ? "consumed" : "released", now, requestId);
    }
  });
}
