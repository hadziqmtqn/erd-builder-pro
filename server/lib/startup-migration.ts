import { prisma } from "./prisma.js";
import { randomUUID } from "crypto";
import { logger } from "./logger.js";

type PrismaRecord = { id: number } | { id: string };

async function backfillModelUids<T extends PrismaRecord>(
  name: string,
  findMany: () => Promise<T[]>,
  updateOne: (id: T["id"], uid: string) => Promise<unknown>,
): Promise<void> {
  const records = await findMany();
  if (records.length === 0) return;

  for (const record of records) {
    await updateOne(record.id, randomUUID());
  }
  logger.info({ count: records.length, model: name }, "Backfilled uids");
}

/**
 * Backfills `uid` for existing records that have a null uid.
 * Required for SQLite where @default(dbgenerated("gen_random_uuid()"))
 * is not available — only PostgreSQL supports that.
 */
export async function backfillUids(): Promise<void> {
  if (!prisma) return;

  try {
    await backfillModelUids(
      "project",
      () => prisma!.project.findMany({ where: { uid: null }, select: { id: true } }) as Promise<{ id: number }[]>,
      (id, uid) => prisma!.project.update({ where: { id: id as number }, data: { uid } }),
    );
    await backfillModelUids(
      "diagram",
      () => prisma!.diagram.findMany({ where: { uid: null }, select: { id: true } }) as Promise<{ id: number }[]>,
      (id, uid) => prisma!.diagram.update({ where: { id: id as number }, data: { uid } }),
    );
    await backfillModelUids(
      "note",
      () => prisma!.note.findMany({ where: { uid: null }, select: { id: true } }) as Promise<{ id: number }[]>,
      (id, uid) => prisma!.note.update({ where: { id: id as number }, data: { uid } }),
    );
    await backfillModelUids(
      "drawing",
      () => prisma!.drawing.findMany({ where: { uid: null }, select: { id: true } }) as Promise<{ id: number }[]>,
      (id, uid) => prisma!.drawing.update({ where: { id: id as number }, data: { uid } }),
    );
    await backfillModelUids(
      "flowchart",
      () => prisma!.flowchart.findMany({ where: { uid: null }, select: { id: true } }) as Promise<{ id: number }[]>,
      (id, uid) => prisma!.flowchart.update({ where: { id: id as number }, data: { uid } }),
    );
    await backfillModelUids(
      "aiChatSession",
      () => prisma!.aiChatSession.findMany({ where: { uid: null }, select: { id: true } }) as Promise<{ id: number }[]>,
      (id, uid) => prisma!.aiChatSession.update({ where: { id: id as number }, data: { uid } }),
    );
  } catch (err) {
    logger.error({ err }, "Failed to backfill uids");
  }
}
