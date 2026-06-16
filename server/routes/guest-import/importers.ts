import { prisma } from "../../lib/prisma.js";
import type { Response as ExpressResponse } from "express";
import type { ImportStats } from "./helpers.js";
import { uuid, safeDate, sendProgress, resolveProjectId, BATCH_SIZE } from "./helpers.js";

// ── Phase 1: Projects ──

export async function importProjects(
  items: any[],
  userId: string,
  stats: ImportStats,
  res: ExpressResponse,
  workOffset: number,
  totalWork: number,
): Promise<{ nameToDbId: Map<string, number>; guestIdToName: Map<string, string> }> {
  const nameToDbId = new Map<string, number>();
  const guestIdToName = new Map<string, string>();
  let processed = 0;

  for (const item of items || []) {
    if (!item || !item.name) continue;

    const name = String(item.name);
    const nameLower = name.toLowerCase();
    const guestId = String(item.uid || item.id || "");

    if (guestId) {
      guestIdToName.set(guestId, nameLower);
    }

    const existing = await prisma!.project.findFirst({
      where: { name, userId, isDeleted: false },
      select: { id: true },
    });

    if (existing) {
      nameToDbId.set(nameLower, existing.id);
      stats.skipped_existing++;
    } else {
      const created = await prisma!.project.create({
        data: {
          uid: item.uid || uuid(),
          name,
          userId,
          color: item.color || "#6366f1",
          isDeleted: false,
          createdAt: safeDate(item.created_at),
          updatedAt: safeDate(item.updated_at),
        },
      });
      nameToDbId.set(nameLower, created.id);
      stats.projects++;
    }

    processed++;
    sendProgress(res, {
      type: "progress",
      current: workOffset + processed,
      total: totalWork,
      phase: "Importing projects…",
    });
  }

  return { nameToDbId, guestIdToName };
}

// ── Phase 2a: Notes ──

export async function importNotes(
  items: any[],
  userId: string,
  nameToDbId: Map<string, number>,
  guestIdToName: Map<string, string>,
  stats: ImportStats,
  res: ExpressResponse,
  workOffset: number,
  totalWork: number,
): Promise<number> {
  let processed = 0;
  const validItems = (items || []).filter(item => item && item.title);

  for (let i = 0; i < validItems.length; i += BATCH_SIZE) {
    const batch = validItems.slice(i, i + BATCH_SIZE);
    const creates: any[] = [];

    for (const item of batch) {
      if (item.uid) {
        const existing = await prisma!.note.findUnique({
          where: { uid: String(item.uid) },
          select: { id: true },
        });
        if (existing) {
          stats.skipped_existing++;
          processed++;
          continue;
        }
      }

      const projectId = resolveProjectId(item.project_id, item.projectId, nameToDbId, guestIdToName);
      creates.push({
        uid: item.uid || uuid(),
        title: String(item.title),
        content: item.content || "",
        userId,
        projectId,
        isDeleted: false,
        createdAt: safeDate(item.created_at),
        updatedAt: safeDate(item.updated_at),
      });
    }

    if (creates.length > 0) {
      await prisma!.$transaction(creates.map(data => prisma!.note.create({ data })));
      stats.notes += creates.length;
    }

    processed += batch.length;
    sendProgress(res, {
      type: "progress",
      current: workOffset + processed,
      total: totalWork,
      phase: `Importing notes (${stats.notes} done)…`,
    });
  }

  return processed;
}

// ── Phase 2c: Flowcharts ──

export async function importFlowcharts(
  items: any[],
  userId: string,
  nameToDbId: Map<string, number>,
  guestIdToName: Map<string, string>,
  stats: ImportStats,
  res: ExpressResponse,
  workOffset: number,
  totalWork: number,
): Promise<number> {
  let processed = 0;
  const validItems = (items || []).filter(item => item && item.title);

  for (let i = 0; i < validItems.length; i += BATCH_SIZE) {
    const batch = validItems.slice(i, i + BATCH_SIZE);
    const creates: any[] = [];

    for (const item of batch) {
      if (item.uid) {
        const existing = await prisma!.flowchart.findUnique({
          where: { uid: String(item.uid) },
          select: { id: true },
        });
        if (existing) {
          stats.skipped_existing++;
          processed++;
          continue;
        }
      }

      const projectId = resolveProjectId(item.project_id, item.projectId, nameToDbId, guestIdToName);
      creates.push({
        uid: item.uid || uuid(),
        title: String(item.title),
        data: item.data || '{"nodes":[],"edges":[]}',
        userId,
        projectId,
        isDeleted: false,
        createdAt: safeDate(item.created_at),
        updatedAt: safeDate(item.updated_at),
      });
    }

    if (creates.length > 0) {
      await prisma!.$transaction(creates.map(data => prisma!.flowchart.create({ data })));
      stats.flowcharts += creates.length;
    }

    processed += batch.length;
    sendProgress(res, {
      type: "progress",
      current: workOffset + processed,
      total: totalWork,
      phase: `Importing flowcharts (${stats.flowcharts} done)…`,
    });
  }

  return processed;
}

// ── Phase 2d: Drawings ──

export async function importDrawings(
  items: any[],
  userId: string,
  nameToDbId: Map<string, number>,
  guestIdToName: Map<string, string>,
  stats: ImportStats,
  res: ExpressResponse,
  workOffset: number,
  totalWork: number,
): Promise<number> {
  let processed = 0;
  const validItems = (items || []).filter(item => item && item.title);

  for (let i = 0; i < validItems.length; i += BATCH_SIZE) {
    const batch = validItems.slice(i, i + BATCH_SIZE);
    const creates: any[] = [];

    for (const item of batch) {
      if (item.uid) {
        const existing = await prisma!.drawing.findUnique({
          where: { uid: String(item.uid) },
          select: { id: true },
        });
        if (existing) {
          stats.skipped_existing++;
          processed++;
          continue;
        }
      }

      const projectId = resolveProjectId(item.project_id, item.projectId, nameToDbId, guestIdToName);
      creates.push({
        uid: item.uid || uuid(),
        title: String(item.title),
        data: item.data || "[]",
        userId,
        projectId,
        isDeleted: false,
        createdAt: safeDate(item.created_at),
        updatedAt: safeDate(item.updated_at),
      });
    }

    if (creates.length > 0) {
      await prisma!.$transaction(creates.map(data => prisma!.drawing.create({ data })));
      stats.drawings += creates.length;
    }

    processed += batch.length;
    sendProgress(res, {
      type: "progress",
      current: workOffset + processed,
      total: totalWork,
      phase: `Importing drawings (${stats.drawings} done)…`,
    });
  }

  return processed;
}

// ── Phase 3: AI Chat ──

export async function importAiChatSessions(
  sessions: any[],
  userId: string,
  nameToDbId: Map<string, number>,
  guestIdToName: Map<string, string>,
  stats: ImportStats,
  res: ExpressResponse,
  workOffset: number,
  totalWork: number,
): Promise<number> {
  let processed = 0;
  const validSessions = (sessions || []).filter(s => s);

  for (const session of validSessions) {
    if (session.uid) {
      const existing = await prisma!.aiChatSession.findUnique({
        where: { uid: String(session.uid) },
        select: { id: true },
      });
      if (existing) {
        stats.skipped_existing++;
        processed++;
        sendProgress(res, {
          type: "progress",
          current: workOffset + processed,
          total: totalWork,
          phase: "Importing AI chat…",
        });
        continue;
      }
    }

    const projectId = resolveProjectId(session.project_id, session.projectId, nameToDbId, guestIdToName);

    const created = await prisma!.aiChatSession.create({
      data: {
        uid: session.uid || uuid(),
        userId,
        projectId,
        title: session.title || "Imported Conversation",
        entityType: session.entity_type || null,
        entityUid: session.entity_uid || null,
        createdAt: safeDate(session.created_at),
        updatedAt: safeDate(session.updated_at),
      },
    });
    stats.ai_sessions++;
    processed++;

    sendProgress(res, {
      type: "progress",
      current: workOffset + processed,
      total: totalWork,
      phase: `Importing AI chats (${stats.ai_sessions} done)…`,
    });

    // Batch-create messages
    const messages = session.messages || [];
    const msgCreates: any[] = [];

    for (const msg of messages) {
      if (!msg || !msg.role || !msg.content) continue;
      msgCreates.push({
        sessionId: created.id,
        role: String(msg.role),
        content: String(msg.content),
        selectionText: msg.selection_text || msg.selectionText || null,
        createdAt: safeDate(msg.created_at),
      });
    }

    for (let i = 0; i < msgCreates.length; i += BATCH_SIZE) {
      const slice = msgCreates.slice(i, i + BATCH_SIZE);
      await prisma!.$transaction(slice.map(m => prisma!.aiChatMessage.create({ data: m })));
      stats.ai_messages += slice.length;
      processed += slice.length;

      sendProgress(res, {
        type: "progress",
        current: workOffset + processed,
        total: totalWork,
        phase: `Importing AI messages (${stats.ai_messages} done)…`,
      });
    }
  }

  return processed;
}
