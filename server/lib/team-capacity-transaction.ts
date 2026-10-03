import { prisma } from "./prisma.js";

export async function withTeamCapacityTransaction<T>(work: (tx: any) => Promise<T>): Promise<T> {
  if (!prisma) throw new Error("Team database is unavailable.");
  return prisma.$transaction(async (tx) => {
    // ponytail: one instance-wide lock; capacity mutations are infrequent administrative actions.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(731405001)`;
    return work(tx);
  }, { isolationLevel: "ReadCommitted", maxWait: 10000, timeout: 15000 });
}
