import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../lib/middleware.js";
import { handleError } from "../lib/utils.js";
import { resolveOwnedProjectId } from "../lib/security.js";

const router = Router();

// GET /api/ai/chat/sessions
router.get("/sessions", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const userId = (req as any).user.id;
    const projectId = req.query.project_id as string | undefined;
    const entityType = req.query.entity_type as string | undefined;
    const entityUid = req.query.entity_uid as string | undefined;

    const hasProject = !!projectId;
    const hasEntity = !!entityType && !!entityUid;

    let where: any = { userId };

    if (hasProject && hasEntity) {
      where.OR = [
        { projectId: BigInt(projectId) },
        { projectId: null, entityType, entityUid }
      ];
    } else if (hasProject) {
      where.projectId = BigInt(projectId);
    } else if (hasEntity) {
      where.projectId = null;
      where.entityType = entityType;
      where.entityUid = entityUid;
    } else {
      return res.json([]);
    }

    const data = await prisma?.aiChatSession.findMany({
      where,
      orderBy: { updatedAt: 'desc' }
    });
    res.json(data || []);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch sessions");
  }
});

// POST /api/ai/chat/sessions
router.post("/sessions", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const userId = (req as any).user.id;
    const { entity_type, entity_uid, project_id } = req.body;

    const data: any = { title: "New Conversation", userId };
    if (entity_type) data.entityType = entity_type;
    if (entity_uid) data.entityUid = entity_uid;
    if (project_id !== undefined) {
      if (!prisma) return res.status(500).json({ error: "Database connection not available" });
      data.projectId = await resolveOwnedProjectId(prisma, userId, project_id);
    }

    const session = await prisma?.aiChatSession.create({ data });
    res.json(session);
  } catch (err: any) {
    handleError(res, err, "Failed to create session");
  }
});

// GET /api/ai/chat/sessions/:uid
router.get("/sessions/:uid", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const session = await prisma?.aiChatSession.findFirst({
      where: { uid: req.params.uid, userId: (req as any).user.id }
    });
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch session");
  }
});

// DELETE /api/ai/chat/sessions/:uid
router.delete("/sessions/:uid", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const userId = (req as any).user.id;
    const session = await prisma?.aiChatSession.findFirst({
      where: { uid: req.params.uid, userId },
    });
    if (!session) return res.status(404).json({ error: "Session not found" });
    await prisma?.aiChatSession.delete({
      where: { id: session.id }
    });
    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to delete session");
  }
});

// PUT /api/ai/chat/sessions/:uid
router.put("/sessions/:uid", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const userId = (req as any).user.id;
    const { title, project_id } = req.body;
    const updatePayload: Record<string, any> = { updatedAt: new Date() };
    if (title !== undefined) updatePayload.title = title;
    if (project_id !== undefined) {
      if (!prisma) return res.status(500).json({ error: "Database connection not available" });
      updatePayload.projectId = await resolveOwnedProjectId(prisma, userId, project_id);
    }

    const existing = await prisma?.aiChatSession.findFirst({
      where: { uid: req.params.uid, userId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Session not found" });

    const data = await prisma?.aiChatSession.update({
      where: { id: existing.id },
      data: updatePayload
    });
    res.json(data);
  } catch (err: any) {
    handleError(res, err, "Failed to update session");
  }
});

// GET /api/ai/chat/sessions/:uid/messages
router.get("/sessions/:uid/messages", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const userId = (req as any).user.id;
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = parseInt(req.query.limit as string) || 30;

    const session = await prisma?.aiChatSession.findFirst({
      where: { uid: req.params.uid, userId },
      select: { id: true }
    });

    if (!session) return res.status(404).json({ error: "Session not found" });

    const [data, total] = await Promise.all([
      prisma?.aiChatMessage.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma?.aiChatMessage.count({
        where: { sessionId: session.id }
      })
    ]);

    res.json({ data: data || [], count: total || 0 });
  } catch (err: any) {
    handleError(res, err, "Failed to fetch messages");
  }
});

// POST /api/ai/chat/messages
router.post("/messages", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const userId = (req as any).user.id;
    const { session_id, role, content, selection_text } = req.body;
    if (!session_id || !role || !content) {
      return res.status(400).json({ error: "Missing required fields: session_id, role, content" });
    }

    const session = await prisma?.aiChatSession.findFirst({
      where: { uid: session_id, userId },
      select: { id: true },
    });
    if (!session) return res.status(404).json({ error: "Session not found" });

    const data = await prisma?.aiChatMessage.create({
      data: {
        sessionId: session.id,
        role,
        content,
        selectionText: selection_text || null,
      }
    });
    res.json(data);
  } catch (err: any) {
    handleError(res, err, "Failed to create message");
  }
});

// GET /api/ai/chat/config
router.get("/config", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const userId = (req as any).user.id;

    const config = await prisma?.userAiConfig.findFirst({
      where: { userId, isEnabled: true, selectedModelId: { not: null } },
      include: { provider: true, selectedModel: true },
      orderBy: { updatedAt: 'desc' }
    });

    if (!config) {
      return res.status(400).json({ error: "No AI provider configured. Go to Settings > AI to configure." });
    }

    res.json({
      baseUrl: config.provider?.baseUrl || "https://api.openai.com/v1",
      model: config.selectedModel?.modelIdentifier || "gpt-4o-mini",
    });
  } catch (err: any) {
    handleError(res, err, "Failed to fetch AI config");
  }
});

// GET /api/ai/chat/prompts/default
router.get("/prompts/default", authenticate, async (_req: ExpressRequest, res: ExpressResponse) => {
  try {
    const prompt = await prisma?.aiSystemPrompt.findFirst({
      where: { isDefault: true },
      select: { content: true }
    });
    res.json({ content: prompt?.content || null });
  } catch {
    res.json({ content: null });
  }
});

export default router;
