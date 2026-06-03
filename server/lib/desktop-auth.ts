import { scryptSync, randomBytes, randomUUID } from "crypto";
import { prisma } from "./prisma.js";

const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(":");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return key === hash;
}

export async function createSession(userId: string, email: string, name: string | null): Promise<string> {
  const token = randomUUID();

  // Clean expired sessions for this user
  const cutoff = new Date(Date.now() - SESSION_EXPIRY_MS).toISOString();
  try {
    await prisma?.$executeRawUnsafe(
      `DELETE FROM sessions WHERE user_id = ? AND created_at < ?`,
      userId, cutoff
    );
  } catch { /* ignore cleanup errors */ }

  try {
    await prisma?.$executeRawUnsafe(
      `INSERT INTO sessions (token, user_id, email, name, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
      token, userId, email, name
    );
  } catch (err) {
    console.error("Failed to create session:", err);
  }

  return token;
}

export async function getSession(token: string) {
  try {
    const rows = await prisma?.$queryRawUnsafe<{ token: string; user_id: string; email: string; name: string | null; created_at: string }[]>(
      `SELECT token, user_id, email, name, created_at FROM sessions WHERE token = ?`,
      token
    );
    if (!rows || rows.length === 0) return undefined;

    const row = rows[0];
    const createdAt = new Date(row.created_at + 'Z');
    const age = Date.now() - createdAt.getTime();
    if (age > SESSION_EXPIRY_MS) {
      await prisma?.$executeRawUnsafe(`DELETE FROM sessions WHERE token = ?`, token).catch(() => {});
      return undefined;
    }

    return { userId: row.user_id, email: row.email, name: row.name, createdAt };
  } catch {
    return undefined;
  }
}

export async function deleteSession(token: string): Promise<void> {
  try {
    await prisma?.$executeRawUnsafe(`DELETE FROM sessions WHERE token = ?`, token);
  } catch { /* ignore */ }
}
