import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase, isDesktopMode } from "../lib/config.js";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../lib/middleware.js";
import { validate, createDiagramSchema, renameSchema } from "../lib/validation.js";
import { handleError, getSafeUpdate, uidOrIdWhere } from "../lib/utils.js";
import { logger } from "../lib/logger.js";
import { resolveOwnedProjectId } from "../lib/security.js";
import { fetchSchema, testConnection, getConnector } from "../lib/db-connectors/registry.js";
import type { ConnectionInfo, TableSchema } from "../lib/db-connectors/types.js";
import { encrypt, decrypt } from "../lib/crypto.js";

const router = Router();

router.get("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    if (!prisma) return res.status(500).json({ error: "Database connection not available" });

    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;
    const projectId = req.query.project_id as string;
    const q = req.query.q as string;
    const isPublic = req.query.is_public === 'true' ? true : req.query.is_public === 'false' ? false : null;

    const where: any = {
      userId: (req as any).user.id,
      isDeleted: false,
    };

    if (isPublic !== null) {
      where.isPublic = isPublic;
    }

    if (q && q.trim()) {
      where.name = { contains: q.trim(), mode: 'insensitive' };
    }

    if (projectId === "null") {
      where.projectId = null;
    } else if (projectId && projectId !== "all" && !isNaN(parseInt(projectId))) {
      where.projectId = parseInt(projectId);
    }

    const deletedProjects = await prisma.project.findMany({
      where: { isDeleted: true },
      select: { id: true },
    });
    const deletedIds = deletedProjects.map(p => Number(p.id));

    if (deletedIds.length > 0) {
      where.OR = [
        { projectId: null },
        { projectId: { notIn: deletedIds } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.diagram.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          uid: true,
          name: true,
          projectId: true,
          isPublic: true,
          shareToken: true,
          expiryDate: true,
          createdAt: true,
          updatedAt: true,
          isDeleted: true,
          userId: true,
          sourceType: true,
          sourceConnectionId: true,
          project: { select: { name: true, uid: true, id: true } },
        },
      }),
      prisma.diagram.count({ where }),
    ]);

    // Debug: log first few diagrams' sourceType
    if (data && data.length > 0) {
      console.log('[DEBUG] GET / list sourceTypes:', data.slice(0, 3).map(d => ({ id: d.id, uid: d.uid?.slice(0,8), sourceType: d.sourceType, sourceConnectionId: d.sourceConnectionId })));
    }

    res.json({ data: data || [], total: total || 0 });
  } catch (err: any) {
    handleError(res, err, "Failed to fetch diagrams");
  }
});

router.post("/", authenticate, validate(createDiagramSchema), async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    if (!prisma) return res.status(500).json({ error: "Database connection not available" });

    const { name, project_id, uid } = req.body;
    const userId = (req as any).user.id;
    const resolvedProjectId = await resolveOwnedProjectId(prisma, userId, project_id);
    const data = await prisma.diagram.create({
      data: {
        name,
        projectId: resolvedProjectId,
        uid: uid || undefined,
        userId,
      },
    });

    res.json(data);
  } catch (err: any) {
    handleError(res, err, "Failed to create diagram");
  }
});

router.get("/public/:uid", async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    if (!prisma) return res.status(500).json({ error: "Database connection not available" });

    const diagram = await prisma.diagram.findUnique({
      where: { uid: req.params.uid },
      include: { project: { select: { name: true, isDeleted: true } } },
    });

    if (!diagram) return res.status(404).json({ error: "Diagram not found" });

    if (diagram.project && diagram.project.isDeleted) {
      return res.status(404).json({ error: "Diagram not found (associated project deleted)" });
    }

    if (diagram.isDeleted) {
      return res.status(404).json({ error: "Diagram not found" });
    }

    if (!diagram.isPublic) {
      return res.status(403).json({ error: "This document is private" });
    }

    let isOwner = false;
    const sessionToken = req.cookies.token;
    if (sessionToken) {
      const { data: { user } } = await supabase.auth.getUser(sessionToken);
      if (user && user.id === diagram.userId) {
        isOwner = true;
      }
    }

    if (!isOwner) {
      if (diagram.expiryDate && new Date(diagram.expiryDate) < new Date()) {
        return res.status(403).json({ error: "This share link has expired" });
      }

      const providedToken = (req.headers['x-share-token'] as string) || (req.query.token as string);
      if (diagram.shareToken && diagram.shareToken !== providedToken) {
        return res.status(401).json({ error: "Invalid access token", requiresToken: true });
      }
    }

    const diagramId = Number(diagram.id);

    const entities = await prisma.entity.findMany({
      where: { diagramId },
    });

    const relationships = await prisma.relationship.findMany({
      where: { diagramId },
    });

    const entitiesWithColumns = await Promise.all(
      entities.map(async (entity: any) => {
        const columns = await prisma!.column.findMany({
          where: { entityId: entity.id },
          orderBy: { sortOrder: 'asc' },
        });
        return { ...entity, columns: columns || [] };
      })
    );

    res.json({ ...diagram, entities: entitiesWithColumns, relationships });
  } catch (err: any) {
    handleError(res, err, "Failed to fetch public diagram");
  }
});

router.put("/:uid/share", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    if (!prisma) return res.status(500).json({ error: "Database connection not available" });

    const { uid } = req.params;
    const { is_public, share_token, expiry_date } = req.body;

    const currentDiagram = await prisma.diagram.findFirst({
      where: uidOrIdWhere(uid, (req as any).user.id),
    });

    if (!currentDiagram) return res.status(404).json({ error: "Diagram not found" });

    const updateData: any = {
      isPublic: is_public,
      shareToken: is_public ? share_token : null,
      expiryDate: is_public ? expiry_date : null,
    };

    if (is_public) {
      if (!currentDiagram.publishedAt) {
        updateData.publishedAt = new Date();
      }
    } else {
      updateData.publishedAt = null;
    }

    const data = await prisma.diagram.update({
      where: { id: currentDiagram.id },
      data: updateData,
    });

    res.json(data);
  } catch (err: any) {
    handleError(res, err, "Failed to update share settings");
  }
});

router.get("/:uid", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    if (!prisma) return res.status(500).json({ error: "Database connection not available" });

    const diagram = await prisma.diagram.findFirst({
      where: uidOrIdWhere(req.params.uid, (req as any).user.id),
    });

    if (!diagram) return res.status(404).json({ error: "Diagram not found" });

    console.log('[DEBUG] GET /:uid diagram:', { id: diagram.id, uid: diagram.uid, sourceType: diagram.sourceType, sourceConnectionId: diagram.sourceConnectionId, keys: Object.keys(diagram) });

    const diagramId = Number(diagram.id);

    // Production DB diagram: return data column (lightweight format)
    if ((diagram as any).data) {
      let parsedData: any = null;
      try {
        parsedData = typeof (diagram as any).data === 'string' 
          ? JSON.parse((diagram as any).data) 
          : (diagram as any).data;
      } catch (e) {
        parsedData = { nodes: {} };
      }
      return res.json({ 
        ...diagram, 
        data: parsedData, 
        entities: [], 
        relationships: [] 
      });
    }

    const entities = await prisma.entity.findMany({
      where: { diagramId },
    });

    const relationships = await prisma.relationship.findMany({
      where: { diagramId },
    });

    const entitiesWithColumns = await Promise.all(
      entities.map(async (entity: any) => {
        const columns = await prisma!.column.findMany({
          where: { entityId: entity.id },
          orderBy: { sortOrder: 'asc' },
        });
        return { ...entity, columns: columns || [] };
      })
    );

    res.json({ ...diagram, entities: entitiesWithColumns, relationships });
  } catch (err: any) {
    handleError(res, err, "Failed to fetch diagram");
  }
});

router.delete("/:uid", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    if (!prisma) return res.status(500).json({ error: "Database connection not available" });

    const diagram = await prisma.diagram.findFirst({
      where: uidOrIdWhere(req.params.uid, (req as any).user.id),
    });

    if (!diagram) return res.status(404).json({ error: "Diagram not found" });

    const safeUpdate = getSafeUpdate(true);
    await prisma.diagram.update({
      where: { id: diagram.id },
      data: {
        ...(safeUpdate.is_deleted !== undefined && { isDeleted: safeUpdate.is_deleted }),
        ...(safeUpdate.deleted_at !== undefined && { deletedAt: safeUpdate.deleted_at }),
      },
    });

    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to delete diagram");
  }
});

router.post("/:uid/restore", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    if (!prisma) return res.status(500).json({ error: "Database connection not available" });

    const diagram = await prisma.diagram.findFirst({
      where: uidOrIdWhere(req.params.uid, (req as any).user.id),
    });

    if (!diagram) return res.status(404).json({ error: "Diagram not found" });

    const safeUpdate = getSafeUpdate(false);
    await prisma.diagram.update({
      where: { id: diagram.id },
      data: {
        ...(safeUpdate.is_deleted !== undefined && { isDeleted: safeUpdate.is_deleted }),
        ...(safeUpdate.deleted_at !== undefined && { deletedAt: safeUpdate.deleted_at }),
      },
    });

    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to restore diagram");
  }
});

router.delete("/:uid/permanent", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    if (!prisma) return res.status(500).json({ error: "Database connection not available" });

    const diagram = await prisma.diagram.findFirst({
      where: uidOrIdWhere(req.params.uid, (req as any).user.id),
    });

    if (!diagram) return res.status(404).json({ error: "Diagram not found" });

    await prisma.diagram.delete({
      where: { id: diagram.id },
    });

    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to permanently delete diagram");
  }
});

router.put("/:uid", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    if (!prisma) return res.status(500).json({ error: "Database connection not available" });

    const { name } = req.body;
    const diagram = await prisma.diagram.findFirst({
      where: uidOrIdWhere(req.params.uid, (req as any).user.id),
    });

    if (!diagram) return res.status(404).json({ error: "Diagram not found" });

    await prisma.diagram.update({
      where: { id: diagram.id },
      data: { name },
    });

    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to update diagram");
  }
});

router.put("/:uid/project", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    if (!prisma) return res.status(500).json({ error: "Database connection not available" });

    const { project_id } = req.body;
    const diagram = await prisma.diagram.findFirst({
      where: uidOrIdWhere(req.params.uid, (req as any).user.id),
    });

    if (!diagram) return res.status(404).json({ error: "Diagram not found" });

    const resolvedProjectId = await resolveOwnedProjectId(prisma, (req as any).user.id, project_id);
    await prisma.diagram.update({
      where: { id: diagram.id },
      data: { projectId: resolvedProjectId },
    });

    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to update diagram project");
  }
});

async function upsertEntities(rows: any[], diagramId: number) {
  if (rows.length === 0 || !prisma) return;
  await prisma.$transaction(
    rows.map(e =>
      prisma!.entity.upsert({
        where: { id: e.id },
        create: {
          id: e.id,
          diagramId,
          name: e.name,
          x: e.x,
          y: e.y,
          color: e.color || '#6366f1',
        },
        update: {
          name: e.name,
          x: e.x,
          y: e.y,
          color: e.color || '#6366f1',
        },
      })
    )
  );
}

async function upsertColumns(rows: any[]) {
  if (rows.length === 0 || !prisma) return;
  await prisma.$transaction(
    rows.map(col =>
      prisma!.column.upsert({
        where: { id: col.id },
        create: {
          id: col.id,
          entityId: col._entity_id,
          name: col.name,
          type: col.type,
          isPk: col.is_pk || false,
          isNullable: col.is_nullable !== undefined ? col.is_nullable : true,
          enumValues: col.enum_values || null,
          sortOrder: col.sort_order || 0,
        },
        update: {
          entityId: col._entity_id,
          name: col.name,
          type: col.type,
          isPk: col.is_pk || false,
          isNullable: col.is_nullable !== undefined ? col.is_nullable : true,
          enumValues: col.enum_values || null,
          sortOrder: col.sort_order || 0,
        },
      })
    )
  );
}

async function upsertRelationships(rows: any[], diagramId: number) {
  if (rows.length === 0 || !prisma) return;
  await prisma.$transaction(
    rows.map(r =>
      prisma!.relationship.upsert({
        where: { id: r.id },
        create: {
          id: r.id,
          diagramId,
          sourceEntityId: r.source_entity_id,
          targetEntityId: r.target_entity_id,
          sourceColumnId: r.source_column_id || null,
          targetColumnId: r.target_column_id || null,
          sourceHandle: r.source_handle || null,
          targetHandle: r.target_handle || null,
          type: r.type || 'one-to-many',
          label: r.label || null,
        },
        update: {
          diagramId,
          sourceEntityId: r.source_entity_id,
          targetEntityId: r.target_entity_id,
          sourceColumnId: r.source_column_id || null,
          targetColumnId: r.target_column_id || null,
          sourceHandle: r.source_handle || null,
          targetHandle: r.target_handle || null,
          type: r.type || 'one-to-many',
          label: r.label || null,
        },
      })
    )
  );
}

router.post("/save/:uid", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const identifier = req.params.uid;
  const { entities, relationships, viewport, expectedVersion, data } = req.body;

  const dedupe = <T extends { id: any }>(arr: T[], label: string): T[] => {
    const seen = new Set();
    const result: T[] = [];
    for (const item of arr) {
      if (seen.has(item.id)) {
        logger.warn(`[Save Warning] Duplicate ${label} id=${item.id} removed`);
        continue;
      }
      seen.add(item.id);
      result.push(item);
    }
    return result;
  };
  const dedupedEntities: any[] = dedupe(entities || [], 'entity');
  const dedupedRelationships: any[] = dedupe(relationships || [], 'relationship');

  try {
    if (!prisma) return res.status(500).json({ error: "Database connection not available" });

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

    let diagramWhere: any = { userId: (req as any).user.id };
    if (isUuid) {
      diagramWhere.uid = identifier;
    } else if (!isNaN(Number(identifier))) {
      diagramWhere.id = Number(identifier);
    } else {
      return res.status(400).json({ error: "Invalid identifier format" });
    }

    const currentDiagram = await prisma.diagram.findFirst({
      where: diagramWhere,
      select: { id: true, uid: true, version: true, updatedAt: true, name: true, data: true, sourceType: true },
    });

    if (!currentDiagram) {
      return res.status(404).json({ error: "Diagram not found" });
    }

    const diagramId = Number(currentDiagram.id);

    const effectiveUid = isUuid ? identifier : null;
    if (!effectiveUid && !currentDiagram.uid) {
      const backfillUid = crypto.randomUUID();
      await prisma.diagram.update({
        where: { id: diagramId },
        data: { uid: backfillUid },
      });
      currentDiagram.uid = backfillUid;
    }

    if (expectedVersion !== undefined && expectedVersion !== null) {
      if (currentDiagram.version !== expectedVersion) {
        logger.warn(`[Race Condition] Version mismatch for diagram ${identifier}. Expected: ${expectedVersion}, Current: ${currentDiagram.version}`);
        return res.status(409).json({
          error: "Conflict: Diagram was modified. Please refresh and try again.",
          currentVersion: currentDiagram.version,
          retryable: true,
        });
      }
    }

    // ── Production DB diagrams: skip entity/relationship CRUD, preserve _type + source ──
    const isProductionDbSave = currentDiagram.sourceType === 'production_db' ||
      (data !== undefined && typeof data === 'object' && (data as any)?._type === 'production_db_positions');

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
    const newEntityIds = new Set(entities.map((e: any) => e.id));
    const entitiesToDelete = Array.from(existingEntityIds).filter(id => !newEntityIds.has(id));
    let colsToDelete: string[] = [];

    if (dedupedEntities.length > 0) {
      await upsertEntities(dedupedEntities, diagramId);

      const allColumns: any[] = [];
      const newColIds = new Set();
      const seenColIds = new Set();
      for (const entity of dedupedEntities) {
        for (const col of entity.columns || []) {
          if (seenColIds.has(col.id)) {
            logger.warn(`[Save Warning] Duplicate column id=${col.id} across entities removed`);
            continue;
          }
          seenColIds.add(col.id);
          allColumns.push({ ...col, _entity_id: entity.id });
          newColIds.add(col.id);
        }
      }

      if (allColumns.length > 0) {
        await upsertColumns(allColumns);
      }

      const keptEntityIds = Array.from(existingEntityIds).filter(id => newEntityIds.has(id));
      if (keptEntityIds.length > 0) {
        const existingColumns = await prisma.column.findMany({
          where: { entityId: { in: keptEntityIds } },
          select: { id: true },
        });

        const existingColIds = new Set(existingColumns.map((c: any) => c.id));
        colsToDelete = Array.from(existingColIds).filter(id => !newColIds.has(id)) as string[];
      }
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

    if (typeof colsToDelete !== 'undefined' && colsToDelete.length > 0) {
      await prisma.column.deleteMany({
        where: { id: { in: colsToDelete } },
      });
    }

    if (entitiesToDelete.length > 0) {
      await prisma.column.deleteMany({
        where: { entityId: { in: entitiesToDelete } },
      });

      await prisma.entity.deleteMany({
        where: { id: { in: entitiesToDelete } },
      });
    }

    }

    // ── Merge missing _type + source into incoming data for production DB diagrams ──
    let mergedData = data;
    if (isProductionDbSave && data !== undefined) {
      const incomingData = typeof data === 'string' ? JSON.parse(data) : { ...data };
      const existingParsed = currentDiagram.data
        ? (typeof currentDiagram.data === 'string' ? JSON.parse(currentDiagram.data) : currentDiagram.data)
        : {};
      if (!incomingData._type && existingParsed._type) incomingData._type = existingParsed._type;
      if (!incomingData.source && existingParsed.source) incomingData.source = existingParsed.source;
      mergedData = incomingData;
    }

    const updatedDiagram = await prisma.diagram.update({
      where: { id: diagramId },
      data: {
        updatedAt: new Date(),
        viewportX: viewport?.x || 0,
        viewportY: viewport?.y || 0,
        viewportZoom: viewport?.zoom || 1.0,
        ...(mergedData !== undefined && { data: typeof mergedData === 'string' ? mergedData : JSON.stringify(mergedData) }),
      },
      select: { version: true },
    });

    const userId = (req as any).user.id;
    const lastAudit = await prisma.entityChange.findFirst({
      where: { entityType: 'diagrams', entityId: String(diagramId) },
      orderBy: { createdAt: 'desc' },
    });

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const shouldAudit = !lastAudit || (lastAudit.createdAt && new Date(lastAudit.createdAt) < fiveMinutesAgo);

    if (shouldAudit) {
      await prisma.entityChange.create({
        data: {
          entityType: 'diagrams',
          entityId: String(diagramId),
          version: updatedDiagram?.version ?? (currentDiagram.version ?? 0) + 1,
          userId,
          changes: JSON.stringify({
            entities,
            relationships,
            viewport,
            name: currentDiagram.name,
          }),
          changeType: 'update',
        },
      });
    }

    res.json({
      success: true,
      version: updatedDiagram?.version ?? (currentDiagram.version ?? 0) + 1,
    });
  } catch (err: any) {
    logger.error({ err, uid: identifier }, `Save Error`);
    res.status(500).json({ error: "Failed to save diagram" });
  }
});

// ── POST /api/diagrams/fetch-schema — fetch live schema from external DB (no system DB storage)
router.post("/fetch-schema", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  if (!isDesktopMode()) {
    return res.status(404).json({ error: "Not available" });
  }

  const { type, host, port, user, password, password_encrypted, database } = req.body as Partial<ConnectionInfo> & { password_encrypted?: string };

  if (!type || !database) {
    return res.status(400).json({ error: "type and database are required" });
  }

  let finalPassword = password;
  if (!finalPassword && password_encrypted) {
    try {
      finalPassword = decrypt(password_encrypted);
    } catch (e) {
      console.error("Failed to decrypt password:", e);
    }
  }

  try {
    const connInfo: ConnectionInfo = {
      type: type as "postgresql" | "mysql" | "sqlite",
      host: host || undefined,
      port: port || undefined,
      user: user || undefined,
      password: finalPassword || undefined,
      database,
    };

    const tables = await fetchSchema(connInfo);

    res.json({ schema: tables });
  } catch (err: any) {
    logger.error({ err }, "Fetch schema error");
    res.status(500).json({ error: `Failed to fetch schema: ${err.message}` });
  }
});

// ── POST /api/diagrams/test-db-connection — test external DB connection
router.post("/test-db-connection", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  if (!isDesktopMode()) {
    return res.status(404).json({ error: "Not available" });
  }

  const { type, host, port, user, password, database } = req.body as Partial<ConnectionInfo>;

  if (!type || !database) {
    return res.status(400).json({ error: "type and database are required" });
  }

  try {
    const connInfo: ConnectionInfo = {
      type: type as "postgresql" | "mysql" | "sqlite",
      host: host || undefined,
      port: port || undefined,
      user: user || undefined,
      password: password || undefined,
      database,
    };

    const result = await testConnection(connInfo);
    res.json({ success: true, message: result });
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
});

// ── POST /api/diagrams/create-from-db — create diagram from external DB (no import to system DB)
router.post("/create-from-db", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  if (!isDesktopMode()) {
    return res.status(404).json({ error: "Not available" });
  }

  if (!prisma) return res.status(500).json({ error: "Database connection not available" });

  const userId = (req as any).user.id;
  const { name, type, host, port, user, password, database } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ error: "Diagram name is required" });
  }
  if (!type || !database) {
    return res.status(400).json({ error: "type and database are required" });
  }

  try {
    // 1. Fetch live schema from external DB
    const connInfo: ConnectionInfo = {
      type: type as "postgresql" | "mysql" | "sqlite",
      host: host || undefined,
      port: port || undefined,
      user: user || undefined,
      password: password || undefined,
      database,
    };

    const tables = await fetchSchema(connInfo);

    // 2. Build positions (auto-layout)
    const entities = tables.map((t: any, i: number) => ({
      name: t.table_name,
      x: (i % 4) * 280 + 50,
      y: Math.floor(i / 4) * 200 + 50,
      color: "#4f46e5",
      columns: (t.columns || []).map((c: any) => ({
        name: c.name,
        type: c.type,
        is_pk: !!c.is_pk,
        is_nullable: !!c.is_nullable,
        sort_order: c.sort_order || 0,
        _is_fk: (t.foreign_keys || []).some((fk: any) => fk.column === c.name),
      })),
    }));

    // 3. Prepare data for diagram: positions + connection info (encrypted password)
    const positions: Record<string, any> = {};
    entities.forEach(e => {
      positions[e.name] = { x: e.x, y: e.y, color: e.color, collapsed: false, hidden_columns: [], note: "" };
    });

    // Encrypt password before storing
    const encryptedPassword = password ? encrypt(password) : undefined;

    const diagramData = {
      nodes: positions,
      viewport: { x: 0, y: 0, zoom: 1 },
      _type: "production_db_positions",
      source: {
        type,
        host: host || undefined,
        port: port || undefined,
        user: user || undefined,
        database,
        password_encrypted: encryptedPassword,
      },
    };

    // 4. Create diagram (no entities/relationships saved to system DB)
    const diagram = await prisma.diagram.create({
      data: {
        name: name.trim(),
        uid: crypto.randomUUID(),
        userId,
        sourceType: "production_db",
        data: JSON.stringify(diagramData),
      },
      select: { id: true, uid: true, name: true, data: true, sourceType: true, updatedAt: true },
    });

    // 5. Return diagram + schema for immediate rendering
    res.json({
      diagram,
      schema: tables,
    });
  } catch (err: any) {
    logger.error({ err }, "Create from DB error");
    res.status(500).json({ error: `Failed to create diagram: ${err.message}` });
  }
});

export default router;
