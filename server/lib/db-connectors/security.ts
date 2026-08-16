import { readFileSync } from "node:fs";
import type { ConnectionInfo } from "./types.js";

const SSL_MODES = new Set(["disable", "require", "verify-ca", "verify-full"]);
const ENVIRONMENTS = new Set(["local", "development", "staging", "production"]);
const SAFE_MODES = new Set(["normal", "protected", "read-only"]);

export function normalizeConnectionSecurity(info: ConnectionInfo): ConnectionInfo {
  return {
    ...info,
    environment: ENVIRONMENTS.has(String(info.environment)) ? info.environment : "development",
    safeMode: SAFE_MODES.has(String(info.safeMode)) ? info.safeMode : "protected",
    sslMode: SSL_MODES.has(String(info.sslMode)) ? info.sslMode : "disable",
    queryTimeoutMs: Math.min(Math.max(Number(info.queryTimeoutMs) || 30_000, 1_000), 600_000),
  };
}

export function tlsOptions(info: ConnectionInfo) {
  const mode = info.sslMode || "disable";
  if (mode === "disable") return undefined;
  const read = (file?: string) => file?.trim() ? readFileSync(file.trim(), "utf8") : undefined;
  const verify = mode === "verify-ca" || mode === "verify-full";
  return {
    rejectUnauthorized: verify,
    checkServerIdentity: mode === "verify-ca" ? () => undefined : undefined,
    ca: read(info.sslCa),
    cert: read(info.sslCert),
    key: read(info.sslKey),
  };
}

export function assertWritable(info: ConnectionInfo) {
  if (info.safeMode === "read-only") throw new Error("Connection is in read-only Safe Mode");
}

export function assertDestructiveAllowed(info: ConnectionInfo, expected: string, confirmation: unknown) {
  assertWritable(info);
  if (info.environment !== "production" && info.safeMode !== "protected") return;
  if (String(confirmation || "") !== expected) {
    throw new Error(`Type "${expected}" to confirm this destructive action`);
  }
}
