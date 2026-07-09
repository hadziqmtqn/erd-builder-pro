import { prisma } from "../../lib/prisma.js";

export async function findAllAccounts(userId: number | string) {
  return (prisma as any)?.dbAccount.findMany({
    where: { userId: String(userId) },
    include: { _count: { select: { catalogs: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function findAccountById(id: number | string, userId: number | string) {
  return (prisma as any)?.dbAccount.findFirst({
    where: { id: Number(id), userId: String(userId) },
    include: { catalogs: { select: { id: true } } },
  });
}

export async function createAccount(data: {
  userId: string;
  name: string;
  type: string;
  host?: string;
  port?: number | null;
  user?: string;
  password?: string | null;
}) {
  return (prisma as any)?.dbAccount.create({ data });
}

export async function updateAccount(id: number | string, data: Record<string, unknown>) {
  return (prisma as any)?.dbAccount.update({
    where: { id: Number(id) },
    data,
  });
}

export async function deleteAccount(id: number | string) {
  return (prisma as any)?.dbAccount.delete({ where: { id: Number(id) } });
}

export async function findFirstCatalog(accountId: number | string) {
  return (prisma as any)?.dbCatalog.findFirst({
    where: { accountId: Number(accountId) },
  });
}

export async function findAllCatalogsByAccountId(accountId: number | string) {
  return (prisma as any)?.dbCatalog.findMany({
    where: { accountId: Number(accountId) },
    select: { databaseName: true },
  });
}

export async function findExistingCatalogNames(accountId: number | string) {
  const catalogs = await findAllCatalogsByAccountId(accountId);
  return new Set(catalogs?.map((c) => c.databaseName) ?? []);
}
