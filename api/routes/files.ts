import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase } from "../lib/config.js";
import { authenticate } from "../lib/middleware.js";

const router = Router();

router.get("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const offset = parseInt(req.query.offset as string) || 0;


  const { data, error, count } = await supabase
    .from("files")
    .select("*, projects!left(*)", { count: 'exact' })
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Supabase error fetching files:", error);
    return res.status(500).json({ data: [], total: 0, error: error.message });
  }
  
  const filesData = data || [];
  const filteredData = filesData.filter((file: any) => !file.projects || !file.projects.is_deleted);
  
  // Safety slice to ensure we don't exceed the limit after potential JS filtering
  const slicedData = filteredData.slice(0, limit);
  
  res.json({ 
    data: slicedData, 
    total: count || 0
  });
});

router.post("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { name, project_id } = req.body;
  const { data, error } = await supabase
    .from("files")
    .insert([{ name, project_id: project_id || null }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get("/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const fileId = req.params.id;
  const { data: file, error: fileError } = await supabase
    .from("files")
    .select("*")
    .eq("id", fileId)
    .single();

  if (fileError || !file) return res.status(404).json({ error: "File not found" });

  const { data: entities, error: entitiesError } = await supabase
    .from("entities")
    .select("*")
    .eq("file_id", fileId);

  if (entitiesError) return res.status(500).json({ error: entitiesError.message });

  const { data: relationships, error: relError } = await supabase
    .from("relationships")
    .select("*")
    .eq("file_id", fileId);

  if (relError) return res.status(500).json({ error: relError.message });

  const entitiesWithColumns = await Promise.all(entities.map(async (entity) => {
    const { data: columns } = await supabase
      .from("columns")
      .select("*")
      .eq("entity_id", entity.id);
    return { ...entity, columns: columns || [] };
  }));

  res.json({ ...file, entities: entitiesWithColumns, relationships });
});

router.delete("/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("files")
    .update({ is_deleted: true })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.post("/:id/restore", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("files")
    .update({ is_deleted: false })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.delete("/:id/permanent", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("files")
    .delete()
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.put("/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { name } = req.body;
  const { error } = await supabase
    .from("files")
    .update({ name })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.put("/:id/project", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { project_id } = req.body;
  const { error } = await supabase
    .from("files")
    .update({ project_id: project_id || null })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Save Diagram Route (Moved from root level in monolith)
router.post("/save/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const fileId = req.params.id;
  const { entities, relationships, viewport } = req.body;

  try {
    // Clear existing data for this file
    await supabase.from("relationships").delete().eq("file_id", fileId);
    
    const { data: existingEntities } = await supabase.from("entities").select("id").eq("file_id", fileId);
    const existingEntityIds = existingEntities?.map(e => e.id) || [];
    if (existingEntityIds.length > 0) {
      await supabase.from("columns").delete().in("entity_id", existingEntityIds);
    }
    await supabase.from("entities").delete().eq("file_id", fileId);

    // Insert entities
    if (entities.length > 0) {
      const entitiesToInsert = entities.map((e: any) => ({
        id: e.id,
        file_id: fileId,
        name: e.name,
        x: e.x,
        y: e.y,
        color: e.color || '#6366f1'
      }));
      await supabase.from("entities").insert(entitiesToInsert);

      // Insert columns
      const allColumns: any[] = [];
      for (const entity of entities) {
        for (const col of entity.columns) {
          allColumns.push({
            id: col.id,
            entity_id: entity.id,
            name: col.name,
            type: col.type,
            is_pk: col.is_pk || false,
            is_nullable: col.is_nullable !== undefined ? col.is_nullable : true,
            enum_values: col.enum_values || null
          });
        }
      }
      if (allColumns.length > 0) {
        await supabase.from("columns").insert(allColumns);
      }
    }

    // Insert relationships
    if (relationships.length > 0) {
      const relsToInsert = relationships.map((r: any) => ({
        id: r.id,
        file_id: fileId,
        source_entity_id: r.source_entity_id,
        target_entity_id: r.target_entity_id,
        source_column_id: r.source_column_id || null,
        target_column_id: r.target_column_id || null,
        type: r.type || 'one-to-many',
        label: r.label || null
      }));
      await supabase.from("relationships").insert(relsToInsert);
    }

    await supabase.from("files").update({ 
      updated_at: new Date().toISOString(),
      viewport_x: viewport?.x || 0,
      viewport_y: viewport?.y || 0,
      viewport_zoom: viewport?.zoom || 1.0
    }).eq("id", fileId);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
