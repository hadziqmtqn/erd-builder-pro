import { prisma } from "./prisma.js";
import { isDesktopMode, isLocalPostgres, useLocalAuth } from "./config.js";
import { logger } from "./logger.js";

export const HISTORY_ENTITY_TYPES = ["notes", "flowcharts", "drawings", "diagrams"] as const;
export type HistoryEntityType = (typeof HISTORY_ENTITY_TYPES)[number];
export type HistoryChangeType = "create" | "update" | "delete" | "restore" | "pre_restore";

export type HistoryEnvelope = {
  schema_version: 1;
  source: "autosave" | "manual" | "restore";
  snapshot: Record<string, any>;
  restored_from_id?: string;
};

type CaptureRevisionInput = {
  entityType: HistoryEntityType;
  entityId: string | number | bigint;
  userId: string;
  snapshot: Record<string, any>;
  changeType?: HistoryChangeType;
  source?: HistoryEnvelope["source"];
  restoredFromId?: string;
  force?: boolean;
};

const AUTO_REVISION_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_REVISION_LIMIT = 100;

export function normalizeHistoryEntityType(value: string): HistoryEntityType | null {
  const normalized = value.toLowerCase().replace(/^note$/, "notes")
    .replace(/^flowchart$/, "flowcharts")
    .replace(/^drawing$/, "drawings")
    .replace(/^diagram$/, "diagrams");
  return (HISTORY_ENTITY_TYPES as readonly string[]).includes(normalized)
    ? normalized as HistoryEntityType
    : null;
}

function decodeChanges(value: unknown): any {
  let decoded = value;
  for (let attempt = 0; attempt < 2 && typeof decoded === "string"; attempt += 1) {
    try { decoded = JSON.parse(decoded); } catch { return {}; }
  }
  return decoded && typeof decoded === "object" ? decoded : {};
}

function legacySnapshot(entityType: HistoryEntityType, changes: Record<string, any>) {
  if (entityType === "notes") {
    return { title: changes.title ?? "", content: changes.content ?? "", project_id: changes.project_id ?? null };
  }
  if (entityType === "flowcharts" || entityType === "drawings") {
    return { title: changes.title ?? "", data: changes.data ?? "", project_id: changes.project_id ?? null };
  }
  const rawData = decodeChanges(changes.data);
  const isProduction = changes.source_type === "production_db" || rawData._type === "production_db_positions";
  const safeData = isProduction ? {
    nodes: rawData.nodes ?? {},
    viewport: rawData.viewport ?? { x: 0, y: 0, zoom: 1 },
    _type: "production_db_positions",
    dbml_source: rawData.dbml_source ?? changes.dbml_source ?? "",
    schema_fingerprint: rawData.schema_fingerprint ?? null,
  } : changes.data ?? null;
  return {
    name: changes.name ?? "",
    source_type: isProduction ? "production_db" : changes.source_type ?? "blank",
    entities: changes.entities ?? [],
    relationships: changes.relationships ?? [],
    viewport: changes.viewport ?? { x: 0, y: 0, zoom: 1 },
    data: safeData,
    dbml_source: changes.dbml_source ?? null,
  };
}

export function parseRevisionChanges(entityType: HistoryEntityType, value: unknown): HistoryEnvelope {
  const decoded = decodeChanges(value);
  if (decoded.schema_version === 1 && decoded.snapshot && typeof decoded.snapshot === "object") {
    return {
      schema_version: 1,
      source: decoded.source === "restore" || decoded.source === "manual" ? decoded.source : "autosave",
      snapshot: legacySnapshot(entityType, decoded.snapshot),
      ...(decoded.restored_from_id !== undefined ? { restored_from_id: String(decoded.restored_from_id) } : {}),
    };
  }
  return { schema_version: 1, source: "autosave", snapshot: legacySnapshot(entityType, decoded) };
}

function databaseChangesValue(envelope: HistoryEnvelope): any {
  return isDesktopMode() || isLocalPostgres() ? JSON.stringify(envelope) : envelope;
}

function equivalentSnapshot(left: Record<string, any>, right: Record<string, any>) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function captureEntityRevision(input: CaptureRevisionInput) {
  if (!prisma) throw new Error("Database connection not available");
  const entityId = String(input.entityId);
  const aliases = [input.entityType, input.entityType.slice(0, -1)];
  const snapshot = legacySnapshot(input.entityType, input.snapshot);
  const last = await prisma.entityChange.findFirst({
    where: { entityType: { in: aliases }, entityId, userId: input.userId },
    orderBy: { createdAt: "desc" },
  });

  if (!input.force && last?.createdAt && Date.now() - new Date(last.createdAt).getTime() < AUTO_REVISION_INTERVAL_MS) {
    return null;
  }
  if (!input.force && last) {
    const previous = parseRevisionChanges(input.entityType, last.changes);
    if (equivalentSnapshot(previous.snapshot, snapshot)) return null;
  }

  const aggregate = await prisma.entityChange.aggregate({
    where: { entityType: { in: aliases }, entityId, userId: input.userId },
    _max: { version: true },
  });
  const envelope: HistoryEnvelope = {
    schema_version: 1,
    source: input.source ?? "autosave",
    snapshot,
    ...(input.restoredFromId !== undefined ? { restored_from_id: input.restoredFromId } : {}),
  };
  const revision = await prisma.entityChange.create({
    data: {
      entityType: input.entityType,
      entityId,
      version: (aggregate._max.version ?? 0) + 1,
      userId: input.userId,
      changes: databaseChangesValue(envelope),
      changeType: input.changeType ?? "update",
    } as any,
  });

  if ((input.changeType ?? "update") === "update") {
    const stale = await prisma.entityChange.findMany({
      where: { entityType: { in: aliases }, entityId, userId: input.userId, changeType: "update" },
      orderBy: { createdAt: "desc" },
      skip: AUTO_REVISION_LIMIT,
      select: { id: true },
    });
    if (stale.length) await prisma.entityChange.deleteMany({ where: { id: { in: stale.map(item => item.id) } } });
  }
  return revision;
}

export async function captureEntityRevisionSafely(input: CaptureRevisionInput) {
  try {
    return await captureEntityRevision(input);
  } catch (err) {
    logger.warn({ err, entityType: input.entityType, entityId: input.entityId }, "Failed to capture entity revision");
    return null;
  }
}

export async function listEntityRevisions(entityType: HistoryEntityType, entityId: string | number, userId: string, limit = 100) {
  if (!prisma) throw new Error("Database connection not available");
  return prisma.entityChange.findMany({
    where: { entityType: { in: [entityType, entityType.slice(0, -1)] }, entityId: String(entityId), userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
    select: { id: true, version: true, changeType: true, createdAt: true, userId: true },
  });
}

export async function getEntityRevision(entityType: HistoryEntityType, entityId: string | number, userId: string, revisionId: string) {
  if (!prisma) throw new Error("Database connection not available");
  const id = useLocalAuth() ? Number(revisionId) : BigInt(revisionId);
  const revision = await prisma.entityChange.findFirst({
    where: {
      id: id as any,
      entityType: { in: [entityType, entityType.slice(0, -1)] },
      entityId: String(entityId),
      userId,
    },
  });
  return revision ? { ...revision, envelope: parseRevisionChanges(entityType, revision.changes) } : null;
}
