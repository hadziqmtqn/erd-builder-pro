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
    .from("drawings")
    .select("*, projects!left(*)", { count: 'exact' })
    .eq("is_deleted", false)
    .eq("user_id", (req as any).user.id);

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

  // Optimization: Filter out drawings belonging to deleted projects at the database level
  const { data: deletedProjects } = await supabase.from("projects").select("id").eq("is_deleted", true);
  const deletedIds = deletedProjects?.map((p: any) => p.id) || [];
  
  if (deletedIds.length > 0) {
    query = query.not("project_id", "in", `(${deletedIds.join(",")})`);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return handleError(res, error, "Supabase error fetching drawings");
  
  res.json({ 
    data: data || [], 
    total: count || 0
  });
});

router.post("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { title, data, project_id } = req.body;
  const { data: inserted, error } = await supabase
    .from("drawings")
    .insert([{ title, data: data || "[]", project_id: project_id || null, user_id: (req as any).user.id }])
    .select()
    .single();

  if (error) return handleError(res, error, "Failed to create drawing");
  res.json(inserted);
});

router.get("/public/:uid", async (req: ExpressRequest, res: ExpressResponse) => {
  const { data: drawing, error } = await supabase
    .from("drawings")
    .select("*, projects!left(name)")
    .eq("uid", req.params.uid)
    .single();

  if (error || !drawing) return res.status(404).json({ error: "Drawing not found" });

  // Security Check: Is it public?
  if (!drawing.is_public) {
    return res.status(403).json({ error: "This document is private" });
  }

  // Owner Bypass: For single-account, any logged-in user is the owner
  let isOwner = false;
  const sessionToken = req.cookies.token;
  if (sessionToken) {
    const { data: { user } } = await supabase.auth.getUser(sessionToken);
    if (user) {
      isOwner = true;
    }
  }

  if (!isOwner) {
    // Security Check: Is it expired?
    if (drawing.expiry_date && new Date(drawing.expiry_date) < new Date()) {
      return res.status(403).json({ error: "This share link has expired" });
    }

    // Security Check: Token matching (if required)
    const providedToken = (req.headers['x-share-token'] as string) || (req.query.token as string);
    if (drawing.share_token && drawing.share_token !== providedToken) {
      return res.status(401).json({ error: "Invalid access token", requiresToken: true });
    }
  }

  res.json(drawing);
});

router.put("/:id/share", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { id } = req.params;
  const { is_public, share_token, expiry_date } = req.body;

  try {
    const { data: currentDrawing } = await supabase
      .from("drawings")
      .select("is_public, published_at")
      .eq("id", id)
      .eq("user_id", (req as any).user.id)
      .single();

    if (!currentDrawing) return res.status(404).json({ error: "Drawing not found" });

    let updateData: any = {
      is_public,
      share_token: is_public ? share_token : null,
      expiry_date: is_public ? expiry_date : null,
    };

    if (is_public) {
      if (!currentDrawing.published_at) {
        updateData.published_at = new Date().toISOString();
      }
    } else {
      updateData.published_at = null;
    }

    const { data, error } = await supabase
      .from("drawings")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", (req as any).user.id)
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
    .from("drawings")
    .select("*")
    .eq("id", req.params.id)
    .eq("user_id", (req as any).user.id)
    .single();

  if (error || !data) return res.status(404).json({ error: "Drawing not found" });
  res.json(data);
});

router.put("/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { title, data, project_id } = req.body;
  const { error } = await supabase
    .from("drawings")
    .update({ title, data, project_id: project_id || null, updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .eq("user_id", (req as any).user.id);

  if (error) return handleError(res, error, "Failed to update drawing");
  res.json({ success: true });
});

router.delete("/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("drawings")
    .update(getSafeUpdate(true))
    .eq("id", req.params.id)
    .eq("user_id", (req as any).user.id);

  if (error) return handleError(res, error, "Failed to delete drawing");
  res.json({ success: true });
});

router.post("/:id/restore", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("drawings")
    .update(getSafeUpdate(false))
    .eq("id", req.params.id)
    .eq("user_id", (req as any).user.id);

  if (error) return handleError(res, error, "Failed to restore drawing");
  res.json({ success: true });
});

router.delete("/:id/permanent", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    // 1. Fetch the drawing data to find associated R2 files
    const { data: drawing } = await supabase
      .from("drawings")
      .select("data")
      .eq("id", req.params.id)
      .eq("user_id", (req as any).user.id)
      .single();

    if (drawing && drawing.data && s3Client && R2_BUCKET_NAME) {
      try {
        const parsedData = JSON.parse(drawing.data);
        const files = parsedData.files || {};
        
        // Find all R2 URLs in the files map
        const r2Keys: string[] = [];
        for (const fileId in files) {
          const dataURL = files[fileId].dataURL;
          if (typeof dataURL === "string" && dataURL.includes("erd-builder-pro/")) {
            // Extract the S3 key from the URL
            const key = dataURL.substring(dataURL.indexOf("erd-builder-pro/"));
            r2Keys.push(key);
          }
        }

        // 2. Delete objects from R2 in parallel
        if (r2Keys.length > 0) {
          console.log(`Deleting ${r2Keys.length} images from R2 for drawing ${req.params.id}`);
          await Promise.all(r2Keys.map(key => 
            s3Client.send(new DeleteObjectCommand({
              Bucket: R2_BUCKET_NAME,
              Key: key,
            })).catch(err => {
              console.error(`Failed to delete R2 object ${key}:`, err);
            })
          ));
        }
      } catch (e) {
        console.error("Failed to parse drawing data for R2 cleanup:", e);
      }
    }

    // 3. Delete the record from Supabase
    const { error } = await supabase
      .from("drawings")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", (req as any).user.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
