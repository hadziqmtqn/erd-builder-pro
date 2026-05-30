import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase } from "../lib/config.js";
import { authenticate } from "../lib/middleware.js";

const router = Router();

// GET /api/ai/chat/sessions
router.get("/sessions", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const userId = (req as any).user.id;
    const projectId = req.query.project_id as string | undefined;
    const entityType = req.query.entity_type as string | undefined;
    const entityUid = req.query.entity_uid as string | undefined;

    let query = supabase
      .from("ai_chat_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    const hasProject = !!projectId;
    const hasEntity = !!entityType && !!entityUid;

    if (hasProject && hasEntity) {
      // Project-scoped sessions + orphan sessions from this file
      query = query.or(
        `project_id.eq.${projectId},and(project_id.is.null,entity_type.eq.${entityType},entity_uid.eq.${entityUid})`
      );
    } else if (hasProject) {
      query = query.eq("project_id", projectId);
    } else if (hasEntity) {
      query = query.is("project_id", null).eq("entity_type", entityType).eq("entity_uid", entityUid);
    } else {
      // No filters provided — return empty instead of leaking orphan sessions
      return res.json([]);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/chat/sessions
router.post("/sessions", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const userId = (req as any).user.id;
    const { entity_type, entity_uid, project_id } = req.body;

    const payload: any = { title: "New Conversation", user_id: userId };
    if (entity_type) payload.entity_type = entity_type;
    if (entity_uid) payload.entity_uid = entity_uid;
    if (project_id) payload.project_id = project_id;

    const { data, error } = await supabase
      .from("ai_chat_sessions")
      .insert([payload])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai/chat/sessions/:uid
router.get("/sessions/:uid", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { data, error } = await supabase
      .from("ai_chat_sessions")
      .select("*")
      .eq("uid", req.params.uid)
      .single();
    if (error) return res.status(404).json({ error: "Session not found" });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/ai/chat/sessions/:uid
router.delete("/sessions/:uid", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { error } = await supabase.from("ai_chat_sessions").delete().eq("uid", req.params.uid);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/ai/chat/sessions/:id
router.put("/sessions/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { title, project_id, updated_at } = req.body;
    const updatePayload: Record<string, any> = { updated_at: updated_at || new Date().toISOString() };
    if (title !== undefined) updatePayload.title = title;
    if (project_id !== undefined) updatePayload.project_id = project_id;

    const { data, error } = await supabase
      .from("ai_chat_sessions")
      .update(updatePayload)
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai/chat/sessions/:id/messages
router.get("/sessions/:id/messages", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = parseInt(req.query.limit as string) || 30;

    const { data, error, count } = await supabase
      .from("ai_chat_messages")
      .select("*", { count: "exact", head: false })
      .eq("session_id", req.params.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ data: data || [], count: count || 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/chat/messages
router.post("/messages", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { session_id, role, content, selection_text } = req.body;
    if (!session_id || !role || !content) {
      return res.status(400).json({ error: "Missing required fields: session_id, role, content" });
    }

    const { data, error } = await supabase
      .from("ai_chat_messages")
      .insert([{ session_id, role, content, selection_text: selection_text || null }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai/chat/config
router.get("/config", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const userId = (req as any).user.id;

    const { data: configData, error: configError } = await supabase
      .from("user_ai_configs")
      .select("*, ai_providers(*)")
      .eq("is_enabled", true)
      .not("selected_model_id", "is", null)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (configError) return res.status(500).json({ error: configError.message });

    if (!configData || configData.length === 0) {
      return res.status(400).json({ error: "No AI provider configured. Go to Settings > AI to configure." });
    }

    const config = configData[0];
    const provider = config.ai_providers;
    const resolvedBaseUrl = provider?.base_url || "https://api.openai.com/v1";
    const resolvedApiKey = config.api_key;

    const { data: modelData } = await supabase
      .from("ai_models")
      .select("model_identifier")
      .eq("id", config.selected_model_id)
      .single();

    res.json({
      baseUrl: resolvedBaseUrl,
      apiKey: resolvedApiKey,
      model: modelData?.model_identifier || "gpt-4o-mini",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai/chat/prompts/default
router.get("/prompts/default", authenticate, async (_req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { data } = await supabase
      .from("ai_system_prompts")
      .select("content")
      .eq("is_default", true)
      .limit(1);

    res.json({ content: data && data.length > 0 ? data[0].content : null });
  } catch {
    res.json({ content: null });
  }
});

export default router;
