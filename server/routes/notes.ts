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
  const isPublic = req.query.is_public === 'true' ? true : req.query.is_public === 'false' ? false : null;

  let query = supabase
    .from("notes")
    .select("*, projects!left(*)", { count: 'exact' })
    .eq("is_deleted", false);

  if (isPublic !== null) {
    query = query.eq("is_public", isPublic);
  }
 
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

router.get("/public/:uid", async (req: ExpressRequest, res: ExpressResponse) => {
  const { data: note, error } = await supabase
    .from("notes")
    .select("*, projects!left(name)")
    .eq("uid", req.params.uid)
    .single();

  if (error || !note) return res.status(404).json({ error: "Note not found" });

  // Security Check: Is it public?
  if (!note.is_public) {
    return res.status(403).json({ error: "This document is private" });
  }

  // Owner Bypass: For single-account, any logged-in user is the owner
  let isOwner = false;
  const sessionToken = req.cookies.token;
  if (sessionToken) {
    const { data: { user } } = await supabase.auth.getUser(sessionToken);
    if (user) {
      isOwner = true;
      console.log(`[Bypass Check] Bypass GRANTED for authenticated user (Single Account Mode)`);
    }
  }

  if (!isOwner) {
    // Security Check: Is it expired?
    if (note.expiry_date && new Date(note.expiry_date) < new Date()) {
      return res.status(403).json({ error: "This share link has expired" });
    }

    // Security Check: Token matching (if required)
    const providedToken = (req.headers['x-share-token'] as string) || (req.query.token as string);
    if (note.share_token && note.share_token !== providedToken) {
      return res.status(401).json({ error: "Invalid access token", requiresToken: true });
    }
  }

  res.json(note);
});

router.put("/:id/share", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { id } = req.params;
  const { is_public, share_token, expiry_date } = req.body;

  try {
    const { data: currentNote } = await supabase
      .from("notes")
      .select("is_public, published_at")
      .eq("id", id)
      .single();

    if (!currentNote) return res.status(404).json({ error: "Note not found" });

    let updateData: any = {
      is_public,
      share_token: is_public ? share_token : null,
      expiry_date: is_public ? expiry_date : null,
    };

    if (is_public) {
      if (!currentNote.published_at) {
        updateData.published_at = new Date().toISOString();
      }
    } else {
      updateData.published_at = null;
    }

    const { data, error } = await supabase
      .from("notes")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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
