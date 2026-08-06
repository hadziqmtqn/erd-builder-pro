import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isDesktopMode } from "./config.js";

const ALGORITHM = "aes-256-gcm";
const KEY_SALT = "db-connect-salt";
const LEGACY_SECRET = "erd-builder-pro-db-connect-key-2024";

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

/** Ensure an installed app has a stable key without requiring an env file. */
export function ensureEncryptionKey(): void {
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

function getSecrets(): string[] {
  const current = process.env.ERD_ENCRYPTION_KEY;
  if (current) return [current, LEGACY_SECRET].filter((secret, index, all) => all.indexOf(secret) === index);

  if (isDesktopMode()) {
    ensureEncryptionKey();
    return [process.env.ERD_ENCRYPTION_KEY!, LEGACY_SECRET].filter((secret, index, all) => all.indexOf(secret) === index);
  }

  return [LEGACY_SECRET];
}

function getKey(secret: string): Buffer {
  return scryptSync(secret, KEY_SALT, 32);
}

function decryptWithSecret(encoded: string, secret: string): string {
  const [ivHex, authTagHex, encrypted] = encoded.split(":");
  const decipher = createDecipheriv(ALGORITHM, getKey(secret), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function encrypt(text: string): string {
  const secret = getSecrets()[0];
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, getKey(secret), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/** Supports the pre-persistent desktop key so installed apps self-heal. */
export function decrypt(encoded: string): string {
  let lastError: unknown;
  for (const secret of getSecrets()) {
    try {
      return decryptWithSecret(encoded, secret);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
