import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase } from "../lib/config.js";
import { authenticate } from "../lib/middleware.js";

const router = Router();

const VALID_VIEW_TYPES = ['erd', 'notes', 'flowchart'];

// GET /api/ai/rules/:viewType — get rules for a view
router.get("/:viewType", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { viewType } = req.params;
    if (!VALID_VIEW_TYPES.includes(viewType)) {
      return res.status(400).json({ error: `Invalid view type. Must be one of: ${VALID_VIEW_TYPES.join(', ')}` });
    }

    const { data, error } = await supabase
      .from("user_ai_rules")
      .select("id, view_type, content, is_enabled, updated_at")
      .eq("user_id", (req as any).user.id)
      .eq("view_type", viewType)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || { view_type: viewType, content: '', is_enabled: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/ai/rules/:viewType — upsert rules
router.put("/:viewType", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { viewType } = req.params;
    if (!VALID_VIEW_TYPES.includes(viewType)) {
      return res.status(400).json({ error: `Invalid view type. Must be one of: ${VALID_VIEW_TYPES.join(', ')}` });
    }

    const { content, is_enabled } = req.body;
    const userId = (req as any).user.id;

    const { data: existing } = await supabase
      .from("user_ai_rules")
      .select("id")
      .eq("user_id", userId)
      .eq("view_type", viewType)
      .maybeSingle();

    let result;
    if (existing) {
      result = await supabase
        .from("user_ai_rules")
        .update({ content, is_enabled: is_enabled ?? true, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select()
        .single();
    } else {
      result = await supabase
        .from("user_ai_rules")
        .insert({ user_id: userId, view_type: viewType, content, is_enabled: is_enabled ?? true })
        .select()
        .single();
    }

    if (result.error) return res.status(500).json({ error: result.error.message });
    res.json(result.data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
