import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase } from "../lib/config.js";
import { authenticate } from "../lib/middleware.js";

const router = Router();

// GET /api/ai/settings/providers
router.get("/providers", authenticate, async (_req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { data, error } = await supabase
      .from("ai_providers")
      .select("*")
      .eq("is_active", true)
      .order("id");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai/settings/configs
router.get("/configs", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { data, error } = await supabase
      .from("user_ai_configs")
      .select("*")
      .eq("user_id", (req as any).user.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/settings/configs
router.post("/configs", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { provider_id, api_key, selected_model_id, is_enabled } = req.body;
    const { data, error } = await supabase
      .from("user_ai_configs")
      .upsert({
        user_id: (req as any).user.id,
        provider_id,
        api_key,
        selected_model_id,
        is_enabled: is_enabled ?? true,
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id,provider_id" })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai/settings/models
router.get("/models", authenticate, async (_req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { data, error } = await supabase
      .from("ai_models")
      .select("*")
      .eq("is_active", true);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/settings/models
router.post("/models", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { provider_id, model_identifier, display_name } = req.body;
    const { data, error } = await supabase
      .from("ai_models")
      .insert([{ provider_id, model_identifier, display_name, is_active: true }])
      .select();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/ai/settings/models/:id
router.put("/models/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { provider_id, model_identifier, display_name } = req.body;
    const { error } = await supabase
      .from("ai_models")
      .update({ provider_id, model_identifier, display_name })
      .eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/ai/settings/models/:id
router.delete("/models/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { error } = await supabase.from("ai_models").delete().eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai/settings/prompts
router.get("/prompts", authenticate, async (_req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { data, error } = await supabase
      .from("ai_system_prompts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/settings/prompts
router.post("/prompts", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { id, name, content, category, is_default } = req.body;
    if (id) {
      const { error } = await supabase
        .from("ai_system_prompts")
        .update({ name, content, category, is_default, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } else {
      const { data, error } = await supabase
        .from("ai_system_prompts")
        .insert([{ name, content, category, is_default, user_id: (req as any).user.id }])
        .select();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/ai/settings/prompts/:id
router.delete("/prompts/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { error } = await supabase.from("ai_system_prompts").delete().eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/ai/settings/prompts/:id/toggle-default
router.put("/prompts/:id/toggle-default", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { is_default } = req.body;
    if (is_default) {
      const { error: resetError } = await supabase
        .from("ai_system_prompts")
        .update({ is_default: false })
        .neq("id", req.params.id);
      if (resetError) return res.status(500).json({ error: resetError.message });
    }
    const { error } = await supabase
      .from("ai_system_prompts")
      .update({ is_default: !!is_default })
      .eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/settings/initialize
router.post("/initialize", authenticate, async (_req: ExpressRequest, res: ExpressResponse) => {
  try {
    const defaultProviders = [
      { name: "OpenAI", code: "openai", base_url: "https://api.openai.com/v1", is_active: true },
      { name: "Google Gemini", code: "gemini", base_url: null, is_active: true },
      { name: "OpenAI Compatible", code: "openai_compatible", base_url: "https://api.sumopod.com/v1", is_active: true }
    ];

    const { data: insertedProviders, error: pError } = await supabase
      .from("ai_providers")
      .insert(defaultProviders)
      .select();

    if (pError) return res.status(500).json({ error: pError.message });

    if (insertedProviders) {
      const modelsToInsert: any[] = [];
      insertedProviders.forEach((p: any) => {
        if (p.code === "openai") {
          modelsToInsert.push(
            { provider_id: p.id, model_identifier: "gpt-4o", display_name: "GPT-4o (Smartest)", is_active: true },
            { provider_id: p.id, model_identifier: "gpt-4o-mini", display_name: "GPT-4o Mini (Fast)", is_active: true }
          );
        } else if (p.code === "gemini") {
          modelsToInsert.push(
            { provider_id: p.id, model_identifier: "gemini-1.5-pro", display_name: "Gemini 1.5 Pro", is_active: true },
            { provider_id: p.id, model_identifier: "gemini-1.5-flash", display_name: "Gemini 1.5 Flash", is_active: true }
          );
        }
      });

      if (modelsToInsert.length > 0) {
        const { error: mError } = await supabase.from("ai_models").insert(modelsToInsert);
        if (mError) return res.status(500).json({ error: mError.message });
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/ai/settings/providers/:id
router.put("/providers/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { base_url } = req.body;
    const { error } = await supabase
      .from("ai_providers")
      .update({ base_url })
      .eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
