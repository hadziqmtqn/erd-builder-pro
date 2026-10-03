import { isLocalPostgres } from "./config.js";
import { prisma } from "./prisma.js";

export async function instanceLicenseUsage(db: any = prisma) {
  if (!isLocalPostgres() || !db) return { teamCount: 0, memberCount: 0 };
  const [teamCount, members] = await Promise.all([
    db.team.count({ where: { type: { not: "personal" }, status: "active" } }),
    db.teamMember.findMany({ where: { status: "active", team: { type: { not: "personal" }, status: "active" } }, select: { userId: true }, distinct: ["userId"] }),
  ]);
  return { teamCount, memberCount: members.length };
}
