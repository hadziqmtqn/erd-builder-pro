import crypto from "node:crypto";
import { Request as ExpressRequest, Response as ExpressResponse } from "express";

// ── Constants ──

/** Maximum items to process per Prisma $transaction batch */
export const BATCH_SIZE = 50;

/** Safety cap on JSON payload size — reject before parsing to avoid OOM */
export const MAX_PAYLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

// ── Types ──

export interface ImportPayload {
  version?: string;
  exported_at?: string;
  application?: string;
  total_items?: Record<string, number>;
  data?: {
    projects?: any[];
    notes?: any[];
    diagrams?: any[];
    flowcharts?: any[];
    drawings?: any[];
    ai_chat_sessions?: any[];
  };
}

export interface ImportStats {
  projects: number;
  notes: number;
  diagrams: number;
  entities: number;
  columns: number;
  relationships: number;
  flowcharts: number;
  drawings: number;
  ai_sessions: number;
  ai_messages: number;
  skipped_existing: number;
}

// ── Helpers ──

export function now(): Date {
  return new Date();
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function safeDate(val: string | null | undefined, fallback: Date = now()): Date {
  if (!val) return fallback;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

/** Write an NDJSON progress line to the streaming response. */
export function sendProgress(res: ExpressResponse, data: Record<string, unknown>): void {
  try {
    res.write(JSON.stringify(data) + "\n");
  } catch {
    // Client may have disconnected — ignore write errors
  }
}

// ── Validation ──

export function validatePayload(body: any): { ok: true; payload: ImportPayload } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid payload: expected a JSON object" };
  }
  if (!body.data || typeof body.data !== "object") {
    return { ok: false, error: "Invalid payload: missing 'data' field" };
  }
  return { ok: true, payload: body };
}

// ── Project ID Resolution ──

export function resolveProjectId(
  rawProjectId: any,
  rawProjectIdAlt: any,
  nameToDbId: Map<string, number>,
  guestIdToName: Map<string, string>,
): number | null {
  const pid = rawProjectId ?? rawProjectIdAlt;
  if (pid != null) {
    const guestName = guestIdToName.get(String(pid));
    if (guestName) {
      const dbId = nameToDbId.get(guestName);
      if (dbId != null) return dbId;
    }
  }
  return null;
}

// ── Work Unit Counting ──

export function countWorkUnits(data: ImportPayload["data"]): number {
  if (!data) return 0;
  let total = 0;

  // Projects: 1 per project
  total += (data.projects || []).length;

  // Notes: 1 per note
  total += (data.notes || []).length;

  // Diagrams: 1 per diagram + sum of (entities + columns + relationships)
  for (const d of data.diagrams || []) {
    total += 1; // diagram itself
    const entities = d.entities || [];
    total += entities.length; // entities
    for (const e of entities) {
      total += (e.columns || []).length; // columns
    }
    total += (d.relationships || []).length; // relationships
  }

  // Flowcharts: 1 per flowchart
  total += (data.flowcharts || []).length;

  // Drawings: 1 per drawing
  total += (data.drawings || []).length;

  // AI Chat: 1 per session + sum of messages
  for (const s of data.ai_chat_sessions || []) {
    total += 1; // session
    total += (s.messages || []).length; // messages
  }

  // Minimum 1 to avoid divide-by-zero
  return Math.max(total, 1);
}
