import { isLocalPostgres } from "./config.js";
import { prisma } from "./prisma.js";

export async function instanceLicenseUsage() {
  if (!isLocalPostgres() || !prisma) return { teamCount: 0, memberCount: 0 };
  const [teamCount, members] = await Promise.all([
    prisma.team.count({ where: { type: { not: "personal" }, status: "active" } }),
    prisma.teamMember.findMany({ where: { status: "active" }, select: { userId: true }, distinct: ["userId"] }),
  ]);
  return { teamCount, memberCount: members.length };
}
