import { Router } from "express";
import { prisma } from "../lib/prisma.js";
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

    // When no apiKey is provided, look up config from DB
    if (!apiKey) {
      // Attempt to get userId from session cookie if not provided in body
      if (!userId) {
        try {
          const { supabase } = await import("../lib/config.js");
          const token = req.cookies?.token;
          if (token) {
            const { data: { user } } = await supabase.auth.getUser(token);
            if (user) userId = user.id;
          }
        } catch {}
      }

      if (!prisma) {
        clearTimeout(timeout);
        return res.status(500).json({ error: "Database not configured on server" });
      }

      try {
        // Authenticated: scope config lookup to user's own config
        // Guest (no userId): use first enabled system config as fallback
        const where: any = {
          isEnabled: true,
          selectedModelId: { not: null },
        };
        if (userId) {
          where.userId = userId;
        }

        const config = await prisma.userAiConfig.findFirst({
          where,
          include: { provider: true },
          orderBy: { updatedAt: "desc" },
        });

        if (!config) {
          clearTimeout(timeout);
          return res.status(400).json({ error: "No AI provider configured. Configure AI in Settings." });
        }

        apiKey = config.apiKey;
        baseUrl = baseUrl || config.provider?.baseUrl || "https://api.openai.com/v1";

        if (!model && config.selectedModelId) {
          const modelData = await prisma.aiModel.findFirst({
            where: { id: config.selectedModelId },
            select: { modelIdentifier: true },
          });
          model = modelData?.modelIdentifier || "gpt-4o-mini";
        }
      } catch (dbErr) {
        clearTimeout(timeout);
        logger.error({ err: dbErr }, "AI proxy: Failed to fetch default config:");
        return res.status(500).json({ error: "Failed to fetch AI configuration" });
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
      res.status(500).json({ error: "AI proxy error" });
    }
  }
});

export default router;
