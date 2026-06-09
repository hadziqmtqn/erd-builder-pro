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
  const cutoff = new Date(Date.now() - SESSION_EXPIRY_MS);
  try {
    await prisma?.session.deleteMany({
      where: { userId, createdAt: { lt: cutoff } },
    });
  } catch { /* ignore cleanup errors */ }

  try {
    await prisma?.session.create({
      data: { token, userId, email, name },
    });
  } catch (err) {
    console.error("Failed to create session:", err);
  }

  return token;
}

export async function getSession(token: string) {
  try {
    const row = await prisma?.session.findFirst({
      where: { token },
      select: { userId: true, email: true, name: true, createdAt: true },
    });

    if (!row) return undefined;

    const age = Date.now() - row.createdAt.getTime();
    if (age > SESSION_EXPIRY_MS) {
      await prisma?.session.deleteMany({ where: { token } }).catch(() => {});
      return undefined;
    }

    return { userId: row.userId, email: row.email, name: row.name, createdAt: row.createdAt };
  } catch {
    return undefined;
  }
}

export async function deleteSession(token: string): Promise<void> {
  try {
    await prisma?.session.deleteMany({ where: { token } });
  } catch { /* ignore */ }
}
