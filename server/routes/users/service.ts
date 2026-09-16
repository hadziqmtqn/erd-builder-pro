import { randomBytes } from "node:crypto";

import { hashPassword } from "../../lib/desktop-auth.js";
import { isLocalPostgres } from "../../lib/config.js";
import { prisma } from "../../lib/prisma.js";
import { requireActiveInstanceLicense, TeamServiceError } from "../teams/service.js";

const database = () => {
  if (!isLocalPostgres() || !prisma) throw new TeamServiceError("SELF_HOST_ONLY", 404);
  return prisma as any;
};

const temporaryPassword = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const bytes = randomBytes(20);
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
};

export async function listUsers(kind: "all" | "no-team" | "former", page = 1, pageSize = 20, search = "") {
  await requireActiveInstanceLicense();
  const db = database();
  const currentPage = Math.max(1, Math.floor(page) || 1);
  const currentPageSize = Math.min(100, Math.max(1, Math.floor(pageSize) || 20));
  const normalizedSearch = search.trim().slice(0, 100);
  const where: any = {
    isSuperAdmin: false,
    ...(normalizedSearch ? { OR: [
      { name: { contains: normalizedSearch, mode: "insensitive" } },
      { email: { contains: normalizedSearch, mode: "insensitive" } },
    ] } : {}),
    ...(kind === "no-team" ? { teamMemberships: { none: {} } } : {}),
    ...(kind === "former" ? { teamMemberships: { some: {}, none: { status: "active" } } } : {}),
  };
  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * currentPageSize,
    take: currentPageSize,
    select: { id: true, name: true, email: true, createdAt: true },
    }),
  ]);
  const userIds = users.map((user: any) => user.id);
  const memberRows = userIds.length ? await db.teamMember.findMany({
    where: { userId: { in: userIds } },
    orderBy: { joinedAt: "desc" },
    select: { userId: true, role: true, status: true, joinedAt: true, team: { select: { id: true, name: true } } },
  }) : [];
  const membershipsByUser = new Map<string, any[]>();
  for (const member of memberRows) {
    const current = membershipsByUser.get(member.userId) || [];
    current.push({ team: member.team, role: member.role, status: member.status, joinedAt: member.joinedAt });
    membershipsByUser.set(member.userId, current);
  }
  return {
    // Keep this endpoint's wire format independent from Prisma field mapping.
    data: users.map((user: any) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      teamMemberships: membershipsByUser.get(user.id) || [],
    })),
    pagination: { page: currentPage, pageSize: currentPageSize, total, totalPages: Math.max(1, Math.ceil(total / currentPageSize)) },
  };
}

export async function listInvitations() {
  await requireActiveInstanceLicense();
  return database().teamInvitation.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, createdAt: true, expiresAt: true, acceptedAt: true, team: { select: { id: true, name: true } } },
  });
}

export async function resetPassword(userId: string, actorId: string) {
  await requireActiveInstanceLicense();
  const db = database();
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, isSuperAdmin: true } });
  if (!user || user.isSuperAdmin) throw new TeamServiceError("USER_NOT_FOUND", 404);
  const password = temporaryPassword();
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { password: hashPassword(password), mustChangePassword: true } }),
    db.session.deleteMany({ where: { userId } }),
    db.teamAuditEvent.create({ data: { actorId, action: "user_password_reset", targetType: "user", targetId: userId, metadata: "{}" } }),
  ]);
  return { temporaryPassword: password };
}
