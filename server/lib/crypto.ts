import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

function getKey(): Buffer {
  const secret = process.env.ERD_ENCRYPTION_KEY || "erd-builder-pro-db-connect-key-2024";
  return scryptSync(secret, "db-connect-salt", 32);
}

const ALGORITHM = "aes-256-gcm";

export function encrypt(text: string): string {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decrypt(encoded: string): string {
  const key = getKey();
  const [ivHex, authTagHex, encrypted] = encoded.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
