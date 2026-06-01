import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase } from "../lib/config.js";
import { authenticate } from "../lib/middleware.js";
import { validate, createDiagramSchema, renameSchema } from "../lib/validation.js";
import { handleError, getSafeUpdate } from "../lib/utils.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.get("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const offset = parseInt(req.query.offset as string) || 0;
  const projectId = req.query.project_id as string;
  const q = req.query.q as string;
  const isPublic = req.query.is_public === 'true' ? true : req.query.is_public === 'false' ? false : null;

  let query = supabase
    .from("diagrams")
    .select("*, projects!left(*)", { count: 'exact' })
    .eq("is_deleted", false)
    .eq("user_id", (req as any).user.id);

  if (isPublic !== null) {
    query = query.eq("is_public", isPublic);
  }

  if (q && q.trim()) {
    query = query.ilike("name", `%${q.trim()}%`);
  }

  if (projectId === "null") {
    query = query.is("project_id", null);
  } else if (projectId && projectId !== "all" && !isNaN(parseInt(projectId))) {
    query = query.eq("project_id", parseInt(projectId));
  }

  const { data: deletedProjects } = await supabase.from("projects").select("id").eq("is_deleted", true);
  const deletedIds = deletedProjects?.map((p: any) => p.id) || [];
  
  if (deletedIds.length > 0) {
    query = query.or(`project_id.is.null,project_id.not.in.(${deletedIds.join(",")})`);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return handleError(res, error, "Supabase error fetching diagrams");
  
  res.json({ 
    data: data || [], 
    total: count || 0
  });
});

router.post("/", authenticate, validate(createDiagramSchema), async (req: ExpressRequest, res: ExpressResponse) => {
  const { name, project_id, uid } = req.body;
  const { data, error } = await supabase
    .from("diagrams")
    .insert([{ name, project_id: project_id || null, uid: uid || undefined, user_id: (req as any).user.id }])
    .select()
    .single();

  if (error) return handleError(res, error, "Failed to create diagram");
  res.json(data);
});

router.get("/public/:uid", async (req: ExpressRequest, res: ExpressResponse) => {
  const { data: diagram, error: diagramError } = await supabase
    .from("diagrams")
    .select("*, projects!left(name, is_deleted)")
    .eq("uid", req.params.uid)
    .single();

  if (diagramError || !diagram) return res.status(404).json({ error: "Diagram not found" });

  // Security Check: Is the project deleted?
  if (diagram.projects && diagram.projects.is_deleted) {
    return res.status(404).json({ error: "Diagram not found (associated project deleted)" });
  }

  // Security Check: Is the diagram itself deleted?
  if (diagram.is_deleted) {
    return res.status(404).json({ error: "Diagram not found" });
  }

  if (!diagram.is_public) {
    return res.status(403).json({ error: "This document is private" });
  }

  let isOwner = false;
  const sessionToken = req.cookies.token;
  if (sessionToken) {
    const { data: { user } } = await supabase.auth.getUser(sessionToken);
    if (user && user.id === diagram.user_id) {
      isOwner = true;
    }
  }

  if (!isOwner) {
    if (diagram.expiry_date && new Date(diagram.expiry_date) < new Date()) {
      return res.status(403).json({ error: "This share link has expired" });
    }

    const providedToken = (req.headers['x-share-token'] as string) || (req.query.token as string);
    if (diagram.share_token && diagram.share_token !== providedToken) {
      return res.status(401).json({ error: "Invalid access token", requiresToken: true });
    }
  }

  const diagramId = diagram.id;

  const { data: entities, error: entitiesError } = await supabase
    .from("entities")
    .select("*")
    .eq("diagram_id", diagramId);

  if (entitiesError) return res.status(500).json({ error: entitiesError.message });

  const { data: relationships, error: relError } = await supabase
    .from("relationships")
    .select("*")
    .eq("diagram_id", diagramId);

  if (relError) return res.status(500).json({ error: relError.message });

  const entitiesWithColumns = await Promise.all(entities.map(async (entity: any) => {
    const { data: columns } = await supabase
      .from("columns")
      .select("*")
      .eq("entity_id", entity.id)
      .order("sort_order", { ascending: true });
    return { ...entity, columns: columns || [] };
  }));

  res.json({ ...diagram, entities: entitiesWithColumns, relationships });
});

router.put("/:uid/share", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { uid } = req.params;
  const { is_public, share_token, expiry_date } = req.body;

  try {
    const { data: currentDiagram } = await supabase
      .from("diagrams")
      .select("*")
      .eq("uid", uid)
      .single();

    if (!currentDiagram) return res.status(404).json({ error: "Diagram not found" });

    let updateData: any = {
      is_public,
      share_token: is_public ? share_token : null,
      expiry_date: is_public ? expiry_date : null,
    };

    if (is_public) {
      if (!currentDiagram.published_at) {
        updateData.published_at = new Date().toISOString();
      }
    } else {
      updateData.published_at = null;
    }

    const { data, error } = await supabase
      .from("diagrams")
      .update(updateData)
      .eq("uid", uid)
      .eq("user_id", (req as any).user.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:uid", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const identifier = req.params.uid;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
  
  let query = supabase
    .from("diagrams")
    .select("*")
    .eq("user_id", (req as any).user.id);

  if (isUuid) {
    query = query.eq("uid", identifier);
  } else if (!isNaN(Number(identifier))) {
    query = query.eq("id", identifier);
  } else {
    return res.status(400).json({ error: "Invalid identifier format" });
  }

  const { data: diagram, error: diagramError } = await query.single();

  if (diagramError || !diagram) return res.status(404).json({ error: "Diagram not found" });

  const diagramId = diagram.id;

  const { data: entities, error: entitiesError } = await supabase
    .from("entities")
    .select("*")
    .eq("diagram_id", diagramId);

  if (entitiesError) return res.status(500).json({ error: entitiesError.message });

  const { data: relationships, error: relError } = await supabase
    .from("relationships")
    .select("*")
    .eq("diagram_id", diagramId);

  if (relError) return res.status(500).json({ error: relError.message });

  const entitiesWithColumns = await Promise.all(entities.map(async (entity: any) => {
    const { data: columns } = await supabase
      .from("columns")
      .select("*")
      .eq("entity_id", entity.id)
      .order("sort_order", { ascending: true });
    return { ...entity, columns: columns || [] };
  }));

  res.json({ ...diagram, entities: entitiesWithColumns, relationships });
});

router.delete("/:uid", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("diagrams")
    .update(getSafeUpdate(true))
    .eq("uid", req.params.uid)
    .eq("user_id", (req as any).user.id);

  if (error) return handleError(res, error, "Failed to delete diagram");
  res.json({ success: true });
});

router.post("/:uid/restore", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("diagrams")
    .update(getSafeUpdate(false))
    .eq("uid", req.params.uid)
    .eq("user_id", (req as any).user.id);

  if (error) return handleError(res, error, "Failed to restore diagram");
  res.json({ success: true });
});

router.delete("/:uid/permanent", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("diagrams")
    .delete()
    .eq("uid", req.params.uid)
    .eq("user_id", (req as any).user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.put("/:uid", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { name } = req.body;
  const { error } = await supabase
    .from("diagrams")
    .update({ name })
    .eq("uid", req.params.uid)
    .eq("user_id", (req as any).user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.put("/:uid/project", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { project_id } = req.body;
  const { error } = await supabase
    .from("diagrams")
    .update({ project_id: project_id || null })
    .eq("uid", req.params.uid)
    .eq("user_id", (req as any).user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.post("/save/:uid", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const identifier = req.params.uid;
  const { entities, relationships, viewport, expectedVersion } = req.body;

  // Deduplicate incoming arrays by id to prevent "ON CONFLICT DO UPDATE command cannot affect row a second time"
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

  // Batch upsert with individual fallback: try batch first, retry one-by-one on conflict
  async function upsertSafe(table: string, rows: any[], toRow: (item: any) => any) {
    if (rows.length === 0) return;
    
    const { error } = await supabase.from(table).upsert(rows.map(toRow), { onConflict: 'id' });
    if (!error) return;
    
    if (error.message?.includes('cannot affect row a second time')) {
      logger.warn(`[Save] Batch upsert for ${table} failed with conflict — falling back to individual upserts`);
      for (const item of rows) {
        const { error: singleErr } = await supabase.from(table).upsert(toRow(item), { onConflict: 'id' });
        if (singleErr) throw singleErr;
      }
    } else {
      throw error;
    }
  }

  try {
    // ✅ STEP 1: Fetch current diagram state with version check
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
    
    let query = supabase
      .from("diagrams")
      .select("id, uid, _version, updated_at")
      .eq("user_id", (req as any).user.id);

    if (isUuid) {
      query = query.eq("uid", identifier);
    } else if (!isNaN(Number(identifier))) {
      query = query.eq("id", identifier);
    } else {
      return res.status(400).json({ error: "Invalid identifier format" });
    }

    const { data: currentDiagram, error: fetchError } = await query.single();

    if (fetchError || !currentDiagram) {
      return res.status(404).json({ error: "Diagram not found" });
    }

    const diagramId = currentDiagram.id;

    // ✅ STEP 1b: Backfill uid if null (diagram was created before uid column had a default)
    const effectiveUid = isUuid ? identifier : null;
    if (!effectiveUid && !currentDiagram.uid) {
      const backfillUid = crypto.randomUUID();
      await supabase.from("diagrams").update({ uid: backfillUid }).eq("id", diagramId);
      currentDiagram.uid = backfillUid;
    }

    // ✅ STEP 2: Optimistic locking - reject if version mismatch
    if (expectedVersion !== undefined && expectedVersion !== null) {
      if (currentDiagram._version !== expectedVersion) {
        logger.warn(`[Race Condition] Version mismatch for diagram ${identifier}. Expected: ${expectedVersion}, Current: ${currentDiagram._version}`);
        return res.status(409).json({ 
          error: "Conflict: Diagram was modified. Please refresh and try again.",
          currentVersion: currentDiagram._version,
          retryable: true
        });
      }
    }

    // ✅ STEP 3: Get existing relationships for comparison (to detect true changes)
    const { data: existingRelationships } = await supabase
      .from("relationships")
      .select("id")
      .eq("diagram_id", diagramId);
    
    const existingRelIds = new Set(existingRelationships?.map((r: any) => r.id) || []);
    const newRelIds = new Set(dedupedRelationships.map((r: any) => r.id));

    // We will collect IDs for Deletion, but execute the Deletes AFTER Upserts succeed.
    // This prevents data loss if Upserts fail due to schema mismatch.
    
    // (A) Collect IDs for Deletion
    const { data: existingEntities } = await supabase
      .from("entities")
      .select("id")
      .eq("diagram_id", diagramId);
    
    const existingEntityIds = new Set(existingEntities?.map((e: any) => e.id) || []);
    const newEntityIds = new Set(entities.map((e: any) => e.id));
    const entitiesToDelete = Array.from(existingEntityIds).filter(id => !newEntityIds.has(id));
    let colsToDelete: string[] = [];

    // ✅ STEP 6: Upsert entities (batch, fallback to individual on conflict)
    if (dedupedEntities.length > 0) {
      await upsertSafe('entities', dedupedEntities, (e: any) => ({
        id: e.id,
        diagram_id: diagramId,
        name: e.name,
        x: e.x,
        y: e.y,
        color: e.color || '#6366f1'
      }));

      // ✅ STEP 7: Upsert columns (batch, fallback to individual on conflict)
      // Deduplicate column IDs across all entities first
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
        await upsertSafe('columns', allColumns, (col: any) => ({
          id: col.id,
          entity_id: col._entity_id,
          name: col.name,
          type: col.type,
          is_pk: col.is_pk || false,
          is_nullable: col.is_nullable !== undefined ? col.is_nullable : true,
          enum_values: col.enum_values || null,
          sort_order: col.sort_order || 0
        }));
      }

      // Collect columns to delete (executed later)
      const keptEntityIds = Array.from(existingEntityIds).filter(id => newEntityIds.has(id));
      if (keptEntityIds.length > 0) {
        const { data: existingColumns } = await supabase
          .from("columns")
          .select("id")
          .in("entity_id", keptEntityIds);
          
        const existingColIds = new Set(existingColumns?.map((c: any) => c.id) || []);
        colsToDelete = Array.from(existingColIds).filter(id => !newColIds.has(id)) as string[];
      }
    }

    // ✅ STEP 6b: Upsert relationships (batch, fallback to individual on conflict)
    if (dedupedRelationships.length > 0) {
      await upsertSafe('relationships', dedupedRelationships, (r: any) => ({
        id: r.id,
        diagram_id: diagramId,
        source_entity_id: r.source_entity_id,
        target_entity_id: r.target_entity_id,
        source_column_id: r.source_column_id || null,
        target_column_id: r.target_column_id || null,
        source_handle: r.source_handle || null,
        target_handle: r.target_handle || null,
        type: r.type || 'one-to-many',
        label: r.label || null
      }));
    }

    // ✅ STEP 7: Safe Deletion Phase (Only runs if ALL Upserts succeeded)
    
    // 7.1 Delete removed relationships
    const relsToDelete = Array.from(existingRelIds).filter(id => !newRelIds.has(id));
    if (relsToDelete.length > 0) {
      const { error: delRelError } = await supabase
        .from("relationships")
        .delete()
        .in("id", relsToDelete);
      if (delRelError) throw delRelError;
    }

    // 7.2 Delete removed columns from kept entities
    if (typeof colsToDelete !== 'undefined' && colsToDelete.length > 0) {
      const { error: delColError } = await supabase
        .from("columns")
        .delete()
        .in("id", colsToDelete);
      if (delColError) throw delColError;
    }

    // 7.3 Delete removed entities (and their columns due to CASCADE / manual delete)
    if (entitiesToDelete.length > 0) {
      // Delete columns first to satisfy FK if cascade isn't reliable
      const { error: delColError2 } = await supabase
        .from("columns")
        .delete()
        .in("entity_id", entitiesToDelete);
      if (delColError2) throw delColError2;

      // Delete the entities
      const { error: delEntError } = await supabase
        .from("entities")
        .delete()
        .in("id", entitiesToDelete);
      if (delEntError) throw delEntError;
    }

    // ✅ STEP 9: Update diagram metadata
    const { data: updatedDiagram, error: updateError } = await supabase
      .from("diagrams")
      .update({ 
        updated_at: new Date().toISOString(),
        viewport_x: viewport?.x || 0,
        viewport_y: viewport?.y || 0,
        viewport_zoom: viewport?.zoom || 1.0
      })
      .eq("id", diagramId)
      .select("_version")
      .single();

    if (updateError) throw updateError;

    // ✅ STEP 10: Create a Composite Snapshot (Throttled 5 min)
    // Since diagrams have complex relations, we store the full state (entities + rels) in entity_changes
    const userId = (req as any).user.id;
    const { data: lastAudit } = await supabase
      .from("entity_changes")
      .select("created_at")
      .eq("entity_type", "diagrams")
      .eq("entity_id", diagramId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const shouldAudit = !lastAudit || new Date(lastAudit.created_at) < fiveMinutesAgo;

    if (shouldAudit) {
      await supabase.from("entity_changes").insert({
        entity_type: "diagrams",
        entity_id: diagramId,
        version: updatedDiagram?._version || currentDiagram._version + 1,
        user_id: userId,
        changes: {
          entities,
          relationships,
          viewport,
          name: currentDiagram.name, // Capture name at snapshot time
        },
        change_type: 'update'
      });
    }

    // ✅ STEP 11: Return new version for next save
    res.json({ 
      success: true,
      version: updatedDiagram?._version || currentDiagram._version + 1
    });
  } catch (err: any) {
    logger.error({ err, uid: identifier }, `Save Error`);
    res.status(500).json({ error: err.message });
  }
});

export default router;
