import { createHash } from "node:crypto";

import { isLocalPostgres } from "./config.js";
import { getStoredInstanceLicense, LicenseClientError, checkSelfHostInstanceLicense } from "./license-client.js";
import { instanceLicenseUsage } from "./instance-license-usage.js";
import { logger } from "./logger.js";

const REPORT_WINDOW_MS = 60 * 60 * 1000;
const RETRY_DELAY_MS = 15 * 60 * 1000;
let reportTimer: ReturnType<typeof setTimeout> | null = null;
let dailyReportRunning = false;

type ReportKind = "daily" | "capacity_change";

function currentLicenseState() {
  try {
    return getStoredInstanceLicense();
  } catch (error) {
    const code = error instanceof LicenseClientError ? error.code : "LICENSE_STATE_INVALID";
    logger.warn({ code }, "Self-host capacity reporting cannot read the stored license");
    return null;
  }
}

function jitterForInstallation(installationId: string): number {
  const digest = createHash("sha256").update(installationId).digest();
  return digest.readUInt32BE(0) % REPORT_WINDOW_MS;
}

async function sendCapacityReport(kind: ReportKind): Promise<boolean> {
  if (!isLocalPostgres() || !currentLicenseState()) return false;
  const usage = await instanceLicenseUsage();
  const result = await checkSelfHostInstanceLicense(usage, { kind });
  return result.capacityReport?.accepted === true;
}

function schedule(delayMs: number, callback: () => void): void {
  if (reportTimer) clearTimeout(reportTimer);
  reportTimer = setTimeout(() => {
    reportTimer = null;
    callback();
  }, Math.max(1000, delayMs));
  reportTimer.unref?.();
}

function nextDailyDelay(now: Date, jitterMs: number): number {
  const target = new Date(now);
  target.setDate(target.getDate() + 1);
  target.setHours(1, 0, 0, 0);
  target.setTime(target.getTime() + jitterMs);
  return target.getTime() - now.getTime();
}

function retryable(error: unknown): boolean {
  return !(error instanceof LicenseClientError) || error.status === 429 || error.status >= 500;
}

async function runDailyReport(jitterMs: number): Promise<void> {
  if (dailyReportRunning) return;
  dailyReportRunning = true;
  try {
    if (!currentLicenseState()) {
      schedule(nextDailyDelay(new Date(), jitterMs), () => void runDailyReport(jitterMs));
      return;
    }

    const accepted = await sendCapacityReport("daily");
    if (!accepted) {
      logger.warn("SaaS did not acknowledge the Self-host capacity report");
      schedule(nextDailyDelay(new Date(), jitterMs), () => void runDailyReport(jitterMs));
      return;
    }

    logger.info("Self-host daily capacity report accepted");
    schedule(nextDailyDelay(new Date(), jitterMs), () => void runDailyReport(jitterMs));
  } catch (error) {
    const code = error instanceof LicenseClientError ? error.code : "CAPACITY_REPORT_FAILED";
    logger.warn({ code }, "Self-host daily capacity report failed");
    schedule(
      retryable(error) ? RETRY_DELAY_MS : nextDailyDelay(new Date(), jitterMs),
      () => void runDailyReport(jitterMs),
    );
  } finally {
    dailyReportRunning = false;
  }
}

export function startSelfHostCapacityReportScheduler(): void {
  if (!isLocalPostgres() || reportTimer) return;

  const state = currentLicenseState();
  if (!state) return;
  const installationId = state.installationId;
  const jitterMs = jitterForInstallation(installationId);
  const now = new Date();
  const today'sTarget = new Date(now);
  today'sTarget.setHours(1, 0, 0, 0);
  today'sTarget.setTime(today'sTarget.getTime() + jitterMs);
  const initialDelay = today'sTarget.getTime() > now.getTime()
    ? today'sTarget.getTime() - now.getTime()
    : Math.max(1000, jitterMs);

  schedule(initialDelay, () => void runDailyReport(jitterMs));
}

export function reportSelfHostCapacityChange(): void {
  if (!isLocalPostgres() || !currentLicenseState()) return;
  const report = { kind: "capacity_change" as const };

  const send = (attempt: number): void => {
    void sendCapacityReport(report.kind).then((accepted) => {
      if (accepted) return;
      logger.warn("SaaS did not acknowledge the Self-host capacity change report");
    }).catch((error: unknown) => {
      const code = error instanceof LicenseClientError ? error.code : "CAPACITY_REPORT_FAILED";
      logger.warn({ code }, "Self-host capacity change report failed");
      if (attempt < 1 && retryable(error)) {
        const timer = setTimeout(() => send(attempt + 1), RETRY_DELAY_MS);
        timer.unref?.();
      }
    });
  };

  send(0);
}
