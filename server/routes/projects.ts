import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase, s3Client, R2_BUCKET_NAME } from "../lib/config.js";
import { authenticate } from "../lib/middleware.js";
import { handleError, getSafeUpdate } from "../lib/utils.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

const router = Router();

router.get("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const offset = parseInt(req.query.offset as string) || 0;
  const q = req.query.q as string;

  let query = supabase
    .from("projects")
    .select("*", { count: 'exact' })
    .eq("is_deleted", false);

  if (q && q.trim()) {
    query = query.ilike("name", `%${q.trim()}%`);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return handleError(res, error, "Supabase error fetching projects");
  
  // Safety slice to ensure we don't exceed the limit
  const slicedData = (data || []).slice(0, limit);
  
  res.json({ 
    data: slicedData, 
    total: count
  });
});

router.post("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { name } = req.body;
  const { data, error } = await supabase
    .from("projects")
    .insert([{ name }])
    .select()
    .single();

  if (error) return handleError(res, error, "Failed to create project");
  res.json(data);
});

router.put("/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { name } = req.body;
  const { error } = await supabase
    .from("projects")
    .update({ name })
    .eq("id", req.params.id);

  if (error) return handleError(res, error, "Failed to update project");
  res.json({ success: true });
});

router.delete("/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const projectId = req.params.id;
  const update = getSafeUpdate(true);
  
  const { error } = await supabase
    .from("projects")
    .update(update)
    .eq("id", projectId);

  if (error) return handleError(res, error, "Failed to delete project");

  // Cascading soft delete
  try {
    await Promise.all([
      supabase.from("diagrams").update(update).eq("project_id", projectId),
      supabase.from("notes").update(update).eq("project_id", projectId),
      supabase.from("drawings").update(update).eq("project_id", projectId),
      supabase.from("flowcharts").update(update).eq("project_id", projectId),
    ]);
  } catch (err) {
    console.error("Cascading soft delete failed:", err);
  }

  res.json({ success: true });
});

router.post("/:id/restore", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const projectId = req.params.id;
  const update = getSafeUpdate(false);

  const { error } = await supabase
    .from("projects")
    .update(update)
    .eq("id", projectId);

  if (error) return handleError(res, error, "Failed to restore project");

  // Cascading restore
  try {
    await Promise.all([
      supabase.from("diagrams").update(update).eq("project_id", projectId),
      supabase.from("notes").update(update).eq("project_id", projectId),
      supabase.from("drawings").update(update).eq("project_id", projectId),
      supabase.from("flowcharts").update(update).eq("project_id", projectId),
    ]);
  } catch (err) {
    console.error("Cascading restore failed:", err);
  }

  res.json({ success: true });
});

router.delete("/:id/permanent", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const projectId = req.params.id;
  
  try {
    const { data: diagrams } = await supabase.from("diagrams").select("id").eq("project_id", projectId);
    const diagramIds = diagrams?.map(f => f.id) || [];

    if (diagramIds.length > 0) {
      await supabase.from("relationships").delete().in("file_id", diagramIds);
      const { data: entities } = await supabase.from("entities").select("id").in("file_id", diagramIds);
      const entityIds = entities?.map(e => e.id) || [];
      if (entityIds.length > 0) {
        await supabase.from("columns").delete().in("entity_id", entityIds);
      }
      await supabase.from("entities").delete().in("file_id", diagramIds);
      await supabase.from("diagrams").delete().in("id", diagramIds);
    }
    
    // Delete images from notes before deleting notes
    const { data: notes } = await supabase.from("notes").select("content").eq("project_id", projectId);
    if (notes && notes.length > 0 && s3Client && R2_BUCKET_NAME) {
      for (const note of notes) {
        if (note.content) {
          const regex = /<img[^>]+src="([^">]+)"/g;
          let match;
          while ((match = regex.exec(note.content)) !== null) {
            const url = match[1];
            if (url.includes('erd-builder-pro/')) {
              const key = url.substring(url.indexOf('erd-builder-pro/'));
              try {
                await s3Client.send(new DeleteObjectCommand({
                  Bucket: R2_BUCKET_NAME,
                  Key: key,
                }));
              } catch (err) {
                console.error("Failed to delete image from R2 during project deletion:", err);
              }
            }
          }
        }
      }
    }

    await supabase.from("notes").delete().eq("project_id", projectId);
    await supabase.from("drawings").delete().eq("project_id", projectId);
    await supabase.from("projects").delete().eq("id", projectId);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
