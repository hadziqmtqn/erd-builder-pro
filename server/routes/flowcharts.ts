import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase } from "../lib/config.js";
import { authenticate } from "../lib/middleware.js";
import { handleError, getSafeUpdate } from "../lib/utils.js";

const router = Router();

router.get("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const offset = parseInt(req.query.offset as string) || 0;
  const projectId = req.query.project_id as string;
  const q = req.query.q as string;

  let query = supabase
    .from("flowcharts")
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

  // Optimization: Filter out flowcharts belonging to deleted projects at the database level
  const { data: deletedProjects } = await supabase.from("projects").select("id").eq("is_deleted", true);
  const deletedIds = deletedProjects?.map((p: any) => p.id) || [];
  
  if (deletedIds.length > 0) {
    query = query.not("project_id", "in", `(${deletedIds.join(",")})`);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return handleError(res, error, "Supabase error fetching flowcharts");
  
  res.json({ 
    data: data || [], 
    total: count || 0
  });
});

router.post("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { title, data, project_id } = req.body;
  const { data: inserted, error } = await supabase
    .from("flowcharts")
    .insert([{ title, data: data || '{"nodes":[], "edges":[]}', project_id: project_id || null }])
    .select()
    .single();

  if (error) return handleError(res, error, "Failed to create flowchart");
  res.json(inserted);
});

router.get("/public/:uid", async (req: ExpressRequest, res: ExpressResponse) => {
  const { data: flowchart, error } = await supabase
    .from("flowcharts")
    .select("*, projects!left(name)")
    .eq("uid", req.params.uid)
    .single();

  if (error || !flowchart) return res.status(404).json({ error: "Flowchart not found" });

  // Security Check: Is it public?
  if (!flowchart.is_public) {
    return res.status(403).json({ error: "This document is private" });
  }

  // Security Check: Is it expired?
  if (flowchart.expiry_date && new Date(flowchart.expiry_date) < new Date()) {
    return res.status(403).json({ error: "This share link has expired" });
  }

  // Security Check: Token matching (if required)
  const providedToken = req.headers['x-share-token'] || req.query.token;
  if (flowchart.share_token && flowchart.share_token !== providedToken) {
    return res.status(401).json({ error: "Invalid access token", requiresToken: true });
  }

  res.json(flowchart);
});

router.put("/:id/share", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { id } = req.params;
  const { is_public, share_token, expiry_date } = req.body;

  try {
    const { data: currentFlowchart } = await supabase
      .from("flowcharts")
      .select("is_public, published_at")
      .eq("id", id)
      .single();

    if (!currentFlowchart) return res.status(404).json({ error: "Flowchart not found" });

    let updateData: any = {
      is_public,
      share_token: is_public ? share_token : null,
      expiry_date: is_public ? expiry_date : null,
    };

    if (is_public) {
      if (!currentFlowchart.published_at) {
        updateData.published_at = new Date().toISOString();
      }
    } else {
      updateData.published_at = null;
    }

    const { data, error } = await supabase
      .from("flowcharts")
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
    .from("flowcharts")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: "Flowchart not found" });
  res.json(data);
});

router.put("/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { title, data, project_id } = req.body;
  const { error } = await supabase
    .from("flowcharts")
    .update({ title, data, project_id: project_id || null, updated_at: new Date().toISOString() })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.delete("/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("flowcharts")
    .update(getSafeUpdate(true))
    .eq("id", req.params.id);

  if (error) return handleError(res, error, "Failed to delete flowchart");
  res.json({ success: true });
});

router.post("/:id/restore", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("flowcharts")
    .update(getSafeUpdate(false))
    .eq("id", req.params.id);

  if (error) return handleError(res, error, "Failed to restore flowchart");
  res.json({ success: true });
});

router.delete("/:id/permanent", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { error } = await supabase
      .from("flowcharts")
      .delete()
      .eq("id", req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
