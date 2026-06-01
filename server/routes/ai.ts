import { Router } from "express";
import { supabase } from "../lib/config.js";
import { validate, aiProxySchema } from "../lib/validation.js";
import { logger } from "../lib/logger.js";

const router = Router();

// NOTE: No auth middleware here — guest mode sends requests without a session cookie.
// Abuse is mitigated by rate limiting applied in server/index.ts.
router.post("/proxy", validate(aiProxySchema), async (req, res) => {
  let aborted = false;
  const controller = new AbortController();

  // Use res.on("close") — fires when client disconnects OR after res.end()
  // req.on("close") fires prematurely after POST body is consumed by express.json()
  res.on("close", () => {
    aborted = true;
    controller.abort();
  });

  // Safety timeout: 30s for first byte, then auto-abort
  const timeout = setTimeout(() => {
    if (!aborted) {
      aborted = true;
      controller.abort();
    }
  }, 30_000);

  try {
    let { messages, model, apiKey, baseUrl, userId } = req.body;

    if (!messages) {
      clearTimeout(timeout);
      return res.status(400).json({ error: "Missing required fields: messages" });
    }

    // When no apiKey is provided (Guest mode or online mode without apiKey), look up config from Supabase
    if (!apiKey) {
      if (!supabase) {
        clearTimeout(timeout);
        return res.status(500).json({ error: "Supabase not configured on server" });
      }

      let query = supabase
        .from("user_ai_configs")
        .select("*, ai_providers(*)")
        .eq("is_enabled", true)
        .not("selected_model_id", "is", null)

      // Online mode: filter by user_id
      if (userId) {
        query = query.eq("user_id", userId);
      }

      const { data: configData, error: configError } = await query
        .order("updated_at", { ascending: false })
        .limit(1);

      if (configError) {
        clearTimeout(timeout);
        logger.error({ err: configError }, "AI proxy: Failed to fetch default config:");
        return res.status(500).json({ error: "Failed to fetch AI configuration" });
      }

      if (!configData || configData.length === 0) {
        clearTimeout(timeout);
        return res.status(400).json({ error: "No AI provider configured on the server" });
      }

      const config = configData[0];
      apiKey = config.api_key;
      baseUrl = baseUrl || config.ai_providers?.base_url || "https://api.openai.com/v1";

      if (!model && config.selected_model_id) {
        const { data: modelData } = await supabase
          .from("ai_models")
          .select("model_identifier")
          .eq("id", config.selected_model_id)
          .single();
        model = modelData?.model_identifier || "gpt-4o-mini";
      }
    }

    const providerBaseUrl = baseUrl || "https://api.openai.com/v1";
    const effectiveModel = model || "gpt-4o-mini";

    const response = await fetch(`${providerBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: effectiveModel,
        messages,
        stream: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      logger.error({ err: errBody }, `AI provider error (${response.status})`);
      return res.status(response.status).json({
        error: `AI provider error (${response.status})`,
      });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const reader = response.body?.getReader();
    if (!reader) {
      return res.status(500).json({ error: "Response body not readable" });
    }

    const decoder = new TextDecoder();

    while (true) {
      if (aborted) break;

      let result;
      try {
        result = await reader.read();
      } catch (err: any) {
        if (err.name === "AbortError" || aborted) break;
        throw err;
      }

      const { done, value } = result;
      if (done) break;

      if (!aborted) {
        try {
          res.write(decoder.decode(value, { stream: true }));
        } catch {
          break;
        }
      }
    }

    if (!aborted) {
      try { res.end(); } catch {}
    }
  } catch (err: any) {
    if (aborted) return;
    logger.error({ err: err }, "AI proxy error:");
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Internal server error" });
    }
  }
});

export default router;
