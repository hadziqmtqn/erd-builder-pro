import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase } from "../lib/config";
import { authenticate } from "../lib/middleware";

const router = Router();

router.get("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { data, error } = await supabase
    .from("drawings")
    .select("*, projects!left(*)")
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Supabase error fetching drawings:", error);
    return res.status(500).json({ error: error.message });
  }
  
  const filteredData = (data || []).filter((drawing: any) => !drawing.projects || !drawing.projects.is_deleted);
  res.json(filteredData);
});

router.post("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { title, data, project_id } = req.body;
  const { data: inserted, error } = await supabase
    .from("drawings")
    .insert([{ title, data: data || "[]", project_id: project_id || null }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(inserted);
});

router.get("/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { data, error } = await supabase
    .from("drawings")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: "Drawing not found" });
  res.json(data);
});

router.put("/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { title, data, project_id } = req.body;
  const { error } = await supabase
    .from("drawings")
    .update({ title, data, project_id: project_id || null, updated_at: new Date().toISOString() })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.delete("/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("drawings")
    .update({ is_deleted: true })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.post("/:id/restore", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("drawings")
    .update({ is_deleted: false })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.delete("/:id/permanent", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("drawings")
    .delete()
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

export default router;
