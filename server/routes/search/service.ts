import { prisma } from "../../lib/prisma.js";
import { isDesktopMode } from "../../lib/config.js";

const projectSelect = { id: true, uid: true, name: true } as const;

export async function listRecentFiles(userId: string) {
  if (!prisma) return [];

  const base = {
    userId,
    isDeleted: false,
    OR: [{ projectId: null }, { project: { isDeleted: false } }],
  } as any;
  const select = { id: true, uid: true, project: { select: projectSelect }, updatedAt: true } as const;

  const [diagrams, notes, drawings, flowcharts, dbClients] = await Promise.all([
    prisma.diagram.findMany({
      where: { ...base, AND: [{ OR: [{ sourceType: null }, { sourceType: { not: "production_db" } }] }] },
      orderBy: { updatedAt: "desc" }, take: 10,
      select: { ...select, name: true, sourceType: true },
    }),
    prisma.note.findMany({ where: base, orderBy: { updatedAt: "desc" }, take: 10, select: { ...select, title: true } }),
    prisma.drawing.findMany({ where: base, orderBy: { updatedAt: "desc" }, take: 10, select: { ...select, title: true } }),
    prisma.flowchart.findMany({ where: base, orderBy: { updatedAt: "desc" }, take: 10, select: { ...select, title: true } }),
    isDesktopMode() ? (prisma as any).dbClient.findMany({
      where: base, orderBy: { updatedAt: "desc" }, take: 10,
      select: { ...select, name: true },
    }) : Promise.resolve([]),
  ]);

  return [
    ...(diagrams || []).map((item: any) => ({ ...item, type: "diagrams", group: "diagrams", workspace: item.project })),
    ...(notes || []).map((item: any) => ({ ...item, type: "notes", group: "notes", name: item.title, workspace: item.project })),
    ...(drawings || []).map((item: any) => ({ ...item, type: "drawings", group: "drawings", name: item.title, workspace: item.project })),
    ...(flowcharts || []).map((item: any) => ({ ...item, type: "flowcharts", group: "flowcharts", name: item.title, workspace: item.project })),
    ...(dbClients || []).map((item: any) => ({ ...item, type: "db-client", group: "db-client", workspace: item.project })),
  ]
    .sort((a: any, b: any) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
    .slice(0, 10);
}

export async function searchDocuments(userId: string, query: string) {
  const text = query.trim();
  if (!text || !prisma) return [];

  const contains = isDesktopMode()
    ? { contains: text }
    : { contains: text, mode: "insensitive" } as any;
  const base = {
    userId,
    isDeleted: false,
    OR: [{ projectId: null }, { project: { isDeleted: false } }],
  } as any;

  const [projects, diagrams, notes, drawings, flowcharts, dbClients] = await Promise.all([
    prisma.project.findMany({
      where: { userId, isDeleted: false, name: contains },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { ...projectSelect, updatedAt: true },
    }),
    prisma.diagram.findMany({
      where: { ...base, name: contains, AND: [{ OR: [{ sourceType: null }, { sourceType: { not: "production_db" } }] }] },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, uid: true, name: true, sourceType: true, project: { select: projectSelect }, updatedAt: true },
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
    isDesktopMode() ? (prisma as any).dbClient.findMany({
      where: { ...base, name: contains }, orderBy: { updatedAt: "desc" }, take: 5,
      select: { id: true, uid: true, name: true, project: { select: projectSelect }, updatedAt: true },
    }) : Promise.resolve([]),
  ]);

  return [
    ...(projects || []).map((item: any) => ({ ...item, type: "workspace", name: item.name })),
    ...(diagrams || []).map((item: any) => ({
      ...item,
      type: "erd",
      name: item.name,
      workspace: item.project,
    })),
    ...(notes || []).map((item: any) => ({ ...item, type: "notes", name: item.title, workspace: item.project })),
    ...(drawings || []).map((item: any) => ({ ...item, type: "drawings", name: item.title, workspace: item.project })),
    ...(flowcharts || []).map((item: any) => ({ ...item, type: "flowchart", name: item.title, workspace: item.project })),
    ...(dbClients || []).map((item: any) => ({ ...item, type: "db-client", name: item.name, workspace: item.project })),
  ]
    .sort((a: any, b: any) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
    .slice(0, 20);
}

export async function listMentionFiles(userId: string) {
  if (!prisma) return [];

  const base = {
    userId,
    isDeleted: false,
    OR: [{ projectId: null }, { project: { isDeleted: false } }],
  } as any;

  const [diagrams, notes, drawings, flowcharts] = await Promise.all([
    prisma.diagram.findMany({
      where: { ...base, AND: [{ OR: [{ sourceType: null }, { sourceType: { not: "production_db" } }] }] },
      orderBy: { name: "asc" },
      select: { id: true, uid: true, name: true, project: { select: projectSelect } },
    }),
    prisma.note.findMany({
      where: base,
      orderBy: { title: "asc" },
      select: { id: true, uid: true, title: true, project: { select: projectSelect } },
    }),
    prisma.drawing.findMany({
      where: base,
      orderBy: { title: "asc" },
      select: { id: true, uid: true, title: true, project: { select: projectSelect } },
    }),
    prisma.flowchart.findMany({
      where: base,
      orderBy: { title: "asc" },
      select: { id: true, uid: true, title: true, project: { select: projectSelect } },
    }),
  ]);

  return [
    ...(notes || []).map((file: any) => ({ ...file, type: "note", name: file.title, workspaceName: file.project?.name || null })),
    ...(diagrams || []).map((file: any) => ({ ...file, type: "diagram", name: file.name, workspaceName: file.project?.name || null })),
    ...(flowcharts || []).map((file: any) => ({ ...file, type: "flowchart", name: file.title, workspaceName: file.project?.name || null })),
    ...(drawings || []).map((file: any) => ({ ...file, type: "drawing", name: file.title, workspaceName: file.project?.name || null })),
  ];
}
