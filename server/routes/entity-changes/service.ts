import { prisma } from "../../lib/prisma.js";
import {
  captureEntityRevision,
  getEntityRevision,
  listEntityRevisions,
  type HistoryEntityType,
} from "../../lib/entity-history.js";
import { saveDiagram } from "../diagrams/save-service.js";
import { useLocalAuth } from "../../lib/config.js";

function ownedWhere(uid: string, userId: string): any {
  const numericId = /^\d+$/.test(uid) ? (useLocalAuth() ? Number(uid) : BigInt(uid)) : null;
  return numericId !== null
    ? { userId, OR: [{ uid }, { id: numericId }] }
    : { userId, uid };
}

function parseJson(value: unknown, fallback: any) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function scalarSnapshot(entityType: HistoryEntityType, entity: any) {
  if (entityType === "notes") {
    return { title: entity.title ?? "", content: entity.content ?? "", project_id: entity.projectId ?? null };
  }
  return { title: entity.title ?? "", data: entity.data ?? "", project_id: entity.projectId ?? null };
}

async function diagramSnapshot(diagram: any) {
  const parsedData = parseJson(diagram.data, null);
  if (diagram.sourceType === "production_db" || parsedData?._type === "production_db_positions") {
    return {
      name: diagram.name,
      source_type: "production_db",
      data: {
        nodes: parsedData?.nodes ?? {},
        viewport: parsedData?.viewport ?? { x: diagram.viewportX ?? 0, y: diagram.viewportY ?? 0, zoom: diagram.viewportZoom ?? 1 },
        _type: "production_db_positions",
        dbml_source: parsedData?.dbml_source ?? diagram.dbmlSource ?? "",
        schema_fingerprint: parsedData?.schema_fingerprint ?? null,
      },
      dbml_source: diagram.dbmlSource ?? parsedData?.dbml_source ?? "",
    };
  }

  const entities = await prisma!.entity.findMany({ where: { diagramId: diagram.id } });
  const entityIds = entities.map(entity => entity.id);
  const [columns, relationships, constraints, indexes] = await Promise.all([
    prisma!.column.findMany({ where: { entityId: { in: entityIds } }, orderBy: { sortOrder: "asc" } }),
    prisma!.relationship.findMany({ where: { diagramId: diagram.id } }),
    prisma!.tableConstraint.findMany({ where: { entityId: { in: entityIds } } }),
    prisma!.tableIndex.findMany({ where: { entityId: { in: entityIds } } }),
  ]);

  return {
    name: diagram.name,
    source_type: "blank",
    entities: entities.map((entity: any) => ({
      id: entity.id,
      name: entity.name,
      x: entity.x,
      y: entity.y,
      color: entity.color,
      comment: entity.comment ?? "",
      columns: columns.filter(column => column.entityId === entity.id).map((column: any) => ({
        id: column.id,
        name: column.name,
        type: column.type,
        is_pk: Boolean(column.isPk),
        is_nullable: Boolean(column.isNullable),
        is_unique: Boolean(column.isUnique),
        default_value: column.defaultValue ?? null,
        enum_values: column.enumValues ?? "",
        comment: column.comment ?? "",
        max_length: column.maxLength ?? null,
        numeric_precision: column.numericPrecision ?? null,
        numeric_scale: column.numericScale ?? null,
        sort_order: column.sortOrder ?? 0,
        _entity_id: entity.id,
      })),
      constraints: constraints.filter(item => item.entityId === entity.id).map((item: any) => ({
        id: item.id,
        kind: item.kind,
        name: item.name,
        column_ids: parseJson(item.columnIds, []),
        expression: item.expression,
        _entity_id: entity.id,
      })),
      indexes: indexes.filter(item => item.entityId === entity.id).map((item: any) => ({
        id: item.id,
        name: item.name,
        column_ids: parseJson(item.columnIds, []),
        is_unique: Boolean(item.isUnique),
        algorithm: item.algorithm,
        _entity_id: entity.id,
      })),
    })),
    relationships: relationships.map((relation: any) => ({
      id: relation.id,
      source_entity_id: relation.sourceEntityId,
      target_entity_id: relation.targetEntityId,
      source_column_id: relation.sourceColumnId,
      target_column_id: relation.targetColumnId,
      source_handle: relation.sourceHandle,
      target_handle: relation.targetHandle,
      type: relation.type,
      label: relation.label,
      on_delete: relation.onDelete,
      on_update: relation.onUpdate,
      constraint_name: relation.constraintName,
    })),
    viewport: { x: diagram.viewportX ?? 0, y: diagram.viewportY ?? 0, zoom: diagram.viewportZoom ?? 1 },
    dbml_source: diagram.dbmlSource ?? "",
  };
}

export async function readOwnedEntity(entityType: HistoryEntityType, uid: string, userId: string) {
  if (!prisma) throw new Error("Database connection not available");
  const where = ownedWhere(uid, userId);
  const entity = entityType === "notes"
    ? await prisma.note.findFirst({ where })
    : entityType === "flowcharts"
      ? await prisma.flowchart.findFirst({ where })
      : entityType === "drawings"
        ? await prisma.drawing.findFirst({ where })
        : await prisma.diagram.findFirst({ where });
  if (!entity) return null;
  if (entityType === "diagrams" && (entity as any).sourceType === "production_db") return null;
  return {
    entity,
    entityId: String(entity.id),
    updatedAt: entity.updatedAt ? new Date(entity.updatedAt).toISOString() : null,
    snapshot: entityType === "diagrams" ? await diagramSnapshot(entity) : scalarSnapshot(entityType, entity),
  };
}

export async function listHistory(entityType: HistoryEntityType, uid: string, userId: string, limit: number) {
  const current = await readOwnedEntity(entityType, uid, userId);
  if (!current) return null;
  const revisions = await listEntityRevisions(entityType, current.entityId, userId, limit);
  return {
    current_updated_at: current.updatedAt,
    revisions: revisions.filter(revision => revision.createdAt).map(revision => ({
      id: String(revision.id),
      version: revision.version,
      change_type: revision.changeType,
      created_at: revision.createdAt?.toISOString() ?? null,
    })),
  };
}

export async function readHistoryRevision(entityType: HistoryEntityType, uid: string, userId: string, revisionId: string) {
  const current = await readOwnedEntity(entityType, uid, userId);
  if (!current) return null;
  const revision = await getEntityRevision(entityType, current.entityId, userId, revisionId);
  if (!revision) return null;
  return {
    id: String(revision.id),
    version: revision.version,
    change_type: revision.changeType,
    created_at: revision.createdAt?.toISOString() ?? null,
    source: revision.envelope.source,
    snapshot: revision.envelope.snapshot,
  };
}

function sameTimestamp(left: string | null, right: string | null) {
  return left === right || (left !== null && right !== null && new Date(left).getTime() === new Date(right).getTime());
}

async function applyScalarRestore(entityType: HistoryEntityType, entity: any, snapshot: Record<string, any>) {
  const version = useLocalAuth() ? { version: (entity.version ?? 0) + 1 } : {};
  const data = entityType === "notes"
    ? { title: String(snapshot.title ?? "Untitled"), content: String(snapshot.content ?? ""), updatedAt: new Date(), ...version }
    : { title: String(snapshot.title ?? "Untitled"), data: typeof snapshot.data === "string" ? snapshot.data : JSON.stringify(snapshot.data ?? ""), updatedAt: new Date(), ...version };
  if (entityType === "notes") return prisma!.note.update({ where: { id: entity.id }, data });
  if (entityType === "flowcharts") return prisma!.flowchart.update({ where: { id: entity.id }, data });
  return prisma!.drawing.update({ where: { id: entity.id }, data });
}

async function applyDiagramRestore(uid: string, userId: string, current: any, snapshot: Record<string, any>) {
  if (current.entity.sourceType === "production_db") {
    const existingData = parseJson(current.entity.data, {});
    const historicalData = parseJson(snapshot.data, {});
    const restoredData = {
      ...existingData,
      nodes: historicalData.nodes ?? {},
      viewport: historicalData.viewport ?? { x: 0, y: 0, zoom: 1 },
      _type: "production_db_positions",
      dbml_source: historicalData.dbml_source ?? current.entity.dbmlSource ?? "",
      schema_fingerprint: historicalData.schema_fingerprint ?? existingData.schema_fingerprint ?? null,
    };
    return prisma!.diagram.update({
      where: { id: current.entity.id },
      data: {
        data: JSON.stringify(restoredData),
        viewportX: restoredData.viewport.x ?? 0,
        viewportY: restoredData.viewport.y ?? 0,
        viewportZoom: restoredData.viewport.zoom ?? 1,
        updatedAt: new Date(),
        ...(useLocalAuth() && { version: (current.entity.version ?? 0) + 1 }),
      },
    });
  }

  await prisma!.diagram.update({ where: { id: current.entity.id }, data: { name: snapshot.name ?? current.entity.name } });
  return saveDiagram(uid, userId, {
    entities: Array.isArray(snapshot.entities) ? snapshot.entities : [],
    relationships: Array.isArray(snapshot.relationships) ? snapshot.relationships : [],
    viewport: snapshot.viewport ?? { x: 0, y: 0, zoom: 1 },
    dbmlSource: snapshot.dbml_source ?? "",
  });
}

export async function restoreHistoryRevision(input: {
  entityType: HistoryEntityType;
  uid: string;
  userId: string;
  revisionId: string;
  expectedUpdatedAt: string | null;
}) {
  const current = await readOwnedEntity(input.entityType, input.uid, input.userId);
  if (!current) return { status: "not_found" as const };
  if (!sameTimestamp(current.updatedAt, input.expectedUpdatedAt)) return { status: "conflict" as const, currentUpdatedAt: current.updatedAt };

  const revision = await getEntityRevision(input.entityType, current.entityId, input.userId, input.revisionId);
  if (!revision) return { status: "revision_not_found" as const };

  await captureEntityRevision({
    entityType: input.entityType,
    entityId: current.entityId,
    userId: input.userId,
    snapshot: current.snapshot,
    changeType: "pre_restore",
    source: "restore",
    restoredFromId: input.revisionId,
    force: true,
  });

  if (input.entityType === "diagrams") {
    await applyDiagramRestore(input.uid, input.userId, current, revision.envelope.snapshot);
  } else {
    await applyScalarRestore(input.entityType, current.entity, revision.envelope.snapshot);
  }

  const restored = await readOwnedEntity(input.entityType, input.uid, input.userId);
  if (!restored) throw new Error("Restored document could not be loaded");
  const restoredRevision = await captureEntityRevision({
    entityType: input.entityType,
    entityId: current.entityId,
    userId: input.userId,
    snapshot: restored.snapshot,
    changeType: "restore",
    source: "restore",
    restoredFromId: input.revisionId,
    force: true,
  });
  return { status: "ok" as const, revisionId: restoredRevision?.id, updatedAt: restored.updatedAt };
}
