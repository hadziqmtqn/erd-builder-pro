import { randomUUID } from "crypto";
import { prisma } from "../../lib/prisma.js";
import { toProjectId } from "../../lib/utils.js";
import { resolveOwnedProjectId } from "../../lib/security.js";
import { fileIdentifierWhere, fileScopeWhere } from "../../lib/team-scope.js";
import { getRulesOwnerId } from "../ai-rules/service.js";

// ── Sessions ──

export async function listSessions(params: {
  userId: string;
  projectId?: string;
  entityType?: string;
  entityUid?: string;
}) {
  const { userId, projectId, entityType, entityUid } = params;
  const hasProject = !!projectId;
  const hasEntity = !!entityType && !!entityUid;

  let where: any = { AND: [fileScopeWhere(userId)] };

  if (hasProject && hasEntity) {
    where.AND.push({ OR: [
      { projectId: toProjectId(projectId) },
      { projectId: null, entityType, entityUid },
    ] });
  } else if (hasProject) {
    where.projectId = toProjectId(projectId);
  } else if (hasEntity) {
    where.projectId = null;
    where.entityType = entityType;
    where.entityUid = entityUid;
  } else {
    return [];
  }

  return (await prisma?.aiChatSession.findMany({
    where,
    orderBy: { updatedAt: "desc" },
  })) || [];
}

export async function createSession(data: {
  userId: string;
  entityType?: string;
  entityUid?: string;
  projectId?: number | null;
}) {
  if (!prisma) throw new Error("Database connection not available");

  const createData: any = {
    title: "New Conversation",
    userId: data.userId,
    uid: randomUUID(),
  };
  if (data.entityType) createData.entityType = data.entityType;
  if (data.entityUid) createData.entityUid = data.entityUid;
  if (data.projectId !== undefined) createData.projectId = data.projectId;

  return prisma.aiChatSession.create({ data: createData });
}

export async function getSession(uid: string, userId: string) {
  return (await prisma?.aiChatSession.findFirst({
    where: fileIdentifierWhere(uid, userId),
  })) || null;
}

export async function updateSession(
  uid: string,
  userId: string,
  data: { title?: string; projectId?: number | null }
) {
  if (!prisma) throw new Error("Database connection not available");

  const existing = await prisma.aiChatSession.findFirst({
    where: fileIdentifierWhere(uid, userId),
    select: { id: true },
  });
  if (!existing) return null;

  const updatePayload: Record<string, any> = { updatedAt: new Date() };
  if (data.title !== undefined) updatePayload.title = data.title;
  if (data.projectId !== undefined) updatePayload.projectId = data.projectId;

  return prisma.aiChatSession.update({
    where: { id: existing.id },
    data: updatePayload,
  });
}

export async function deleteSession(uid: string, userId: string) {
  const session = await prisma?.aiChatSession.findFirst({
    where: fileIdentifierWhere(uid, userId),
  });
  if (!session) return null;

  await prisma?.aiChatSession.delete({ where: { id: session.id } });
  return { success: true };
}

// ── Messages ──

export async function listMessages(
  sessionUid: string,
  userId: string,
  offset: number,
  limit: number
) {
  const session = await prisma?.aiChatSession.findFirst({
    where: fileIdentifierWhere(sessionUid, userId),
    select: { id: true },
  });
  if (!session) return null;

  const [data, total] = await Promise.all([
    prisma?.aiChatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    }),
    prisma?.aiChatMessage.count({ where: { sessionId: session.id } }),
  ]);

  return { data: data || [], count: total || 0 };
}

async function resolveSessionId(sessionId: string, userId: string): Promise<number | null> {
  // Resolve session by uid (or numeric id)
  const sid = String(sessionId);
  const numericId = /^\d+$/.test(sid) ? Number(sid) : undefined;
  const session = await prisma?.aiChatSession.findFirst({
    where: { AND: [fileScopeWhere(userId), { OR: [
        { uid: sid },
        ...(numericId !== undefined ? [{ id: numericId }] : []),
      ] }] },
    select: { id: true },
  });
  return session ? Number(session.id) : null;
}

async function saveMessage(data: {
  sessionId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  selectionText?: string | null;
  clientMessageId?: string | null;
}, isTrustedAssistant: boolean) {
  const sessionId = await resolveSessionId(data.sessionId, data.userId);
  if (sessionId === null) return null;

  if (!prisma) return null;
  const clientMessageId = data.clientMessageId?.trim() || null;
  if (clientMessageId) {
    const existing = await prisma.aiChatMessage.findFirst({
      where: { sessionId, clientMessageId },
    });
    if (existing) {
      return existing.role === data.role
        && existing.content === data.content
        && Boolean(existing.isTrustedAssistant) === isTrustedAssistant
        ? existing
        : null;
    }
  }

  try {
    return await prisma.aiChatMessage.create({
      data: {
        sessionId,
        role: data.role,
        content: data.content,
        selectionText: data.selectionText || null,
        clientMessageId,
        isTrustedAssistant,
      },
    });
  } catch (err: any) {
    if (clientMessageId && err?.code === "P2002") {
      const existing = await prisma.aiChatMessage.findFirst({ where: { sessionId, clientMessageId } });
      return existing?.role === data.role
        && existing.content === data.content
        && Boolean(existing.isTrustedAssistant) === isTrustedAssistant
        ? existing
        : null;
    }
    throw err;
  }
}

export function createMessage(data: {
  sessionId: string;
  userId: string;
  role: "user";
  content: string;
  selectionText?: string | null;
  clientMessageId?: string | null;
}) {
  return saveMessage(data, false);
}

export function createTrustedAssistantMessage(data: {
  sessionId: string;
  userId: string;
  content: string;
  clientMessageId: string;
}) {
  return saveMessage({ ...data, role: "assistant" }, true);
}

export async function getTrustedAssistantMessage(data: {
  sessionId: string;
  userId: string;
  clientMessageId: string;
}) {
  const sessionId = await resolveSessionId(data.sessionId, data.userId);
  if (sessionId === null) return null;
  return (await prisma?.aiChatMessage.findFirst({
    where: {
      sessionId,
      clientMessageId: data.clientMessageId,
      role: "assistant",
      isTrustedAssistant: true,
    },
  })) || null;
}

// ── Config / Prompts ──

export async function getAiConfig(userId: string) {
  const configOwnerId = await getRulesOwnerId(userId);
  if (!configOwnerId) return null;

  const config = await prisma?.userAiConfig.findFirst({
    where: { userId: configOwnerId, isEnabled: true, selectedModelId: { not: null } },
    include: { provider: true, selectedModel: true },
    orderBy: { updatedAt: "desc" },
  });

  if (
    !config ||
    !config.provider ||
    !config.selectedModel ||
    config.provider.isActive !== true ||
    config.selectedModel.isActive !== true ||
    String(config.selectedModel.providerId) !== String(config.providerId)
  ) return null;

  return {
    baseUrl: config.provider?.baseUrl || "https://api.openai.com/v1",
    model: config.selectedModel?.modelIdentifier || "gpt-4o-mini",
    providerCode: config.provider?.code || "openai",
  };
}

export async function getDefaultPrompt(userId: string) {
  const [globalPrompt, personalPrompt] = await Promise.all([
    prisma?.aiSystemPrompt.findFirst({
      where: { userId: null, isDefault: true },
      select: { content: true },
    }),
    prisma?.aiSystemPrompt.findFirst({
      where: { userId, isDefault: true },
      select: { content: true },
    }),
  ]);
  return {
    prompts: [
      ...(globalPrompt?.content ? [{ scope: "global", content: globalPrompt.content }] : []),
      ...(personalPrompt?.content ? [{ scope: "personal", content: personalPrompt.content }] : []),
    ],
  };
}
