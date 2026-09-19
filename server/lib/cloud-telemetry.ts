import { fetchWithTimeout, getCloudMachineToken, isPostgresDatabase } from "./cloud-ai.js";
import { getCloudTelemetryConfig, isSsoAuthMode } from "./config.js";
import { logger } from "./logger.js";
import { prisma } from "./prisma.js";

const CLOUD_TELEMETRY_INTERVAL_MS = 5 * 60 * 1000;
const CLOUD_AI_USAGE_WINDOW_DAYS = 90;
let telemetryTimer: ReturnType<typeof setInterval> | null = null;

async function aggregate(): Promise<{
  teams: number;
  members: number;
  projects: number;
  files: number;
}> {
  if (!prisma) throw new Error("database unavailable");

  const active = { OR: [{ isDeleted: false }, { isDeleted: null }] };
  const [teams, members, projects, diagrams, notes, drawings, flowcharts] = await Promise.all([
    prisma.team.count({ where: { status: "active" } }),
    prisma.teamMember.count({ where: { status: "active" } }),
    prisma.project.count({ where: active }),
    prisma.diagram.count({ where: active }),
    prisma.note.count({ where: active }),
    prisma.drawing.count({ where: active }),
    prisma.flowchart.count({ where: active }),
  ]);

  return { teams, members, projects, files: diagrams + notes + drawings + flowcharts };
}

async function aggregateAiUsage(reportedAt: string): Promise<Array<{
  organization_id: string;
  period_start: string;
  period_end: string | null;
  credits_used: number;
  requests_succeeded: number;
  requests_failed: number;
  source_revision: string;
  reported_at: string;
}>> {
  if (!prisma) throw new Error("database unavailable");

  const cutoff = new Date(Date.now() - CLOUD_AI_USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const postgres = isPostgresDatabase();
  const rows = await prisma.$queryRawUnsafe<Array<{
    organization_id: string;
    period_start: Date | string;
    period_end: Date | string | null;
    credits_used: number;
    requests_succeeded: number;
    requests_failed: number;
    source_revision: string;
  }>>(`
    SELECT teams."sso_organization_id" AS organization_id,
           periods."period_start" AS period_start,
           periods."period_end" AS period_end,
           periods."consumed_credits" AS credits_used,
           COALESCE(SUM(CASE WHEN requests."state" = 'consumed' AND requests."error_code" IS NULL THEN 1 ELSE 0 END), 0) AS requests_succeeded,
           COALESCE(SUM(CASE WHEN requests."state" IN ('released', 'rejected') OR requests."error_code" IS NOT NULL THEN 1 ELSE 0 END), 0) AS requests_failed,
           periods."entitlement_revision" AS source_revision
      FROM "cloud_ai_usage_periods" AS periods
      JOIN "teams" AS teams ON teams."id" = periods."team_id" AND teams."sso_organization_id" IS NOT NULL
      LEFT JOIN "cloud_ai_usage_requests" AS requests ON requests."period_id" = periods."id"
     WHERE periods."period_start" >= ${postgres ? "$1" : "?"}
     GROUP BY teams."sso_organization_id", periods."period_start", periods."period_end", periods."consumed_credits", periods."entitlement_revision"
     ORDER BY periods."period_start" DESC`, postgres ? cutoff : cutoff.toISOString());

  return rows.map((row) => ({
    organization_id: row.organization_id,
    period_start: new Date(String(row.period_start)).toISOString(),
    period_end: row.period_end ? new Date(String(row.period_end)).toISOString() : null,
    credits_used: Number(row.credits_used),
    requests_succeeded: Number(row.requests_succeeded),
    requests_failed: Number(row.requests_failed),
    source_revision: row.source_revision,
    reported_at: reportedAt,
  }));
}

export async function sendCloudTelemetryHeartbeat(): Promise<boolean> {
  if (!isSsoAuthMode() || !prisma) return false;

  const config = getCloudTelemetryConfig();
  if (!config.issuerUrl || !config.clientId || !config.clientSecret || !config.deploymentId) return false;

  try {
    const token = await getCloudMachineToken(config, "cloud:telemetry");
    const observedAt = new Date().toISOString();
    const aggregateSnapshot = await aggregate();
    const aiUsage = await aggregateAiUsage(observedAt);
    const batches = aiUsage.length > 0
      ? Array.from({ length: Math.ceil(aiUsage.length / 100) }, (_, index) => aiUsage.slice(index * 100, index * 100 + 100))
      : [[]];
    const url = new URL("/api/v1/cloud/telemetry/heartbeat", config.issuerUrl).toString();
    for (const batch of batches) {
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          deployment_id: config.deploymentId,
          ...(config.tenantRef ? { tenant_ref: config.tenantRef } : {}),
          observed_at: observedAt,
          version: config.version,
          status: "ready",
          aggregate: aggregateSnapshot,
          ai_usage: batch,
          error_codes: [],
        }),
      });

      if (!response.ok) throw new Error("telemetry heartbeat failed with HTTP " + response.status);
    }
    return true;
  } catch (error) {
    logger.warn({ reason: error instanceof Error ? error.message : "unknown error" }, "Cloud telemetry heartbeat failed");
    return false;
  }
}

export function startCloudTelemetry(): void {
  if (!isSsoAuthMode() || telemetryTimer) return;
  void sendCloudTelemetryHeartbeat();
  telemetryTimer = setInterval(() => { void sendCloudTelemetryHeartbeat(); }, CLOUD_TELEMETRY_INTERVAL_MS);
  telemetryTimer.unref?.();
}
