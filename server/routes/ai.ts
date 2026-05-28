import { Router } from "express";
import { supabase } from "../lib/config.js";

const router = Router();

router.post("/proxy", async (req, res) => {
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
    let { messages, model, apiKey, baseUrl } = req.body;

    if (!messages) {
      clearTimeout(timeout);
      return res.status(400).json({ error: "Missing required fields: messages" });
    }

    // When no apiKey is provided (Guest mode), look up the default config from Supabase
    if (!apiKey) {
      if (!supabase) {
        clearTimeout(timeout);
        return res.status(500).json({ error: "Supabase not configured on server" });
      }

      const { data: configData, error: configError } = await supabase
        .from("user_ai_configs")
        .select("*, ai_providers(*)")
        .eq("is_enabled", true)
        .not("selected_model_id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (configError) {
        clearTimeout(timeout);
        console.error("AI proxy: Failed to fetch default config:", configError);
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
      return res.status(response.status).json({
        error: `AI provider error (${response.status})`,
        details: errBody || response.statusText,
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
    console.error("AI proxy error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Internal server error" });
    }
  }
});

export default router;
