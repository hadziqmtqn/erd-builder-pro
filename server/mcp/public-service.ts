import { prisma } from "../lib/prisma.js";
import { useLocalAuth } from "../lib/config.js";
import { parseRevisionChanges } from "../lib/entity-history.js";
import { readEntity } from "../routes/entity-changes/service.js";
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
  const projectScope = await publicProjectScope(userId);
  const project = await prisma?.project.findFirst({
    where: { AND: [projectScope, { OR: [{ uid: projectUid }, ...(id === null ? [] : [{ id }])] }] } as any,
    select: { id: true },
  });
  if (!project) throw new Error("Project not found");
  return project;
}

async function activeTeamIds(userId: string): Promise<string[]> {
  if (!useLocalAuth() || !prisma) return [];
  const memberships = await (prisma as any).teamMember.findMany({
    where: { userId, status: "active", team: { is: { status: "active", type: { not: "personal" } } } },
    select: { teamId: true },
  });
  return memberships.map((membership: any) => membership.teamId);
}

async function publicProjectScope(userId: string) {
  if (!useLocalAuth()) return { userId, isDeleted: false };
  const teamIds = await activeTeamIds(userId);
  return {
    isDeleted: false,
    OR: [
      { userId, teamId: null },
      ...(teamIds.length ? [{ teamId: { in: teamIds } }] : []),
    ],
  };
}

async function publicDocumentScope(userId: string) {
  if (!useLocalAuth()) return { userId };
  const teamIds = await activeTeamIds(userId);
  return {
    OR: [
      { userId, projectId: null },
      { userId, project: { teamId: null } },
      ...(teamIds.length ? [{ project: { teamId: { in: teamIds } } }] : []),
    ],
  };
}

function documentIdentifier(uid: string) {
  const id = projectIdentifier(uid);
  return id === null ? { uid } : { OR: [{ uid }, { id }] };
}

export async function listPublicWorkspaceFiles(userId: string, projectUid?: string) {
  if (!prisma) throw new Error("Database connection not available");
  const selectedProject = await resolveProject(userId, projectUid);
  const projectScope = await publicProjectScope(userId);
  const projects = await prisma.project.findMany({
    where: { ...projectScope, ...(selectedProject ? { id: selectedProject.id } : {}) },
    select: { id: true, uid: true, name: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const projectIds = projects.map(project => project.id);
  const documentScope = await publicDocumentScope(userId);
  const documentWhere = {
    isDeleted: false,
    AND: [
      documentScope,
      selectedProject
        ? { projectId: selectedProject.id }
        : { OR: [{ projectId: null }, ...(projectIds.length ? [{ projectId: { in: projectIds } }] : [])] },
    ],
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
  const documentScope = await publicDocumentScope(userId);
  const current = await readEntity(type, {
    AND: [documentIdentifier(uid), documentScope, { isDeleted: false }],
  });
  if (!current || current.entity.isDeleted) throw new Error("Document not found");
  if (type === "diagrams" && (current.entity as any).sourceType === "production_db") throw new Error("Document not found");
  if (current.entity.projectId !== null && current.entity.projectId !== undefined) {
    const activeProject = await prisma?.project.findFirst({
      where: { ...(await publicProjectScope(userId)), id: current.entity.projectId },
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
  const current = await readAllowedDocument(userId, type, uid);
  const revisions = await prisma!.entityChange.findMany({
    where: { entityType: { in: [type, type.slice(0, -1)] }, entityId: current.entityId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
    select: { id: true, version: true, changeType: true, createdAt: true },
  });
  return serialize({
    current_updated_at: current.updatedAt,
    revisions: revisions.map((revision: any) => ({
      id: String(revision.id),
      version: revision.version,
      change_type: revision.changeType,
      created_at: revision.createdAt,
    })),
  });
}

export async function readPublicHistory(userId: string, type: PublicMcpDocumentType, uid: string, revisionId: string) {
  const current = await readAllowedDocument(userId, type, uid);
  const id = projectIdentifier(revisionId);
  if (id === null) throw new Error("History revision not found");
  const revision = await prisma!.entityChange.findFirst({
    where: { id, entityType: { in: [type, type.slice(0, -1)] }, entityId: current.entityId },
  });
  if (!revision) throw new Error("History revision not found");
  const envelope = parseRevisionChanges(type, revision.changes);
  return serialize({
    id: String(revision.id),
    version: revision.version,
    change_type: revision.changeType,
    created_at: revision.createdAt,
    source: envelope.source,
    snapshot: envelope.snapshot,
  });
}
