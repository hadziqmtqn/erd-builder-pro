import { prisma } from "../../lib/prisma.js";

export async function findAllCatalogs(userId: number | string, accountId?: number) {
  const where: any = { account: { userId: String(userId) } };
  if (accountId !== undefined) where.accountId = accountId;

  return (prisma as any)?.dbCatalog.findMany({
    where,
    include: {
      account: {
        select: { id: true, name: true, type: true, host: true, port: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function findCatalogById(id: number | string, userId: number | string) {
  return (prisma as any)?.dbCatalog.findFirst({
    where: { id: Number(id), account: { userId: String(userId) } },
    include: { account: true },
  });
}

export async function createCatalog(data: {
  accountId: number;
  databaseName: string;
  label: string;
}) {
  return (prisma as any)?.dbCatalog.create({ data });
}

export async function deleteCatalog(id: number | string) {
  return (prisma as any)?.dbCatalog.delete({ where: { id: Number(id) } });
}

export async function detachDiagramsFromCatalog(catalogId: number | string) {
  return prisma?.diagram.updateMany({
    where: { sourceConnectionId: Number(catalogId) },
    data: { sourceConnectionId: null },
  });
}

export async function detachDiagramsFromCatalogs(catalogIds: number[]) {
  if (catalogIds.length === 0) return;
  return prisma?.diagram.updateMany({
    where: { sourceConnectionId: { in: catalogIds } },
    data: { sourceConnectionId: null },
  });
}

export async function findAffectedDiagrams(catalogId: number | string) {
  return prisma?.diagram.findMany({
    where: { sourceConnectionId: Number(catalogId) },
    select: { id: true, name: true },
  });
}
