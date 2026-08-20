import { prisma } from "../../lib/prisma.js";
import { isDesktopMode } from "../../lib/config.js";

export async function fetchTrashItems(userId: string) {
  const [diagrams, dbClients, notes, drawings, flowcharts, projects] = await Promise.all([
    prisma?.diagram.findMany({
      where: { isDeleted: true, userId, sourceType: { not: "production_db" } },
      include: { project: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
    }),
    isDesktopMode() ? (prisma as any)?.dbClient.findMany({
      where: { isDeleted: true, userId },
      include: { project: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
    }) : Promise.resolve([]),
    prisma?.note.findMany({
      where: { isDeleted: true, userId },
      include: { project: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
    }),
    prisma?.drawing.findMany({
      where: { isDeleted: true, userId },
      include: { project: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
    }),
    prisma?.flowchart.findMany({
      where: { isDeleted: true, userId },
      include: { project: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
    }),
    prisma?.project.findMany({
      where: { isDeleted: true, userId },
      orderBy: { deletedAt: "desc" },
    }),
  ]);

  return {
    diagrams: diagrams || [],
    dbClients: dbClients || [],
    notes: notes || [],
    drawings: drawings || [],
    flowcharts: flowcharts || [],
    projects: projects || [],
  };
}
