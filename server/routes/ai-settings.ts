import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../lib/middleware.js";
import { handleError } from "../lib/utils.js";
import { requireAdmin } from "../lib/security.js";

const router = Router();

function getUserId(req: ExpressRequest): string {
  return (req as any).user.id;
}

// GET /api/ai/settings/providers
router.get("/providers", authenticate, async (_req: ExpressRequest, res: ExpressResponse) => {
  try {
    const data = await prisma?.aiProvider.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' }
    });
    res.json(data || []);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch providers");
  }
});

// GET /api/ai/settings/configs
router.get("/configs", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const data = await prisma?.userAiConfig.findMany({
      where: { userId: getUserId(req) }
    });
    res.json((data || []).map((c: any) => ({
      ...c,
      apiKey: c.apiKey ? '***' : null,
    })));
  } catch (err: any) {
    handleError(res, err, "Failed to fetch configs");
  }
});

// POST /api/ai/settings/configs
router.post("/configs", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const userId = getUserId(req);
    const { provider_id, api_key, selected_model_id, is_enabled } = req.body;
    const providerId = Number(provider_id);
    if (!providerId) return res.status(400).json({ error: 'provider_id is required' });
    const selectedModelId = selected_model_id != null ? Number(selected_model_id) || null : null;

    const data = await prisma?.userAiConfig.upsert({
      where: { userId_providerId: { userId, providerId } },
      create: {
        userId,
        providerId,
        apiKey: (api_key && api_key !== '***') ? api_key : null,
        selectedModelId: selectedModelId ?? undefined,
        isEnabled: is_enabled ?? true,
      },
      update: {
        ...(api_key && api_key !== '***' ? { apiKey: api_key } : {}),
        selectedModelId: selectedModelId ?? undefined,
        isEnabled: is_enabled ?? undefined,
        updatedAt: new Date(),
      }
    });
    res.json(data ? { ...data, apiKey: data.apiKey ? '***' : null } : null);
  } catch (err: any) {
    handleError(res, err, "Failed to save config");
  }
});

// GET /api/ai/settings/models
router.get("/models", authenticate, async (_req: ExpressRequest, res: ExpressResponse) => {
  try {
    const data = await prisma?.aiModel.findMany({
      where: { isActive: true }
    });
    res.json(data || []);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch models");
  }
});

// POST /api/ai/settings/models
router.post("/models", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { provider_id, model_identifier, display_name } = req.body;
    const providerId = Number(provider_id);
    if (providerId && Number.isNaN(providerId)) return res.status(400).json({ error: "Invalid provider_id" });
    const data = await prisma?.aiModel.create({
      data: {
        providerId: providerId || null,
        modelIdentifier: model_identifier,
        displayName: display_name,
        isActive: true,
      }
    });
    res.json(data);
  } catch (err: any) {
    handleError(res, err, "Failed to create model");
  }
});

// PUT /api/ai/settings/models/:id
router.put("/models/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { provider_id, model_identifier, display_name } = req.body;
    const providerId = Number(provider_id);
    if (providerId && Number.isNaN(providerId)) return res.status(400).json({ error: "Invalid provider_id" });
    const modelId = Number(req.params.id);
    if (Number.isNaN(modelId)) return res.status(400).json({ error: "Invalid model id" });
    await prisma?.aiModel.update({
      where: { id: modelId as any },
      data: {
        providerId: providerId || null,
        modelIdentifier: model_identifier,
        displayName: display_name,
      }
    });
    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to update model");
  }
});

// DELETE /api/ai/settings/models/:id
router.delete("/models/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    if (!requireAdmin(req, res)) return;
    const modelId = Number(req.params.id);
    if (Number.isNaN(modelId)) return res.status(400).json({ error: "Invalid model id" });
    await prisma?.aiModel.delete({
      where: { id: modelId as any }
    });
    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to delete model");
  }
});

// GET /api/ai/settings/prompts
router.get("/prompts", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const userId = getUserId(req);
    const data = await prisma?.aiSystemPrompt.findMany({
      where: { OR: [{ userId }, { userId: null }] },
      orderBy: { createdAt: 'desc' }
    });
    res.json(data || []);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch prompts");
  }
});

// POST /api/ai/settings/prompts
router.post("/prompts", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const userId = getUserId(req);
    const { id, name, content, category, is_default } = req.body;
    if (id) {
      const existing = await prisma?.aiSystemPrompt.findFirst({
        where: { id },
        select: { id: true, userId: true, isBuiltIn: true },
      });
      if (!existing) return res.status(404).json({ error: "Prompt not found" });
      if (existing.userId !== userId && !requireAdmin(req, res)) return;
      if (existing.isBuiltIn && !requireAdmin(req, res)) return;
      if (is_default && !requireAdmin(req, res)) return;

      const data = await prisma?.aiSystemPrompt.update({
        where: { id },
        data: {
          name,
          content,
          category,
          isDefault: is_default,
          updatedAt: new Date(),
        }
      });
      res.json(data);
    } else {
      if (is_default && !requireAdmin(req, res)) return;
      const data = await prisma?.aiSystemPrompt.create({
        data: {
          name,
          content,
          category,
          isDefault: is_default,
          userId,
        }
      });
      res.json(data);
    }
  } catch (err: any) {
    handleError(res, err, "Failed to save prompt");
  }
});

// DELETE /api/ai/settings/prompts/:id
router.delete("/prompts/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const userId = getUserId(req);
    const existing = await prisma?.aiSystemPrompt.findFirst({
      where: { id: req.params.id },
      select: { id: true, userId: true, isBuiltIn: true },
    });
    if (!existing) return res.status(404).json({ error: "Prompt not found" });
    if (existing.userId !== userId && !requireAdmin(req, res)) return;
    if (existing.isBuiltIn && !requireAdmin(req, res)) return;
    await prisma?.aiSystemPrompt.delete({
      where: { id: req.params.id }
    });
    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to delete prompt");
  }
});

// PUT /api/ai/settings/prompts/:id/toggle-default
router.put("/prompts/:id/toggle-default", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    if (!requireAdmin(req, res)) return;
    const userId = getUserId(req);
    const existing = await prisma?.aiSystemPrompt.findFirst({
      where: { id: req.params.id },
    });
    if (!existing) return res.status(404).json({ error: "Prompt not found" });

    const { is_default } = req.body;
    if (is_default) {
      await prisma?.aiSystemPrompt.updateMany({
        where: { id: { not: req.params.id } },
        data: { isDefault: false }
      });
    }
    const data = await prisma?.aiSystemPrompt.update({
      where: { id: req.params.id },
      data: { isDefault: !!is_default }
    });
    res.json(data);
  } catch (err: any) {
    handleError(res, err, "Failed to toggle default prompt");
  }
});

// POST /api/ai/settings/initialize
router.post("/initialize", authenticate, async (_req: ExpressRequest, res: ExpressResponse) => {
  try {
    if (!requireAdmin(_req, res)) return;
    const defaultProviders = [
      { name: "OpenAI", code: "openai", baseUrl: "https://api.openai.com/v1", isActive: true },
      { name: "Google Gemini", code: "gemini", baseUrl: null, isActive: true },
      { name: "OpenAI Compatible", code: "openai_compatible", baseUrl: "https://ai.paas.id", isActive: true }
    ];

    await prisma?.aiProvider.createMany({
      data: defaultProviders
    });

    const providers = await prisma?.aiProvider.findMany({
      where: { code: { in: defaultProviders.map(p => p.code) } }
    });

    if (providers && providers.length > 0) {
      const modelsToInsert: any[] = [];
      providers.forEach((p: any) => {
        if (p.code === "openai") {
          modelsToInsert.push(
            { providerId: p.id, modelIdentifier: "gpt-4o", displayName: "GPT-4o (Smartest)", isActive: true },
            { providerId: p.id, modelIdentifier: "gpt-4o-mini", displayName: "GPT-4o Mini (Fast)", isActive: true }
          );
        } else if (p.code === "gemini") {
          modelsToInsert.push(
            { providerId: p.id, modelIdentifier: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro", isActive: true },
            { providerId: p.id, modelIdentifier: "gemini-1.5-flash", displayName: "Gemini 1.5 Flash", isActive: true }
          );
        } else if (p.code === "openai_compatible") {
          modelsToInsert.push(
            { providerId: p.id, modelIdentifier: "deepseek-v4-flash", displayName: "DeepSeek V4 Flash", isActive: true }
          );
        }
      });

      if (modelsToInsert.length > 0) {
        await prisma?.aiModel.createMany({
          data: modelsToInsert
        });
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to initialize AI settings");
  }
});

// POST /api/ai/settings/configs/test — server-side test connection
router.post("/configs/test", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const userId = getUserId(req);
    const { provider_code, model_identifier } = req.body;
    if (!provider_code) return res.status(400).json({ error: "provider_code is required" });

    const config = await prisma?.userAiConfig.findFirst({
      where: { userId, isEnabled: true },
      include: { provider: true },
      orderBy: { updatedAt: "desc" },
    });
    if (!config || !config.apiKey) {
      return res.status(400).json({ error: "No API key configured for this user" });
    }

    const provider = config.provider;
    const modelId = model_identifier || (provider_code === "openai" ? "gpt-4o-mini" : "gemini-1.5-flash");

    if (provider_code === "openai" || provider_code === "openai_compatible") {
      let baseUrl = provider?.baseUrl || "https://api.openai.com/v1";
      baseUrl = baseUrl.replace(/\/+$/, "");

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        return res.status(400).json({
          error: errData.error?.message || `API Error: ${response.status} ${response.statusText}`,
        });
      }
      return res.json({ success: true });
    }

    if (provider_code === "gemini") {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${config.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: "hi" }] }] }),
          signal: AbortSignal.timeout(15000),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        return res.status(400).json({
          error: errData.error?.message || `API Error: ${response.status} ${response.statusText}`,
        });
      }
      return res.json({ success: true });
    }

    return res.status(400).json({ error: `Unsupported provider: ${provider_code}` });
  } catch (err: any) {
    handleError(res, err, "Connection test failed");
  }
});

// PUT /api/ai/settings/providers/:id
// Regular users may update the base URL for OpenAI Compatible providers.
router.put("/providers/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { base_url } = req.body;
    await prisma?.aiProvider.update({
      where: { id: Number(req.params.id) as any },
      data: { baseUrl: base_url }
    });
    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to update provider");
  }
});

export default router;
