import { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { logger } from "../../lib/logger.js";
import { supabase, useLocalAuth } from "../../lib/config.js";
import { getSession } from "../../lib/desktop-auth.js";
import { safeAiBaseUrl } from "../../lib/ai-security.js";
import { createOpenAiStreamContentCollector } from "../../lib/ai-chat-stream.js";
import { finalizeCloudAiCredit, getCloudAiAccess, getCloudAiRuntimeConfig, reserveCloudAiCredit } from "../../lib/cloud-ai.js";
import { createTrustedAssistantMessage } from "../ai-chat/service.js";
import { resolveAiConfig, getProxyFetchUrl } from "./service.js";

async function resolveRequestUserId(req: Request): Promise<string | undefined> {
  if ((req as any).user?.id) return (req as any).user.id;
  try {
    const token = req.cookies?.token || (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined);
    if (!token) return undefined;

    if (useLocalAuth()) return (await getSession(token))?.userId;

    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser(token);
      return user?.id;
    }
  } catch {
    // Invalid auth must fail closed as guest, never fall through to another user's config.
  }
  return undefined;
}

export async function proxy(req: Request, res: Response): Promise<void> {
  let aborted = false;
  let cloudCreditReserved = false;
  let cloudCreditFinalized = false;
  let cloudRequestId = "";
  let cloudProviderResponded = false;
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
    let {
      messages,
      model,
      apiKey,
      baseUrl,
      providerCode,
      request_id: requestedId,
      chat_session_id: chatSessionId,
      assistant_client_message_id: assistantClientMessageId,
    } = req.body;
    let baseUrlValidated = false;

    if (!messages) {
      clearTimeout(timeout);
      res.status(400).json({ error: "Missing required fields: messages" });
      return;
    }

    const userId = await resolveRequestUserId(req);
    const assistantContent = userId && chatSessionId && assistantClientMessageId
      ? createOpenAiStreamContentCollector()
      : null;
    const cloudAccess = await getCloudAiAccess(req);
    if (cloudAccess) {
      const runtimeConfig = await getCloudAiRuntimeConfig();
      if (!runtimeConfig) {
        clearTimeout(timeout);
        res.status(503).json({ error: "Cloud AI is not configured.", code: "CLOUD_AI_NOT_CONFIGURED" });
        return;
      }
      apiKey = runtimeConfig.apiKey;
      baseUrl = runtimeConfig.baseUrl;
      model = runtimeConfig.model;
      providerCode = runtimeConfig.providerCode;
      messages = runtimeConfig.globalSystemPrompt
        ? [{ role: "system", content: runtimeConfig.globalSystemPrompt }, ...messages]
        : messages;
      cloudRequestId = String(requestedId || req.header("X-AI-Request-Id") || randomUUID());
      const reservation = await reserveCloudAiCredit(cloudAccess, cloudRequestId, providerCode, model);
      if (!reservation.allowed) {
        clearTimeout(timeout);
        res.status(reservation.duplicate ? 409 : 429).json({
          error: reservation.duplicate ? "This AI request has already been accepted or is still processing." : "AI credit quota exhausted.",
          code: reservation.duplicate ? "CLOUD_AI_REQUEST_DUPLICATE" : "CLOUD_AI_CREDITS_EXHAUSTED",
        });
        return;
      }
      cloudCreditReserved = true;
    }

    // If still no userId, this is an unauthenticated (guest) request.
    // Block AI for guests unless explicitly enabled.
    if (!userId && (process.env.GUEST_AI_ENABLED || "false") !== "true") {
      clearTimeout(timeout);
      res.status(403).json({ error: "AI Chat is not available in guest mode. Please log in to use AI features." });
      return;
    }

    // A guest may only use an explicitly supplied key; never select a DB key without an owner.
    if (!userId && !apiKey) {
      clearTimeout(timeout);
      res.status(403).json({ error: "An authenticated session or inline AI API key is required" });
      return;
    }

    // When no apiKey is provided, look up config from DB
    if (!apiKey) {
      try {
        const resolved = await resolveAiConfig({
          userId,
          model,
          providerCode,
        });
        apiKey = resolved.apiKey;
        baseUrl = resolved.baseUrl;
        model = resolved.model;
        baseUrlValidated = true;

        // Pass provider code from DB resolution to proxy routing
        providerCode = resolved.providerCode;
      } catch (dbErr: any) {
        clearTimeout(timeout);
        logger.error({ err: dbErr }, "AI proxy: Failed to fetch default config:");
        const errorMessage = dbErr instanceof Error ? dbErr.message : "";
        const isConfigError = /^(No AI provider configured|Selected AI (model|provider) is unavailable)/.test(errorMessage);
        res.status(isConfigError ? 400 : 500).json({
          error: isConfigError ? errorMessage : "Failed to fetch AI configuration",
        });
        return;
      }
    }

    if (!apiKey) {
      clearTimeout(timeout);
      res.status(400).json({ error: "AI API key is required" });
      return;
    }

    if (!baseUrlValidated) {
      baseUrl = await safeAiBaseUrl(baseUrl, providerCode === "gemini"
        ? "https://generativelanguage.googleapis.com/v1beta"
        : "https://api.openai.com/v1");
    }
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
    cloudProviderResponded = true;

    clearTimeout(timeout);

    if (!response.ok) {
      if (cloudCreditReserved) {
        await finalizeCloudAiCredit(cloudRequestId, true, "CLOUD_AI_PROVIDER_ERROR");
        cloudCreditFinalized = true;
      }
      logger.error({ status: response.status }, "AI provider error");
      // Use 502 Bad Gateway — upstream provider failure, not an auth error.
      // The global 401 interceptor in the frontend must NOT catch this.
      res.status(502).json({
        error: `AI provider error (${response.status})`,
      });
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      if (cloudCreditReserved) {
        await finalizeCloudAiCredit(cloudRequestId, true, "CLOUD_AI_RESPONSE_UNREADABLE");
        cloudCreditFinalized = true;
      }
      res.status(500).json({ error: "Response body not readable" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(": connected\n\n");

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
          assistantContent?.push(value);
          res.write(decoder.decode(value, { stream: true }));
        } catch {
          break;
        }
      }
    }

    const trustedContent = assistantContent?.finish();
    if (trustedContent?.trim() && userId && chatSessionId && assistantClientMessageId) {
      try {
        await createTrustedAssistantMessage({
          sessionId: chatSessionId,
          userId,
          content: trustedContent,
          clientMessageId: assistantClientMessageId,
        });
      } catch (err) {
        logger.warn({ err }, "Failed to persist trusted AI chat response");
      }
    }

    if (cloudCreditReserved && !cloudCreditFinalized) {
      await finalizeCloudAiCredit(cloudRequestId, true, aborted ? "CLOUD_AI_STREAM_INTERRUPTED" : undefined);
      cloudCreditFinalized = true;
    }

    if (!aborted) {
      try { res.end(); } catch {}
    }
  } catch (err: any) {
    if (cloudCreditReserved && !cloudCreditFinalized) {
      await finalizeCloudAiCredit(cloudRequestId, cloudProviderResponded, cloudProviderResponded ? "CLOUD_AI_STREAM_FAILED" : "CLOUD_AI_SERVICE_UNAVAILABLE");
      cloudCreditFinalized = true;
    }
    if (aborted) return;
    logger.error({ err: err }, "AI proxy error:");
    if (!res.headersSent) {
      res.status(500).json({ error: "AI proxy error" });
    }
  }
}
