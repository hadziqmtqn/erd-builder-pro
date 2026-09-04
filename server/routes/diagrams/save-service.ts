import { prisma } from "../../lib/prisma.js";
import { fetchSchema, testConnection } from "../../lib/db-connectors/registry.js";
import { erdColumnType } from "../../lib/db-connectors/types.js";
import type { ConnectionInfo } from "../../lib/db-connectors/types.js";
import { encrypt } from "../../lib/crypto.js";
import { captureEntityRevisionSafely } from "../../lib/entity-history.js";
import { isDesktopMode, isLocalPostgres } from "../../lib/config.js";
import {
  uidWhereClause,
  dedupe,
  upsertEntities,
  upsertColumns,
  upsertRelationships,
  upsertTableConstraints,
  upsertTableIndexes,
} from "./service.js";

// ── Save (entities/relationships/columns CRUD + versioning + audit) ──

export async function saveDiagram(
  identifier: string,
  userId: string,
  body: {
    entities?: any[];
    relationships?: any[];
    viewport?: { x: number; y: number; zoom: number };
    expectedVersion?: number | null;
    data?: any;
    dbmlSource?: string | null;
    dbml_source?: string | null;
  }
) {
  if (!prisma) throw new Error("Database connection not available");

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

  let diagramWhere: any = { userId };
  if (isUuid) {
    diagramWhere.uid = identifier;
  } else if (!isNaN(Number(identifier))) {
    diagramWhere.id = Number(identifier);
  } else {
    throw new Error("Invalid identifier format");
  }

  const currentDiagram = await prisma.diagram.findFirst({
    where: diagramWhere,
    select: {
      id: true, uid: true, version: true, updatedAt: true, name: true, data: true,
      sourceType: true, dbmlSource: true, viewportX: true, viewportY: true, viewportZoom: true,
    },
  });

  if (!currentDiagram) return null;

  const diagramId = Number(currentDiagram.id);

  // Backfill uid if missing
  if (!isUuid && !currentDiagram.uid) {
    const backfillUid = crypto.randomUUID();
    await prisma.diagram.update({
      where: { id: diagramId },
      data: { uid: backfillUid },
    });
    currentDiagram.uid = backfillUid;
  }

  // Version check
  if (body.expectedVersion !== undefined && body.expectedVersion !== null) {
    if (currentDiagram.version !== body.expectedVersion) {
      return {
        conflict: true,
        currentVersion: currentDiagram.version,
        error: "Conflict: Diagram was modified. Please refresh and try again.",
      };
    }
  }

  const dedupedEntities = dedupe(body.entities || [], "entity");
  const dedupedRelationships = dedupe(body.relationships || [], "relationship");

  // ── Production DB diagrams: skip entity/relationship CRUD, preserve _type + source ──
  const isProductionDbSave = currentDiagram.sourceType === "production_db" ||
    (body.data !== undefined && typeof body.data === "object" && (body.data as any)?._type === "production_db_positions");

  if (!isProductionDbSave) {
    const existingRelationships = await prisma.relationship.findMany({
      where: { diagramId },
      select: { id: true },
    });

    const existingRelIds = new Set(existingRelationships.map(r => r.id));
    const newRelIds = new Set(dedupedRelationships.map((r: any) => r.id));

    const existingEntities = await prisma.entity.findMany({
      where: { diagramId },
      select: { id: true },
    });

    const existingEntityIds = new Set(existingEntities.map(e => e.id));
    const newEntityIds = new Set(dedupedEntities.map((e: any) => e.id));
    const entitiesToDelete = Array.from(existingEntityIds).filter(id => !newEntityIds.has(id));
    let colsToDelete: string[] = [];

    if (dedupedEntities.length > 0) {
      await upsertEntities(dedupedEntities, diagramId);

      const allColumns: any[] = [];
      const newColIds = new Set();
      const seenColIds = new Set();
      for (const entity of dedupedEntities) {
        for (const col of entity.columns || []) {
          if (seenColIds.has(col.id)) continue;
          seenColIds.add(col.id);
          allColumns.push({ ...col, _entity_id: entity.id });
          newColIds.add(col.id);
        }
      }

      if (allColumns.length > 0) {
        await upsertColumns(allColumns);
      }

      const allConstraints = dedupedEntities.flatMap(entity =>
        (entity.constraints || []).map((constraint: any) => ({ ...constraint, _entity_id: entity.id }))
      );
      const allIndexes = dedupedEntities.flatMap(entity =>
        (entity.indexes || []).map((index: any) => ({ ...index, _entity_id: entity.id }))
      );
      if (allConstraints.length > 0) await upsertTableConstraints(allConstraints);
      if (allIndexes.length > 0) await upsertTableIndexes(allIndexes);

      const keptEntityIds = Array.from(existingEntityIds).filter(id => newEntityIds.has(id));
      if (keptEntityIds.length > 0) {
        const existingColumns = await prisma.column.findMany({
          where: { entityId: { in: keptEntityIds } },
          select: { id: true },
        });
        const existingColIds = new Set(existingColumns.map((c: any) => c.id));
        colsToDelete = Array.from(existingColIds).filter(id => !newColIds.has(id)) as string[];
      }

      const existingConstraints = await prisma.tableConstraint.findMany({ where: { entityId: { in: Array.from(existingEntityIds) } }, select: { id: true } });
      const existingIndexes = await prisma.tableIndex.findMany({ where: { entityId: { in: Array.from(existingEntityIds) } }, select: { id: true } });
      const newConstraintIds = new Set(allConstraints.map((constraint: any) => constraint.id));
      const newIndexIds = new Set(allIndexes.map((index: any) => index.id));
      const constraintsToDelete = existingConstraints.map(item => item.id).filter(id => !newConstraintIds.has(id));
      const indexesToDelete = existingIndexes.map(item => item.id).filter(id => !newIndexIds.has(id));
      if (constraintsToDelete.length > 0) await prisma.tableConstraint.deleteMany({ where: { id: { in: constraintsToDelete } } });
      if (indexesToDelete.length > 0) await prisma.tableIndex.deleteMany({ where: { id: { in: indexesToDelete } } });
    }

    if (dedupedRelationships.length > 0) {
      await upsertRelationships(dedupedRelationships, diagramId);
    }

    const relsToDelete = Array.from(existingRelIds).filter(id => !newRelIds.has(id));
    if (relsToDelete.length > 0) {
      await prisma.relationship.deleteMany({
        where: { id: { in: relsToDelete } },
      });
    }

    if (colsToDelete.length > 0) {
      await prisma.column.deleteMany({
        where: { id: { in: colsToDelete } },
      });
    }

    if (entitiesToDelete.length > 0) {
      await prisma.tableConstraint.deleteMany({ where: { entityId: { in: entitiesToDelete } } });
      await prisma.tableIndex.deleteMany({ where: { entityId: { in: entitiesToDelete } } });
      await prisma.column.deleteMany({
        where: { entityId: { in: entitiesToDelete } },
      });
      await prisma.entity.deleteMany({
        where: { id: { in: entitiesToDelete } },
      });
    }
  }

  // ── Merge missing _type + source into incoming data for production DB diagrams ──
  let mergedData = body.data;
  if (isProductionDbSave && body.data !== undefined) {
    const incomingData = typeof body.data === "string"
      ? JSON.parse(body.data)
      : { ...body.data };
    const existingParsed = currentDiagram.data
      ? (typeof currentDiagram.data === "string" ? JSON.parse(currentDiagram.data) : currentDiagram.data)
      : {};
    if (!incomingData._type && existingParsed._type) incomingData._type = existingParsed._type;
    if (!incomingData.source && existingParsed.source) incomingData.source = existingParsed.source;
    mergedData = incomingData;
  }

  const dataDbmlSource = body.data && typeof body.data === "object"
    ? (body.data as any).dbml_source ?? (body.data as any).dbmlSource
    : undefined;
  const normalizedDbmlSource = body.dbmlSource ?? body.dbml_source ?? dataDbmlSource;

  const updatedDiagram = await prisma.diagram.update({
    where: { id: diagramId },
    data: {
      updatedAt: new Date(),
      viewportX: body.viewport?.x ?? currentDiagram.viewportX ?? 0,
      viewportY: body.viewport?.y ?? currentDiagram.viewportY ?? 0,
      viewportZoom: body.viewport?.zoom ?? currentDiagram.viewportZoom ?? 1.0,
      ...(mergedData !== undefined && { data: mergedData === null ? null : typeof mergedData === "string" ? mergedData : JSON.stringify(mergedData) }),
      ...(normalizedDbmlSource !== undefined && { dbmlSource: normalizedDbmlSource }),
      ...((isDesktopMode() || isLocalPostgres()) && { version: (currentDiagram.version ?? 0) + 1 }),
    },
    select: { version: true },
  });

  const parsedHistoryData = isProductionDbSave
    ? (typeof mergedData === "string" ? JSON.parse(mergedData) : mergedData ?? {})
    : null;
  await captureEntityRevisionSafely({
    entityType: "diagrams",
    entityId: diagramId,
    userId,
    snapshot: isProductionDbSave
      ? {
          name: currentDiagram.name,
          source_type: "production_db",
          data: {
            nodes: parsedHistoryData.nodes ?? {},
            viewport: parsedHistoryData.viewport ?? body.viewport ?? { x: 0, y: 0, zoom: 1 },
            _type: "production_db_positions",
            dbml_source: normalizedDbmlSource ?? currentDiagram.dbmlSource ?? "",
            schema_fingerprint: parsedHistoryData.schema_fingerprint ?? null,
          },
          dbml_source: normalizedDbmlSource ?? currentDiagram.dbmlSource ?? "",
        }
      : {
          name: currentDiagram.name,
          source_type: "blank",
          entities: dedupedEntities,
          relationships: dedupedRelationships,
          viewport: body.viewport ?? { x: 0, y: 0, zoom: 1 },
          dbml_source: normalizedDbmlSource ?? currentDiagram.dbmlSource ?? "",
        },
  });

  return {
    success: true,
    version: updatedDiagram?.version ?? (currentDiagram.version ?? 0) + 1,
  };
}

// ── Get diagram with data (production DB aware) ──

export async function getDiagramWithData(uid: string, userId: string) {
  const diagram = await prisma?.diagram.findFirst({
    where: uidWhereClause(uid, userId),
  });
  if (!diagram) return null;

  const diagramId = Number(diagram.id);

  // Only production DB diagrams use `data` as their canvas source. Blank ERDs
  // remain relational even if an older client left a legacy data payload.
  if ((diagram as any).sourceType === "production_db" && (diagram as any).data) {
    let parsedData: any = null;
    try {
      parsedData = typeof (diagram as any).data === "string"
        ? JSON.parse((diagram as any).data)
        : (diagram as any).data;
    } catch {
      parsedData = { nodes: {} };
    }
    return { ...diagram, data: parsedData, entities: [], relationships: [] };
  }

  // Normal diagram: include entities + relationships
  const entities = await prisma!.entity.findMany({
    where: { diagramId },
  });

  const relationships = await prisma!.relationship.findMany({
    where: { diagramId },
  });
  const constraints = await prisma!.tableConstraint.findMany({
    where: { entityId: { in: (await prisma!.entity.findMany({ where: { diagramId }, select: { id: true } })).map(entity => entity.id) } },
  });
  const indexes = await prisma!.tableIndex.findMany({
    where: { entityId: { in: (await prisma!.entity.findMany({ where: { diagramId }, select: { id: true } })).map(entity => entity.id) } },
  });

  const entitiesWithColumns = await Promise.all(
    entities.map(async (entity: any) => {
      const columns = await prisma!.column.findMany({
        where: { entityId: entity.id },
        orderBy: { sortOrder: "asc" },
      });
      // Prisma exposes the mapped database field as `enumValues`; the ERD
      // client uses `enum_values`. Without this normalization enum metadata
      // disappeared after a browser reload, so DBML could no longer emit it.
      return {
        ...entity,
        constraints: constraints.filter(item => item.entityId === entity.id).map(item => ({
          ...item,
          entity_id: item.entityId,
          column_ids: item.columnIds ? JSON.parse(item.columnIds) : [],
        })),
        indexes: indexes.filter(item => item.entityId === entity.id).map(item => ({
          ...item,
          entity_id: item.entityId,
          column_ids: JSON.parse(item.columnIds || "[]"),
        })),
        columns: columns.map((column: any) => ({
          ...column,
          enum_values: column.enumValues ?? column.enum_values ?? '',
          is_unique: column.isUnique ?? column.is_unique ?? false,
          default_value: column.defaultValue ?? column.default_value ?? null,
          max_length: column.maxLength ?? column.max_length ?? null,
          numeric_precision: column.numericPrecision ?? column.numeric_precision ?? null,
          numeric_scale: column.numericScale ?? column.numeric_scale ?? null,
        })),
      };
    })
  );

  return { ...diagram, entities: entitiesWithColumns, relationships };
}

// ── DB Connect: external schema ──

export async function fetchDBSchema(connInfo: ConnectionInfo) {
  const tables = await fetchSchema(connInfo);
  return tables;
}

export async function testDBConnection(connInfo: ConnectionInfo) {
  const result = await testConnection(connInfo);
  return result;
}

export async function createDiagramFromDB(data: {
  name: string;
  type: "postgresql" | "mysql" | "sqlite";
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database: string;
  userId: string;
}) {
  if (!prisma) throw new Error("Database connection not available");

  const connInfo: ConnectionInfo = {
    type: data.type,
    host: data.host || undefined,
    port: data.port || undefined,
    user: data.user || undefined,
    password: data.password || undefined,
    database: data.database,
  };

  const tables = await fetchSchema(connInfo);

  // Build positions (auto-layout)
  const entities = tables.map((t: any, i: number) => ({
    name: t.table_name,
    x: (i % 4) * 280 + 50,
    y: Math.floor(i / 4) * 200 + 50,
    color: "#6b7280",
    columns: (t.columns || []).map((c: any) => ({
      name: c.name,
      type: erdColumnType(c),
      is_pk: !!c.is_pk,
      is_nullable: !!c.is_nullable,
      comment: c.comment || "",
      max_length: c.max_length ?? null,
      numeric_precision: c.numeric_precision ?? null,
      numeric_scale: c.numeric_scale ?? null,
      sort_order: c.sort_order || 0,
      _is_fk: (t.foreign_keys || []).some((fk: any) => fk.column === c.name),
    })),
  }));

  const positions: Record<string, any> = {};
  entities.forEach(e => {
    positions[e.name] = { x: e.x, y: e.y, color: e.color, collapsed: false, hidden_columns: [], note: "" };
  });

  const encryptedPassword = data.password ? encrypt(data.password) : undefined;

  const diagramData = {
    nodes: positions,
    viewport: { x: 0, y: 0, zoom: 1 },
    _type: "production_db_positions",
    source: {
      type: data.type,
      host: data.host || undefined,
      port: data.port || undefined,
      user: data.user || undefined,
      database: data.database,
      password_encrypted: encryptedPassword,
    },
  };

  const diagram = await prisma.diagram.create({
    data: {
      name: data.name.trim(),
      uid: crypto.randomUUID(),
      userId: data.userId,
      sourceType: "production_db",
      data: JSON.stringify(diagramData),
    },
    select: { id: true, uid: true, name: true, data: true, sourceType: true, updatedAt: true },
  });

  return { diagram, schema: tables };
}
