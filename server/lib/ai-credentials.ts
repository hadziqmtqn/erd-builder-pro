import { randomBytes } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { decrypt, encrypt } from "./crypto.js";
import { isDesktopMode } from "./config.js";

const ENCRYPTED_PREFIX = "enc:v1:";

function defaultKeyPath(): string {
  const databaseUrl = process.env.DATABASE_URL || "";
  const databasePath = databaseUrl.startsWith("file:")
    ? databaseUrl.slice(5).split("?")[0]
    : databaseUrl.endsWith(".db") ? databaseUrl : "";

  if (databasePath && databasePath !== ":memory:") {
    return path.resolve(path.dirname(databasePath), ".erd-encryption-key");
  }

  return path.resolve(process.cwd(), ".erd-encryption-key");
}

function ensureEncryptionKey(): void {
  if (process.env.ERD_ENCRYPTION_KEY) return;
  if (!isDesktopMode()) {
    throw new Error("ERD_ENCRYPTION_KEY is required for web deployments");
  }

  const keyPath = process.env.ERD_ENCRYPTION_KEY_FILE || defaultKeyPath();
  try {
    const existing = readFileSync(keyPath, "utf8").trim();
    if (existing.length >= 32) {
      process.env.ERD_ENCRYPTION_KEY = existing;
      return;
    }
  } catch {
    // Generate the installation key below.
  }

  const generated = randomBytes(32).toString("hex");
  try {
    writeFileSync(keyPath, generated, { encoding: "utf8", mode: 0o600, flag: "wx" });
  } catch (error: any) {
    if (error?.code !== "EEXIST") {
      throw new Error("AI encryption key is unavailable; set ERD_ENCRYPTION_KEY or ERD_ENCRYPTION_KEY_FILE");
    }
  }

  try {
    process.env.ERD_ENCRYPTION_KEY = readFileSync(keyPath, "utf8").trim();
    chmodSync(keyPath, 0o600);
  } catch {
    throw new Error("AI encryption key is unavailable; set ERD_ENCRYPTION_KEY or ERD_ENCRYPTION_KEY_FILE");
  }
}

export function protectAiApiKey(value: string): string {
  ensureEncryptionKey();
  return `${ENCRYPTED_PREFIX}${encrypt(value)}`;
}

export function revealAiApiKey(value: string): string {
  if (!value.startsWith(ENCRYPTED_PREFIX)) return value;
  ensureEncryptionKey();
  try {
    return decrypt(value.slice(ENCRYPTED_PREFIX.length));
  } catch {
    throw new Error("Stored AI API key cannot be decrypted");
  }
}

export function isProtectedAiApiKey(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}
