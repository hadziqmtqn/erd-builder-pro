import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase, s3Client, R2_BUCKET_NAME } from "../lib/config";
import { authenticate } from "../lib/middleware";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

const router = Router();

router.get("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("is_deleted", false)
    .order("name", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { name } = req.body;
  const { data, error } = await supabase
    .from("projects")
    .insert([{ name }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put("/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { name } = req.body;
  const { error } = await supabase
    .from("projects")
    .update({ name })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.delete("/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("projects")
    .update({ is_deleted: true })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.post("/:id/restore", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("projects")
    .update({ is_deleted: false })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.delete("/:id/permanent", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const projectId = req.params.id;
  
  try {
    const { data: files } = await supabase.from("files").select("id").eq("project_id", projectId);
    const fileIds = files?.map(f => f.id) || [];

    if (fileIds.length > 0) {
      await supabase.from("relationships").delete().in("file_id", fileIds);
      const { data: entities } = await supabase.from("entities").select("id").in("file_id", fileIds);
      const entityIds = entities?.map(e => e.id) || [];
      if (entityIds.length > 0) {
        await supabase.from("columns").delete().in("entity_id", entityIds);
      }
      await supabase.from("entities").delete().in("file_id", fileIds);
      await supabase.from("files").delete().in("id", fileIds);
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
