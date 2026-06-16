import { prisma } from "../../lib/prisma.js";
import type { Response as ExpressResponse } from "express";
import type { ImportStats } from "./helpers.js";
import { uuid, safeDate, sendProgress, resolveProjectId, BATCH_SIZE } from "./helpers.js";

// ── Phase 2b: Diagrams (ERD) — the heavy phase ──
// Unpacks entities, columns, and relationships with ID remapping

export async function importDiagrams(
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
  const validItems = (items || []).filter(item => item && item.name);

  for (const item of validItems) {
    if (item.uid) {
      const existing = await prisma!.diagram.findUnique({
        where: { uid: String(item.uid) },
        select: { id: true },
      });
      if (existing) {
        stats.skipped_existing++;
        processed++;
        sendProgress(res, {
          type: "progress",
          current: workOffset + processed,
          total: totalWork,
          phase: `Skipping existing diagram: ${String(item.name).slice(0, 30)}`,
        });
        continue;
      }
    }

    const projectId = resolveProjectId(item.project_id, item.projectId, nameToDbId, guestIdToName);

    // Step 1: Create the diagram record
    const diagram = await prisma!.diagram.create({
      data: {
        uid: item.uid || uuid(),
        name: String(item.name),
        userId,
        projectId,
        isDeleted: false,
        viewportX: item.viewport_x ?? item.viewportX ?? 0,
        viewportY: item.viewport_y ?? item.viewportY ?? 0,
        viewportZoom: item.viewport_zoom ?? item.viewportZoom ?? 1.0,
        createdAt: safeDate(item.created_at),
        updatedAt: safeDate(item.updated_at),
      },
    });
    stats.diagrams++;
    processed++;

    sendProgress(res, {
      type: "progress",
      current: workOffset + processed,
      total: totalWork,
      phase: `Importing ERD: ${String(item.name).slice(0, 30)}`,
    });

    const entityIdMap = new Map<string, string>();
    const columnIdMap = new Map<string, string>();
    const entities = item.entities || [];

    // Step 2: Batch-create entities
    const entityBatch: { oldId: string; newId: string; data: any }[] = [];
    for (const entity of entities) {
      if (!entity || !entity.name) continue;
      const oldId = String(entity.id || "");
      const newId = uuid();
      if (oldId) entityIdMap.set(oldId, newId);
      entityBatch.push({
        oldId,
        newId,
        data: {
          id: newId,
          diagramId: diagram.id,
          name: String(entity.name),
          x: Number(entity.x) || 0,
          y: Number(entity.y) || 0,
          color: entity.color || "#6366f1",
          createdAt: safeDate(entity.created_at),
        },
      });
    }

    for (let i = 0; i < entityBatch.length; i += BATCH_SIZE) {
      const slice = entityBatch.slice(i, i + BATCH_SIZE);
      await prisma!.$transaction(slice.map(e => prisma!.entity.create({ data: e.data })));
      stats.entities += slice.length;
      processed += slice.length;

      sendProgress(res, {
        type: "progress",
        current: workOffset + processed,
        total: totalWork,
        phase: `Importing ERD tables (${stats.entities} done)…`,
      });
    }

    // Step 3: Batch-create columns
    const columnBatch: { oldId: string; newId: string; data: any }[] = [];
    for (const entity of entities) {
      if (!entity || !entity.name) continue;
      const newEntityId = entityIdMap.get(String(entity.id || ""));
      if (!newEntityId) continue;

      const columns = entity.columns || [];
      for (const col of columns) {
        if (!col || !col.name) continue;
        const oldColId = String(col.id || "");
        const newColId = uuid();
        if (oldColId) columnIdMap.set(oldColId, newColId);
        columnBatch.push({
          oldId: oldColId,
          newId: newColId,
          data: {
            id: newColId,
            entityId: newEntityId,
            name: String(col.name),
            type: String(col.type || "TEXT"),
            isPk: col.is_pk ?? col.isPk ?? false,
            isNullable: col.is_nullable ?? col.isNullable ?? true,
            enumValues: col.enum_values ?? col.enumValues ?? null,
            sortOrder: col.sort_order ?? col.sortOrder ?? 0,
            createdAt: safeDate(col.created_at),
          },
        });
      }
    }

    for (let i = 0; i < columnBatch.length; i += BATCH_SIZE) {
      const slice = columnBatch.slice(i, i + BATCH_SIZE);
      await prisma!.$transaction(slice.map(c => prisma!.column.create({ data: c.data })));
      stats.columns += slice.length;
      processed += slice.length;

      sendProgress(res, {
        type: "progress",
        current: workOffset + processed,
        total: totalWork,
        phase: `Importing ERD columns (${stats.columns} done)…`,
      });
    }

    // Step 4: Batch-create relationships
    const relationships = item.relationships || [];
    const relBatch: any[] = [];

    for (const rel of relationships) {
      if (!rel) continue;

      const oldSourceEntityId = String(rel.source_entity_id || rel.sourceEntityId || "");
      const oldTargetEntityId = String(rel.target_entity_id || rel.targetEntityId || "");
      const oldSourceColumnId = String(rel.source_column_id || rel.sourceColumnId || "");
      const oldTargetColumnId = String(rel.target_column_id || rel.targetColumnId || "");

      const sourceEntityId = entityIdMap.get(oldSourceEntityId) || oldSourceEntityId || null;
      const targetEntityId = entityIdMap.get(oldTargetEntityId) || oldTargetEntityId || null;
      const sourceColumnId = columnIdMap.get(oldSourceColumnId) || oldSourceColumnId || null;
      const targetColumnId = columnIdMap.get(oldTargetColumnId) || oldTargetColumnId || null;

      let sourceHandle = rel.source_handle || rel.sourceHandle || null;
      let targetHandle = rel.target_handle || rel.targetHandle || null;

      if (sourceHandle && oldSourceColumnId && sourceColumnId) {
        sourceHandle = sourceHandle.replace(oldSourceColumnId, sourceColumnId);
      }
      if (targetHandle && oldTargetColumnId && targetColumnId) {
        targetHandle = targetHandle.replace(oldTargetColumnId, targetColumnId);
      }

      relBatch.push({
        id: uuid(),
        diagramId: diagram.id,
        sourceEntityId,
        targetEntityId,
        sourceColumnId,
        targetColumnId,
        type: rel.type || "one-to-many",
        sourceHandle,
        targetHandle,
        label: rel.label || null,
        createdAt: safeDate(rel.created_at),
      });
    }

    for (let i = 0; i < relBatch.length; i += BATCH_SIZE) {
      const slice = relBatch.slice(i, i + BATCH_SIZE);
      await prisma!.$transaction(slice.map(r => prisma!.relationship.create({ data: r })));
      stats.relationships += slice.length;
      processed += slice.length;

      sendProgress(res, {
        type: "progress",
        current: workOffset + processed,
        total: totalWork,
        phase: `Importing ERD relationships (${stats.relationships} done)…`,
      });
    }
  }

  return processed;
}
