import { prisma } from "../lib/prisma.js";
import { useLocalAuth } from "../lib/config.js";
import { listHistory, readHistoryRevision, readOwnedEntity } from "../routes/entity-changes/service.js";
import { searchWorkspaceFiles, type WorkspaceSearchType } from "./workspace-search.js";

export const PUBLIC_MCP_DOCUMENT_TYPES = ["notes", "flowcharts", "drawings", "diagrams"] as const;
export type PublicMcpDocumentType = (typeof PUBLIC_MCP_DOCUMENT_TYPES)[number];

function serialize(value: unknown): any {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  }
  return value;
}

function projectIdentifier(identifier: string) {
  if (!/^\d+$/.test(identifier)) return null;
  return useLocalAuth() ? Number(identifier) : BigInt(identifier);
}

async function resolveProject(userId: string, projectUid?: string) {
  if (!projectUid) return null;
  const id = projectIdentifier(projectUid);
  const project = await prisma?.project.findFirst({
    where: { userId, isDeleted: false, OR: [{ uid: projectUid }, ...(id === null ? [] : [{ id }])] } as any,
    select: { id: true },
  });
  if (!project) throw new Error("Project not found");
  return project;
}

export async function listPublicWorkspaceFiles(userId: string, projectUid?: string) {
  if (!prisma) throw new Error("Database connection not available");
  const selectedProject = await resolveProject(userId, projectUid);
  const projects = await prisma.project.findMany({
    where: { userId, isDeleted: false, ...(selectedProject ? { id: selectedProject.id } : {}) },
    select: { id: true, uid: true, name: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const projectIds = projects.map(project => project.id);
  const documentWhere = {
    userId,
    isDeleted: false,
    ...(selectedProject
      ? { projectId: selectedProject.id }
      : { OR: [{ projectId: null }, ...(projectIds.length ? [{ projectId: { in: projectIds } }] : [])] }),
  };

  const [notes, flowcharts, drawings, diagrams] = await Promise.all([
    prisma.note.findMany({ where: documentWhere, select: { uid: true, title: true, projectId: true, updatedAt: true } }),
    prisma.flowchart.findMany({ where: documentWhere, select: { uid: true, title: true, projectId: true, updatedAt: true } }),
    prisma.drawing.findMany({ where: documentWhere, select: { uid: true, title: true, projectId: true, updatedAt: true } }),
    prisma.diagram.findMany({
      where: { AND: [documentWhere, { OR: [{ sourceType: null }, { sourceType: { not: "production_db" } }] }] },
      select: { uid: true, name: true, projectId: true, updatedAt: true },
    }),
  ]);
  return serialize({ projects, notes, flowcharts, drawings, diagrams });
}

export async function searchPublicWorkspace(userId: string, query: string, type?: WorkspaceSearchType, limit = 20) {
  return serialize(searchWorkspaceFiles(await listPublicWorkspaceFiles(userId), query, type, limit));
}

async function readAllowedDocument(userId: string, type: PublicMcpDocumentType, uid: string) {
  const current = await readOwnedEntity(type, uid, userId);
  if (!current || current.entity.isDeleted) throw new Error("Document not found");
  if (type === "diagrams" && (current.entity as any).sourceType === "production_db") throw new Error("Document not found");
  if (current.entity.projectId !== null && current.entity.projectId !== undefined) {
    const activeProject = await prisma?.project.findFirst({
      where: { id: current.entity.projectId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!activeProject) throw new Error("Document not found");
  }
  return current;
}

export async function readPublicDocument(userId: string, type: PublicMcpDocumentType, uid: string) {
  const current = await readAllowedDocument(userId, type, uid);
  return serialize({
    type,
    uid: current.entity.uid ?? String(current.entity.id),
    project_id: current.entity.projectId ?? null,
    updated_at: current.updatedAt,
    ...current.snapshot,
  });
}

export async function listPublicHistory(userId: string, type: PublicMcpDocumentType, uid: string, limit: number) {
  await readAllowedDocument(userId, type, uid);
  const history = await listHistory(type, uid, userId, limit);
  if (!history) throw new Error("Document not found");
  return serialize(history);
}

export async function readPublicHistory(userId: string, type: PublicMcpDocumentType, uid: string, revisionId: string) {
  await readAllowedDocument(userId, type, uid);
  const revision = await readHistoryRevision(type, uid, userId, revisionId);
  if (!revision) throw new Error("History revision not found");
  return serialize(revision);
}
