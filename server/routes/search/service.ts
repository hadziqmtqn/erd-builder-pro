import { prisma } from "../../lib/prisma.js";

const projectSelect = { id: true, uid: true, name: true } as const;

export async function searchDocuments(userId: string, query: string) {
  const text = query.trim();
  if (!text || !prisma) return [];

  const contains = { contains: text, mode: "insensitive" } as any;
  const base = {
    userId,
    isDeleted: false,
    OR: [{ projectId: null }, { project: { isDeleted: false } }],
  } as any;

  const [projects, diagrams, notes, drawings, flowcharts] = await Promise.all([
    prisma.project.findMany({
      where: { userId, isDeleted: false, name: contains },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { ...projectSelect, updatedAt: true },
    }),
    prisma.diagram.findMany({
      where: { ...base, name: contains },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, uid: true, name: true, project: { select: projectSelect }, updatedAt: true },
    }),
    prisma.note.findMany({
      where: { ...base, title: contains },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, uid: true, title: true, project: { select: projectSelect }, updatedAt: true },
    }),
    prisma.drawing.findMany({
      where: { ...base, title: contains },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, uid: true, title: true, project: { select: projectSelect }, updatedAt: true },
    }),
    prisma.flowchart.findMany({
      where: { ...base, title: contains },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, uid: true, title: true, project: { select: projectSelect }, updatedAt: true },
    }),
  ]);

  return [
    ...(projects || []).map((item: any) => ({ ...item, type: "workspace", name: item.name })),
    ...(diagrams || []).map((item: any) => ({ ...item, type: "erd", name: item.name, workspace: item.project })),
    ...(notes || []).map((item: any) => ({ ...item, type: "notes", name: item.title, workspace: item.project })),
    ...(drawings || []).map((item: any) => ({ ...item, type: "drawings", name: item.title, workspace: item.project })),
    ...(flowcharts || []).map((item: any) => ({ ...item, type: "flowchart", name: item.title, workspace: item.project })),
  ]
    .sort((a: any, b: any) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
    .slice(0, 20);
}
