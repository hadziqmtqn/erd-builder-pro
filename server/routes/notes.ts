import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase, s3Client, R2_BUCKET_NAME } from "../lib/config.js";
import { authenticate } from "../lib/middleware.js";
import { handleError, getSafeUpdate } from "../lib/utils.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

const router = Router();

router.get("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const offset = parseInt(req.query.offset as string) || 0;
  const projectId = req.query.project_id as string;
  const q = req.query.q as string;

  let query = supabase
    .from("notes")
    .select("*, projects!left(*)", { count: 'exact' })
    .eq("is_deleted", false);
 
  if (q && q.trim()) {
    query = query.ilike("title", `%${q.trim()}%`);
  }
 
  if (projectId === "null") {
    query = query.is("project_id", null);
  } else if (projectId && projectId !== "all" && !isNaN(parseInt(projectId))) {
    query = query.eq("project_id", parseInt(projectId));
  }
  // Otherwise (projectId === "all"), no project_id filter is applied for global view
 
  // Optimization: Filter out notes belonging to deleted projects at the database level
  const { data: deletedProjects } = await supabase.from("projects").select("id").eq("is_deleted", true);
  const deletedIds = deletedProjects?.map((p: any) => p.id) || [];
  
  if (deletedIds.length > 0) {
    query = query.not("project_id", "in", `(${deletedIds.join(",")})`);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return handleError(res, error, "Supabase error fetching notes");
  
  res.json({ 
    data: data || [], 
    total: count || 0
  });
});

router.post("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { title, content, project_id } = req.body;
  const { data, error } = await supabase
    .from("notes")
    .insert([{ title, content: content || "", project_id: project_id || null }])
    .select()
    .single();

  if (error) return handleError(res, error, "Failed to create note");
  res.json(data);
});

router.get("/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: "Note not found" });
  res.json(data);
});

router.get("/public/:uid", async (req: ExpressRequest, res: ExpressResponse) => {
  const { data, error } = await supabase
    .from("notes")
    .select("*, projects!left(name)")
    .eq("uid", req.params.uid)
    .single();

  if (error || !data) return res.status(404).json({ error: "Note not found" });
  res.json(data);
});

router.put("/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { title, content, project_id } = req.body;
  const { error } = await supabase
    .from("notes")
    .update({ title, content, project_id: project_id || null, updated_at: new Date().toISOString() })
    .eq("id", req.params.id);

  if (error) return handleError(res, error, "Failed to update note");
  res.json({ success: true });
});

router.delete("/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("notes")
    .update(getSafeUpdate(true))
    .eq("id", req.params.id);

  if (error) return handleError(res, error, "Failed to delete note");
  res.json({ success: true });
});

router.post("/:id/restore", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("notes")
    .update(getSafeUpdate(false))
    .eq("id", req.params.id);

  if (error) return handleError(res, error, "Failed to restore note");
  res.json({ success: true });
});

router.delete("/:id/permanent", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { data: note } = await supabase
      .from("notes")
      .select("content")
      .eq("id", req.params.id)
      .single();

    if (note && note.content && s3Client && R2_BUCKET_NAME) {
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
            console.error("Failed to delete image from R2 during note deletion:", err);
          }
        }
      }
    }

    const { error } = await supabase
      .from("notes")
      .delete()
      .eq("id", req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
