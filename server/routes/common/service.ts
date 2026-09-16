import { prisma } from "../../lib/prisma.js";
import { isDesktopMode } from "../../lib/config.js";
import { fileScopeWhere, projectScopeWhere } from "../../lib/team-scope.js";

export async function fetchTrashItems(userId: string) {
  const [diagrams, dbClients, notes, drawings, flowcharts, projects] = await Promise.all([
    prisma?.diagram.findMany({
      where: { isDeleted: true, ...fileScopeWhere(userId), sourceType: { not: "production_db" } },
      include: { project: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
    }),
    isDesktopMode() ? (prisma as any)?.dbClient.findMany({
      where: { isDeleted: true, ...fileScopeWhere(userId) },
      include: { project: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
    }) : Promise.resolve([]),
    prisma?.note.findMany({
      where: { isDeleted: true, ...fileScopeWhere(userId) },
      include: { project: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
    }),
    prisma?.drawing.findMany({
      where: { isDeleted: true, ...fileScopeWhere(userId) },
      include: { project: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
    }),
    prisma?.flowchart.findMany({
      where: { isDeleted: true, ...fileScopeWhere(userId) },
      include: { project: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
    }),
    prisma?.project.findMany({
      where: { isDeleted: true, ...projectScopeWhere(userId) },
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
