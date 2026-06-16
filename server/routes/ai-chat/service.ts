import { randomUUID } from "crypto";
import { prisma } from "../../lib/prisma.js";
import { toProjectId, uidOrIdWhere } from "../../lib/utils.js";
import { resolveOwnedProjectId } from "../../lib/security.js";

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

  let where: any = { userId };

  if (hasProject && hasEntity) {
    where.OR = [
      { projectId: toProjectId(projectId) },
      { projectId: null, entityType, entityUid },
    ];
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
  projectId?: number;
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
    where: uidOrIdWhere(uid, userId),
  })) || null;
}

export async function updateSession(
  uid: string,
  userId: string,
  data: { title?: string; projectId?: number }
) {
  if (!prisma) throw new Error("Database connection not available");

  const existing = await prisma.aiChatSession.findFirst({
    where: uidOrIdWhere(uid, userId),
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
    where: uidOrIdWhere(uid, userId),
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
    where: uidOrIdWhere(sessionUid, userId),
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

export async function createMessage(data: {
  sessionId: string;
  userId: string;
  role: string;
  content: string;
  selectionText?: string | null;
}) {
  // Resolve session by uid (or numeric id)
  const sid = String(data.sessionId);
  const numericId = /^\d+$/.test(sid) ? Number(sid) : undefined;
  const session = await prisma?.aiChatSession.findFirst({
    where: {
      userId: data.userId,
      OR: [
        { uid: sid },
        ...(numericId !== undefined ? [{ id: numericId }] : []),
      ],
    },
    select: { id: true },
  });
  if (!session) return null;

  return prisma?.aiChatMessage.create({
    data: {
      sessionId: session.id,
      role: data.role,
      content: data.content,
      selectionText: data.selectionText || null,
    },
  });
}

// ── Config / Prompts ──

export async function getAiConfig(userId: string) {
  const config = await prisma?.userAiConfig.findFirst({
    where: { userId, isEnabled: true, selectedModelId: { not: null } },
    include: { provider: true, selectedModel: true },
    orderBy: { updatedAt: "desc" },
  });

  if (!config) return null;

  return {
    baseUrl: config.provider?.baseUrl || "https://api.openai.com/v1",
    model: config.selectedModel?.modelIdentifier || "gpt-4o-mini",
    providerCode: config.provider?.code || "openai",
  };
}

export async function getDefaultPrompt() {
  const prompt = await prisma?.aiSystemPrompt.findFirst({
    where: { isDefault: true },
    select: { content: true },
  });
  return { content: prompt?.content || null };
}
