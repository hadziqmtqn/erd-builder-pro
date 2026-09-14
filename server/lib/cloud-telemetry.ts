import { fetchWithTimeout, getCloudMachineToken } from "./cloud-ai.js";
import { getCloudTelemetryConfig, isSsoAuthMode } from "./config.js";
import { logger } from "./logger.js";
import { prisma } from "./prisma.js";

const CLOUD_TELEMETRY_INTERVAL_MS = 5 * 60 * 1000;
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

export async function sendCloudTelemetryHeartbeat(): Promise<boolean> {
  if (!isSsoAuthMode() || !prisma) return false;

  const config = getCloudTelemetryConfig();
  if (!config.issuerUrl || !config.clientId || !config.clientSecret || !config.deploymentId) return false;

  try {
    const token = await getCloudMachineToken(config, "cloud:telemetry");
    const response = await fetchWithTimeout(new URL("/api/v1/cloud/telemetry/heartbeat", config.issuerUrl).toString(), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({
        deployment_id: config.deploymentId,
        ...(config.tenantRef ? { tenant_ref: config.tenantRef } : {}),
        observed_at: new Date().toISOString(),
        version: config.version,
        status: "ready",
        aggregate: await aggregate(),
        error_codes: [],
      }),
    });

    if (!response.ok) throw new Error("telemetry heartbeat failed with HTTP " + response.status);
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
