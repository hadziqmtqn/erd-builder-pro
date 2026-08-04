import { createClient } from "@supabase/supabase-js";

// Standalone Vercel serverless function for AI proxy.
// Separate from the main Express app to avoid cold-start overhead
// from loading CRUD routes, AWS SDK, and other heavy modules.

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Parse JSON body manually (no Express middleware)
  let body: any;
  try {
    body = typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const { messages, model, apiKey, baseUrl, userId } = body;

  if (!messages) {
    return res.status(400).json({ error: "Missing required fields: messages" });
  }

  let resolvedApiKey = apiKey;
  let resolvedBaseUrl = baseUrl;
  let resolvedModel = model;

  // Guest/Online mode: resolve config from Supabase when no apiKey sent
  if (!resolvedApiKey) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: "Supabase not configured" });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

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

    if (configError || !configData || configData.length === 0) {
      return res.status(400).json({
        error: configError ? "Failed to fetch AI configuration" : "No AI provider configured",
      });
    }

    const config = configData[0];
    resolvedApiKey = config.api_key;
    resolvedBaseUrl = resolvedBaseUrl || config.ai_providers?.base_url || "https://api.openai.com/v1";

    if (!resolvedModel && config.selected_model_id) {
      const { data: modelData, error: modelError } = await supabase
        .from("ai_models")
        .select("model_identifier")
        .eq("id", config.selected_model_id)
        .single();

      if (modelError) {
        return res.status(400).json({ error: "Failed to fetch the selected AI model" });
      }

      resolvedModel = modelData?.model_identifier || "gpt-4o-mini";
    }
  }

  const effectiveBaseUrl = resolvedBaseUrl || "https://api.openai.com/v1";
  const effectiveModel = resolvedModel || "gpt-4o-mini";

  // Proxy to AI provider with SSE streaming
  const providerRes = await fetch(`${effectiveBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resolvedApiKey}`,
    },
    body: JSON.stringify({
      model: effectiveModel,
      messages,
      stream: true,
    }),
  });

  if (!providerRes.ok) {
    const errBody = await providerRes.text().catch(() => "");
    console.error(`AI provider error (${providerRes.status}):`, errBody);
    return res.status(providerRes.status).json({
      error: `AI provider error (${providerRes.status})`,
    });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const reader = providerRes.body?.getReader();
  if (!reader) {
    return res.status(500).json({ error: "Response body not readable" });
  }

  const decoder = new TextDecoder();
  let aborted = false;

  req.on("close", () => { aborted = true; });

  const timeout = setTimeout(() => { aborted = true; }, 30_000);

  try {
    while (true) {
      if (aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      if (!aborted) {
        try { res.write(decoder.decode(value, { stream: true })); } catch { break; }
      }
    }
  } catch (err: any) {
    if (err.name === "AbortError" || aborted) return;
    console.error("AI proxy stream error:", err);
  } finally {
    clearTimeout(timeout);
    if (!aborted) {
      try { res.end(); } catch {}
    }
  }
}
