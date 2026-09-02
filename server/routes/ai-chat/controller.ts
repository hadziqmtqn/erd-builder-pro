import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { handleError } from "../../lib/utils.js";
import { resolveOwnedProjectId } from "../../lib/security.js";
import { prisma } from "../../lib/prisma.js";
import * as chatService from "./service.js";

export async function listSessions(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const projectId = req.query.project_id as string | undefined;
    const entityType = req.query.entity_type as string | undefined;
    const entityUid = req.query.entity_uid as string | undefined;

    const data = await chatService.listSessions({ userId, projectId, entityType, entityUid });
    res.json(data);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch sessions");
  }
}

export async function createSession(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const { entity_type, entity_uid, project_id } = req.body;

    let resolvedProjectId: number | null | undefined;
    if (project_id !== undefined) {
      if (!prisma) { res.status(500).json({ error: "Database connection not available" }); return; }
      resolvedProjectId = await resolveOwnedProjectId(prisma, userId, project_id);
    }

    const session = await chatService.createSession({
      userId,
      entityType: entity_type,
      entityUid: entity_uid,
      projectId: resolvedProjectId,
    });
    res.json(session);
  } catch (err: any) {
    handleError(res, err, "Failed to create session");
  }
}

export async function getSession(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const session = await chatService.getSession(req.params.uid, userId);
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    res.json(session);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch session");
  }
}

export async function deleteSession(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const result = await chatService.deleteSession(req.params.uid, userId);
    if (!result) { res.status(404).json({ error: "Session not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to delete session");
  }
}

export async function updateSession(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const { title, project_id } = req.body;

    let resolvedProjectId: number | null | undefined;
    if (project_id !== undefined) {
      if (!prisma) { res.status(500).json({ error: "Database connection not available" }); return; }
      resolvedProjectId = await resolveOwnedProjectId(prisma, userId, project_id);
    }

    const result = await chatService.updateSession(req.params.uid, userId, {
      title,
      projectId: resolvedProjectId,
    });
    if (!result) { res.status(404).json({ error: "Session not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to update session");
  }
}

export async function listMessages(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = parseInt(req.query.limit as string) || 30;

    const result = await chatService.listMessages(req.params.uid, userId, offset, limit);
    if (!result) { res.status(404).json({ error: "Session not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch messages");
  }
}

export async function createMessage(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const { session_id, role, content, selection_text, client_message_id } = req.body;

    if (!session_id || !role || !content) {
      res.status(400).json({ error: "Missing required fields: session_id, role, content" });
      return;
    }
    if (client_message_id !== undefined && (typeof client_message_id !== "string" || client_message_id.length > 64)) {
      res.status(400).json({ error: "Invalid client_message_id" });
      return;
    }

    const result = await chatService.createMessage({
      sessionId: session_id,
      userId,
      role,
      content,
      selectionText: selection_text,
      clientMessageId: client_message_id,
    });
    if (!result) { res.status(404).json({ error: "Session not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to create message");
  }
}

export async function getConfig(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const config = await chatService.getAiConfig(userId);

    if (!config) {
      res.status(400).json({ error: "No AI provider configured. Go to Settings > AI to configure." });
      return;
    }
    res.json(config);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch AI config");
  }
}

export async function getDefaultPrompt(_req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const result = await chatService.getDefaultPrompt();
    res.json(result);
  } catch {
    res.json({ content: null });
  }
}
