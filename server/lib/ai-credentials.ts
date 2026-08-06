import { decrypt, encrypt, ensureEncryptionKey } from "./crypto.js";

const ENCRYPTED_PREFIX = "enc:v1:";

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
