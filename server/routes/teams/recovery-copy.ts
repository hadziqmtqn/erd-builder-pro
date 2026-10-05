import { randomUUID } from "node:crypto";
import { TeamServiceError } from "./service.js";
import { replacePrivateStorageUrls, replacePrivateStorageUrlsInDrawingData } from "../../lib/storage-access.js";

export const recoveryModels = { erd: "diagram", notes: "note", drawings: "drawing", flowchart: "flowchart" } as const;
export type RecoveryFileType = keyof typeof recoveryModels;
export type RecoverySelection = { type: RecoveryFileType; id: number };

const privateCopy = {
  isDeleted: false, deletedAt: null, isPublic: false, publicAccess: "off",
  shareToken: null, shareTokenHash: null, expiryDate: null, shareExpiresAt: null, publishedAt: null,
};

function mapped(id: string | null, mapping: Map<string, string>): string | null {
  if (id === null) return null;
  const result = mapping.get(id);
  if (!result) throw new TeamServiceError("RECOVERY_DATA_INVALID", 409, "An ERD contains an unresolved reference. No files were copied.");
  return result;
}

function columnReferences(value: string | null, mapping: Map<string, string>): string | null {
  if (value === null) return null;
  let ids: unknown;
  try { ids = JSON.parse(value); } catch { throw new TeamServiceError("RECOVERY_DATA_INVALID", 409, "An ERD contains invalid column references. No files were copied."); }
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    throw new TeamServiceError("RECOVERY_DATA_INVALID", 409, "An ERD contains invalid column references. No files were copied.");
  }
  return JSON.stringify(ids.map((id) => mapped(id, mapping)));
}

function recoveryHandle(value: string | null, columnId: string | null, kind: "source" | "target"): string | null {
  if (!columnId) return null;
  const side = kind === "source" && value?.endsWith("-source-l") ? "source-l"
    : kind === "target" && value?.endsWith("-target-r") ? "target-r" : kind;
  return `col-${columnId}-${side}`;
}

async function copyDiagram(tx: any, source: any, projectId: number, actorId: string) {
  const diagram = await tx.diagram.create({ data: {
    ...privateCopy, uid: randomUUID(), userId: actorId, projectId, name: source.name,
    viewportX: source.viewportX, viewportY: source.viewportY, viewportZoom: source.viewportZoom,
    dbmlSource: source.dbmlSource, data: source.data, sourceType: "blank", sourceConnectionId: null,
  } });
  const entities = await tx.entity.findMany({ where: { diagramId: source.id }, include: { columns: true, constraints: true, indexes: true } });
  const entityIds = new Map<string, string>(entities.map((entity: any) => [entity.id, randomUUID()]));
  const columnIds = new Map<string, string>(entities.flatMap((entity: any) => entity.columns.map((column: any) => [column.id, randomUUID()])));
  const entityRows = entities.map((entity: any) => ({ id: entityIds.get(entity.id), diagramId: diagram.id, name: entity.name, x: entity.x, y: entity.y, color: entity.color, comment: entity.comment }));
  const columns = entities.flatMap((entity: any) => entity.columns.map((column: any) => {
    const { id, entityId: _parent, createdAt: _created, ...data } = column;
    return { ...data, id: columnIds.get(id), entityId: entityIds.get(entity.id) };
  }));
  const constraints = entities.flatMap((entity: any) => entity.constraints.map((constraint: any) => {
    const { id: _id, entityId: _parent, createdAt: _created, ...data } = constraint;
    return { ...data, id: randomUUID(), entityId: entityIds.get(entity.id), columnIds: columnReferences(constraint.columnIds, columnIds) };
  }));
  const indexes = entities.flatMap((entity: any) => entity.indexes.map((index: any) => {
    const { id: _id, entityId: _parent, createdAt: _created, ...data } = index;
    return { ...data, id: randomUUID(), entityId: entityIds.get(entity.id), columnIds: columnReferences(index.columnIds, columnIds) };
  }));
  const relationships = (await tx.relationship.findMany({ where: { diagramId: source.id } })).map((edge: any) => {
    const { id: _id, diagramId: _diagram, createdAt: _created, ...data } = edge;
    const sourceColumnId = mapped(edge.sourceColumnId, columnIds);
    const targetColumnId = mapped(edge.targetColumnId, columnIds);
    return {
      ...data, id: randomUUID(), diagramId: diagram.id,
      sourceEntityId: mapped(edge.sourceEntityId, entityIds), targetEntityId: mapped(edge.targetEntityId, entityIds),
      sourceColumnId, targetColumnId,
      sourceHandle: recoveryHandle(edge.sourceHandle, sourceColumnId, "source"), targetHandle: recoveryHandle(edge.targetHandle, targetColumnId, "target"),
    };
  });
  if (entityRows.length) await tx.entity.createMany({ data: entityRows });
  if (columns.length) await tx.column.createMany({ data: columns });
  if (constraints.length) await tx.tableConstraint.createMany({ data: constraints });
  if (indexes.length) await tx.tableIndex.createMany({ data: indexes });
  if (relationships.length) await tx.relationship.createMany({ data: relationships });
  return diagram;
}

export async function copyRecoveryFile(tx: any, type: RecoveryFileType, source: any, projectId: number, actorId: string) {
  if (type === "erd") return copyDiagram(tx, source, projectId, actorId);
  return tx[recoveryModels[type]].create({ data: {
    ...privateCopy, uid: randomUUID(), userId: actorId, projectId, title: source.title,
    ...(type === "notes"
      ? { content: source.content ? replacePrivateStorageUrls(source.content, {}) : source.content }
      : { data: type === "drawings" && source.data ? replacePrivateStorageUrlsInDrawingData(source.data, {}) : source.data }),
  } });
}
