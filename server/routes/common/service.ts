import { prisma } from "../../lib/prisma.js";

export async function fetchTrashItems(userId: string) {
  const [diagrams, notes, drawings, flowcharts, projects] = await Promise.all([
    prisma?.diagram.findMany({
      where: { isDeleted: true, userId },
      include: { project: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
    }),
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
    notes: notes || [],
    drawings: drawings || [],
    flowcharts: flowcharts || [],
    projects: projects || [],
  };
}
