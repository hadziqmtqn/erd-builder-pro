import { Request, Response } from "express";
import { logger } from "../../lib/logger.js";
import { resolveAiConfig, getProxyFetchUrl } from "./service.js";

export async function proxy(req: Request, res: Response): Promise<void> {
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
      res.status(400).json({ error: "Missing required fields: messages" });
      return;
    }

    // Guest AI guard: if no userId in body, try session cookie
    if (!userId) {
      try {
        const token = req.cookies?.token;
        if (token) {
          const { supabase } = await import("../../lib/config.js");
          const { data: { user } } = await supabase.auth.getUser(token);
          if (user) userId = user.id;
        }
      } catch {}

      // Also try local auth (desktop / local postgres) — token is not a Supabase JWT
      if (!userId) {
        try {
          const token = req.cookies?.token || (req.headers.authorization?.startsWith("Bearer ")
            ? req.headers.authorization.slice(7)
            : undefined);
          if (token) {
            const { getSession } = await import("../../lib/desktop-auth.js");
            const session = await getSession(token);
            if (session) {
              userId = session.userId;
            }
          }
        } catch {}
      }
    }

    // If still no userId, this is an unauthenticated (guest) request.
    // Block AI for guests unless explicitly enabled.
    if (!userId && (process.env.GUEST_AI_ENABLED || "false") !== "true") {
      clearTimeout(timeout);
      res.status(403).json({ error: "AI Chat is not available in guest mode. Please log in to use AI features." });
      return;
    }

    // When no apiKey is provided, look up config from DB
    if (!apiKey) {
      try {
        const resolved = await resolveAiConfig({
          userId,
          baseUrl,
          model,
          providerCode: req.body.providerCode,
        });
        apiKey = resolved.apiKey;
        baseUrl = resolved.baseUrl;
        model = resolved.model;

        // Pass provider code from DB resolution to proxy routing
        if (!req.body.providerCode) {
          req.body.providerCode = resolved.providerCode;
        }
      } catch (dbErr: any) {
        clearTimeout(timeout);
        logger.error({ err: dbErr }, "AI proxy: Failed to fetch default config:");
        res.status(500).json({ error: "Failed to fetch AI configuration" });
        return;
      }
    }

    const { providerCode } = req.body;
    const isGemini =
      providerCode === "gemini" ||
      (baseUrl || "").includes("generativelanguage.googleapis.com");

    const resolvedBaseUrl = (() => {
      if (isGemini) {
        return baseUrl || "https://generativelanguage.googleapis.com/v1beta";
      }
      return baseUrl || "https://api.openai.com/v1";
    })();

    const fetchUrl = getProxyFetchUrl(resolvedBaseUrl, isGemini);
    const effectiveModel = model || "gpt-4o-mini";

    const fetchHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };

    const response = await fetch(fetchUrl, {
      method: "POST",
      headers: fetchHeaders,
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
      logger.error({ err: errBody, status: response.status }, "AI provider error");
      // Use 502 Bad Gateway — upstream provider failure, not an auth error.
      // The global 401 interceptor in the frontend must NOT catch this.
      res.status(502).json({
        error: `AI provider error (${response.status})`,
      });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const reader = response.body?.getReader();
    if (!reader) {
      res.status(500).json({ error: "Response body not readable" });
      return;
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
      res.status(500).json({ error: "AI proxy error" });
    }
  }
}
