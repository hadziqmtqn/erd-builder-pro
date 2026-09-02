import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { getInstallMode } from "../lib/config.js";
import { getConnector, fetchSchemaForClient } from "../lib/db-connectors/registry.js";
import { buildCatalogConnectionInfo } from "../routes/connections/middleware.js";
import { normalizeSelectQuery } from "../routes/connections/query-helpers.js";
import { getNote, updateNote } from "../routes/notes/service.js";
import { getFlowchart } from "../routes/flowcharts/service.js";
import { getDiagramWithData } from "../routes/diagrams/save-service.js";
import { listHistory, readHistoryRevision, restoreHistoryRevision } from "../routes/entity-changes/service.js";
import { repositoryContainsPath, searchWorkspaceFiles, type WorkspaceSearchType } from "./workspace-search.js";

export const MCP_DOCUMENT_TYPES = ["notes", "flowcharts", "diagrams"] as const;
export type McpDocumentType = (typeof MCP_DOCUMENT_TYPES)[number];

type NoteProposal = {
  id: string;
  userId: string;
  noteUid: string;
  expectedUpdatedAt: string | null;
  appendText: string;
  preview: string;
  expiresAt: number;
};

type HistoryRestoreProposal = {
  id: string;
  userId: string;
  entityType: McpDocumentType;
  uid: string;
  revisionId: string;
  expectedUpdatedAt: string | null;
  expiresAt: number;
};

const proposals = new Map<string, NoteProposal>();
const historyRestoreProposals = new Map<string, HistoryRestoreProposal>();
const PROPOSAL_TTL_MS = 10 * 60 * 1000;

export function assertMcpInstallMode(mode = getInstallMode()) {
  if (mode !== "desktop" && mode !== "cli") {
    throw new Error("MCP is available only in ERD Builder Pro Desktop and CLI installations");
  }
}

function serialize(value: unknown): any {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  }
  return value;
}

export function noteTextToHtml(text: string) {
  const escaped = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
  return `<p>${escaped.replace(/\r?\n/g, "<br>")}</p>`;
}

export async function resolveMcpUserId() {
  if (!prisma) throw new Error("Local database is not available");
  const requested = process.env.ERDBPRO_MCP_USER_ID?.trim();
  if (requested) {
    const user = await prisma.user.findFirst({ where: { id: requested }, select: { id: true } });
    if (!user) throw new Error("ERDBPRO_MCP_USER_ID does not match a local user");
    return String(user.id);
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    take: 3,
    select: { id: true, email: true },
  });
  const desktopAdmin = users.find(user => user.email === "admin@local.dev");
  if (desktopAdmin) return String(desktopAdmin.id);
  if (users.length === 1) return String(users[0].id);
  if (users.length === 0) throw new Error("No local user found. Open ERD Builder Pro once before starting MCP");
  throw new Error("Multiple local users found. Set ERDBPRO_MCP_USER_ID explicitly");
}

export async function listWorkspaceFiles(userId: string, projectUid?: string) {
  if (!prisma) throw new Error("Local database is not available");
  const project = projectUid
    ? await prisma.project.findFirst({
        where: { userId, isDeleted: false, OR: [{ uid: projectUid }, ...(/^\d+$/.test(projectUid) ? [{ id: Number(projectUid) }] : [])] },
        select: { id: true },
      })
    : null;
  if (projectUid && !project) throw new Error("Project not found");
  const where = { userId, isDeleted: false, ...(project ? { projectId: project.id } : {}) };
  const [projects, notes, flowcharts, diagrams, dbClients] = await Promise.all([
    prisma.project.findMany({ where: { userId, isDeleted: false }, select: { id: true, uid: true, name: true, createdAt: true } }),
    prisma.note.findMany({ where, select: { id: true, uid: true, title: true, projectId: true, updatedAt: true } }),
    prisma.flowchart.findMany({ where, select: { id: true, uid: true, title: true, projectId: true, updatedAt: true } }),
    prisma.diagram.findMany({ where: { ...where, AND: [{ OR: [{ sourceType: null }, { sourceType: { not: "production_db" } }] }] }, select: { id: true, uid: true, name: true, projectId: true, sourceType: true, updatedAt: true } }),
    (prisma as any).dbClient.findMany({ where, select: { id: true, uid: true, name: true, projectId: true, catalogId: true, updatedAt: true } }),
  ]);
  return serialize({ projects, notes, flowcharts, diagrams, dbClients });
}

export async function searchWorkspace(userId: string, query: string, type?: WorkspaceSearchType, limit = 20) {
  return serialize(searchWorkspaceFiles(await listWorkspaceFiles(userId), query, type, limit));
}

export async function resolveRepositoryWorkspace(userId: string, repositoryPath: string) {
  if (!prisma) throw new Error("Local database is not available");
  const links = await (prisma as any).diagram.findMany({
    where: { userId, isDeleted: false, repositoryPath: { not: null } },
    select: {
      id: true, uid: true, name: true, projectId: true,
      repositoryPath: true, repositoryRef: true, repositorySourceId: true,
      project: { select: { id: true, uid: true, name: true, isDeleted: true } },
    },
  });
  const link = links
    .filter((item: any) => item.repositoryPath && repositoryContainsPath(item.repositoryPath, repositoryPath) && !item.project?.isDeleted)
    .sort((a: any, b: any) => b.repositoryPath.length - a.repositoryPath.length)[0];
  if (!link) throw new Error("No ERD Builder Pro workspace is linked to this repository");
  const projectUid = link.project ? String(link.project.uid ?? link.project.id) : undefined;
  const workspace = projectUid
    ? await listWorkspaceFiles(userId, projectUid)
    : { projects: [], notes: [], flowcharts: [], diagrams: [{ id: link.id, uid: link.uid, name: link.name, projectId: null }], dbClients: [] };
  return serialize({
    repository: { path: link.repositoryPath, ref: link.repositoryRef || "WORKTREE", source_id: link.repositorySourceId },
    project: link.project ? { uid: projectUid, name: link.project.name } : null,
    linked_diagram: { uid: String(link.uid ?? link.id), name: link.name },
    workspace,
  });
}

export async function readDocument(userId: string, type: McpDocumentType, uid: string) {
  const value = type === "notes"
    ? await getNote(uid, userId)
    : type === "flowcharts"
      ? await getFlowchart(uid, userId)
      : await getDiagramWithData(uid, userId);
  if (!value || (value as any).isDeleted || (type === "diagrams" && (value as any).sourceType === "production_db")) {
    throw new Error("Document not found");
  }
  return serialize(value);
}

export async function listDbCatalogs(userId: string) {
  if (!prisma) throw new Error("Local database is not available");
  const catalogs = await (prisma as any).dbCatalog.findMany({
    where: { account: { userId } },
    include: { account: { select: { id: true, name: true, type: true, host: true, port: true, environment: true, safeMode: true, sslMode: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return serialize(catalogs);
}

async function ownedCatalog(userId: string, catalogId: number) {
  if (!prisma) throw new Error("Local database is not available");
  const catalog = await (prisma as any).dbCatalog.findFirst({ where: { id: catalogId, account: { userId } }, include: { account: true } });
  if (!catalog) throw new Error("Database catalog not found");
  return catalog;
}

export async function readDbSchema(userId: string, catalogId: number) {
  const catalog = await ownedCatalog(userId, catalogId);
  const info = buildCatalogConnectionInfo(catalog);
  const connector = getConnector(info.type);
  const { client, release } = await connector.connect({ ...info, safeMode: "read-only" });
  try { return serialize(await fetchSchemaForClient(client, { ...info, safeMode: "read-only" })); }
  finally { release(); }
}

export async function runReadOnlyQuery(userId: string, catalogId: number, script: string, maxRows: number) {
  const catalog = await ownedCatalog(userId, catalogId);
  const info = { ...buildCatalogConnectionInfo(catalog), safeMode: "read-only" as const };
  if (info.type === "sqlite") throw new Error("Custom MCP queries support PostgreSQL and MySQL catalogs only");
  const sql = normalizeSelectQuery(script);
  const limitedSql = `SELECT * FROM (${sql}) AS erdbpro_mcp_result LIMIT ${maxRows + 1}`;
  const connector = getConnector(info.type);
  const { client, release } = await connector.connect(info);
  const startedAt = Date.now();
  try {
    if (info.type === "postgresql") {
      const result = await client.query(limitedSql);
      return serialize({ columns: result.fields.map((field: any) => field.name), rows: result.rows.slice(0, maxRows), truncated: result.rows.length > maxRows, duration_ms: Date.now() - startedAt });
    }
    const [rows, fields] = await client.execute(limitedSql);
    const values = Array.isArray(rows) ? rows : [];
    return serialize({ columns: (fields || []).map((field: any) => field.name || field.column || field), rows: values.slice(0, maxRows), truncated: values.length > maxRows, duration_ms: Date.now() - startedAt });
  } finally { release(); }
}

export async function historyList(userId: string, type: McpDocumentType, uid: string, limit: number) {
  const history = await listHistory(type, uid, userId, limit);
  if (!history) throw new Error("Document not found");
  return serialize(history);
}

export async function historyRead(userId: string, type: McpDocumentType, uid: string, revisionId: string) {
  const revision = await readHistoryRevision(type, uid, userId, revisionId);
  if (!revision) throw new Error("History revision not found");
  return serialize(revision);
}

function historyPreview(type: McpDocumentType, snapshot: any) {
  if (type === "notes") {
    const content = String(snapshot?.content ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return { title: String(snapshot?.title ?? "Untitled"), content_preview: content.slice(0, 500) };
  }
  if (type === "flowcharts") {
    const data = typeof snapshot?.data === "string" ? snapshot.data : JSON.stringify(snapshot?.data ?? "");
    return { title: String(snapshot?.title ?? "Untitled"), data_preview: data.slice(0, 500) };
  }
  return {
    name: String(snapshot?.name ?? "Untitled"),
    entity_count: Array.isArray(snapshot?.entities) ? snapshot.entities.length : undefined,
    relationship_count: Array.isArray(snapshot?.relationships) ? snapshot.relationships.length : undefined,
    dbml_preview: String(snapshot?.dbml_source ?? "").slice(0, 500),
  };
}

export async function proposeHistoryRestore(userId: string, type: McpDocumentType, uid: string, revisionId: string) {
  const [history, revision] = await Promise.all([
    listHistory(type, uid, userId, 100),
    readHistoryRevision(type, uid, userId, revisionId),
  ]);
  if (!history || !revision) throw new Error("Document or history revision not found");
  const proposal: HistoryRestoreProposal = {
    id: randomUUID(), userId, entityType: type, uid, revisionId,
    expectedUpdatedAt: history.current_updated_at,
    expiresAt: Date.now() + PROPOSAL_TTL_MS,
  };
  historyRestoreProposals.set(proposal.id, proposal);
  return {
    proposal_id: proposal.id,
    confirmation: proposal.id,
    operation: "restore_history",
    type,
    uid,
    revision_id: revision.id,
    revision_created_at: revision.created_at,
    current_updated_at: proposal.expectedUpdatedAt,
    expires_at: new Date(proposal.expiresAt).toISOString(),
    preview: historyPreview(type, revision.snapshot),
  };
}

export async function applyHistoryRestore(userId: string, proposalId: string, confirmation: string) {
  const proposal = historyRestoreProposals.get(proposalId);
  if (!proposal || proposal.userId !== userId || proposal.expiresAt < Date.now()) {
    historyRestoreProposals.delete(proposalId);
    throw new Error("History restore proposal is missing or expired; create a new proposal");
  }
  if (confirmation !== proposal.id) throw new Error("Confirmation must exactly match proposal_id");
  const result = await restoreHistoryRevision({
    entityType: proposal.entityType,
    uid: proposal.uid,
    userId,
    revisionId: proposal.revisionId,
    expectedUpdatedAt: proposal.expectedUpdatedAt,
  });
  if (result.status === "conflict") throw new Error("Conflict: document changed after this restore proposal was created");
  if (result.status !== "ok") throw new Error("Document or history revision not found");
  historyRestoreProposals.delete(proposalId);
  return serialize({
    status: result.status,
    type: proposal.entityType,
    uid: proposal.uid,
    revision_id: result.revisionId ? String(result.revisionId) : null,
    updated_at: result.updatedAt,
  });
}

export async function proposeNoteAppend(userId: string, noteUid: string, text: string) {
  const note = await getNote(noteUid, userId);
  if (!note || note.isDeleted) throw new Error("Note not found");
  const appendText = text.trim();
  if (!appendText) throw new Error("Append text is required");
  const proposal: NoteProposal = {
    id: randomUUID(), userId, noteUid,
    expectedUpdatedAt: note.updatedAt ? new Date(note.updatedAt).toISOString() : null,
    appendText,
    preview: appendText.length > 1200 ? `${appendText.slice(0, 1200)}…` : appendText,
    expiresAt: Date.now() + PROPOSAL_TTL_MS,
  };
  proposals.set(proposal.id, proposal);
  return { proposal_id: proposal.id, expires_at: new Date(proposal.expiresAt).toISOString(), note_title: note.title, operation: "append_plain_text", preview: proposal.preview, confirmation: proposal.id };
}

export async function applyNoteAppend(userId: string, proposalId: string, confirmation: string) {
  const proposal = proposals.get(proposalId);
  if (!proposal || proposal.userId !== userId || proposal.expiresAt < Date.now()) {
    proposals.delete(proposalId);
    throw new Error("Proposal is missing or expired; create a new proposal");
  }
  if (confirmation !== proposal.id) throw new Error("Confirmation must exactly match proposal_id");
  const note = await getNote(proposal.noteUid, userId);
  if (!note || note.isDeleted) throw new Error("Note not found");
  const currentUpdatedAt = note.updatedAt ? new Date(note.updatedAt).toISOString() : null;
  if (currentUpdatedAt !== proposal.expectedUpdatedAt) throw new Error("Conflict: note changed after this proposal was created");
  const separator = note.content?.trim() ? "\n" : "";
  const result = await updateNote(proposal.noteUid, userId, {
    content: `${note.content || ""}${separator}${noteTextToHtml(proposal.appendText)}`,
    historySource: "mcp",
  });
  proposals.delete(proposalId);
  return serialize({ ...result, note_uid: proposal.noteUid });
}
